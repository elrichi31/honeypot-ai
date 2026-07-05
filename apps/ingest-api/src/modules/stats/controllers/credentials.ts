import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type {
  CredentialsRankingType, CredentialsMainTab, CredentialsSortDirection,
  CredentialPairRow, UsernameAggregateRow, PasswordAggregateRow,
  SprayPasswordRow, TargetedUsernameRow, DiversifiedAttackerRow, CountOnlyRow,
} from '../stats.types.js'
import { parseDate, toNumber, toOffsetISOString, buildAuthWhereSql, buildClauseBlock, eventScopeClause, eventScopeWhere, protocolClause, type EventScope } from '../stats.utils.js'
import { withCache } from '../../../lib/cache-helper.js'
import { resolveClientSensors } from '../../../lib/client-helpers.js'
import { CredentialsRepository } from '../stats.repository.js'

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

const schema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
  recentLimit: z.coerce.number().int().min(1).max(1000).default(20),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  mainTab: z.enum(['rankings', 'patterns', 'recent']).default('rankings'),
  rankingType: z.enum(['pairs', 'passwords', 'usernames']).default('pairs'),
  outcome: z.enum(['all', 'success', 'failed']).default('all'),
  frequency: z.enum(['all', 'reused', 'single']).default('reused'),
  search: z.string().trim().optional(),
  sortBy: z.string().trim().optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  clientSlug: z.string().trim().min(1).optional(),
  sensorId: z.string().trim().min(1).optional(),
  protocol: z.string().trim().min(1).optional(),
})

type Params = z.infer<typeof schema>

function getPagination(params: Params) {
  const pageSize = Math.min(params.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const page = params.page ?? 1
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function buildSearchClause(search?: string) {
  if (!search?.trim()) return null
  const wildcard = `%${search.trim()}%`
  const ipPrefix = /^[0-9a-fA-F:.]+$/.test(search.trim()) ? `${search.trim()}%` : wildcard
  return Prisma.sql`(COALESCE(username, '') ILIKE ${wildcard} OR COALESCE(password, '') ILIKE ${wildcard} OR src_ip ILIKE ${ipPrefix})`
}

function defaultSortBy(mainTab: CredentialsMainTab) {
  return mainTab === 'recent' ? 'eventTs' : 'attempts'
}

function getRankingOrderSql(rankingType: CredentialsRankingType, sortBy: string, sortDir: CredentialsSortDirection) {
  const d = sortDir === 'asc' ? 'ASC' : 'DESC'

  const colMaps: Record<CredentialsRankingType, Record<string, string>> = {
    pairs: {
      credentialPair: `"username" ${d} NULLS LAST, "password" ${d} NULLS LAST`,
      attempts:       `"attempts" ${d}, "lastSeen" DESC`,
      successCount:   `"successCount" ${d}, "attempts" DESC`,
      failedCount:    `"failedCount" ${d}, "attempts" DESC`,
      uniqueIps:      `"uniqueIps" ${d}, "attempts" DESC`,
      lastSeen:       `"lastSeen" ${d}, "attempts" DESC`,
      firstSeen:      `"firstSeen" ${d}, "attempts" DESC`,
    },
    passwords: {
      password:      `"password" ${d} NULLS LAST`,
      attempts:      `"attempts" ${d}, "successCount" DESC`,
      successCount:  `"successCount" ${d}, "attempts" DESC`,
      failedCount:   `"failedCount" ${d}, "attempts" DESC`,
      usernameCount: `"usernameCount" ${d}, "attempts" DESC`,
      uniqueIps:     `"uniqueIps" ${d}, "attempts" DESC`,
    },
    usernames: {
      username:      `"username" ${d} NULLS LAST`,
      attempts:      `"attempts" ${d}, "successCount" DESC`,
      successCount:  `"successCount" ${d}, "attempts" DESC`,
      failedCount:   `"failedCount" ${d}, "attempts" DESC`,
      passwordCount: `"passwordCount" ${d}, "attempts" DESC`,
      uniqueIps:     `"uniqueIps" ${d}, "attempts" DESC`,
    },
  }

  const defaults: Record<CredentialsRankingType, string> = {
    pairs:     `"attempts" DESC, "lastSeen" DESC`,
    passwords: `"attempts" DESC, "successCount" DESC`,
    usernames: `"attempts" DESC, "successCount" DESC`,
  }

  const col = colMaps[rankingType]?.[sortBy] ?? defaults[rankingType]
  return Prisma.sql`ORDER BY ${Prisma.raw(col)}`
}

type RecentRow = {
  event_ts: Date; src_ip: string; username: string | null
  password: string | null; success: boolean | null; protocol: string
}

function buildRecentWhere(
  outcome: string, startDate?: Date, endDate?: Date, search?: string,
  scope?: Prisma.Sql | null, protocol?: string,
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [Prisma.sql`1 = 1`]
  if (outcome === 'success') clauses.push(Prisma.sql`success IS TRUE`)
  else if (outcome === 'failed') clauses.push(Prisma.sql`success IS DISTINCT FROM TRUE`)
  if (startDate) clauses.push(Prisma.sql`event_ts >= ${startDate}`)
  if (endDate) clauses.push(Prisma.sql`event_ts <= ${endDate}`)
  if (scope) clauses.push(scope)
  if (protocol) clauses.push(Prisma.sql`protocol = ${protocol}`)
  if (search) {
    const wildcard = `%${search}%`
    clauses.push(Prisma.sql`(COALESCE(username,'') ILIKE ${wildcard} OR COALESCE(password,'') ILIKE ${wildcard} OR src_ip ILIKE ${`${search}%`})`)
  }
  return buildClauseBlock('WHERE', clauses)
}

function buildRecentOrderBy(sortBy: string, sortDir: CredentialsSortDirection): Prisma.Sql {
  const d = sortDir === 'asc' ? Prisma.raw('ASC') : Prisma.raw('DESC')
  const col = sortBy === 'status' ? Prisma.raw('success')
    : sortBy === 'username' ? Prisma.raw('username')
      : sortBy === 'password' ? Prisma.raw('password')
        : sortBy === 'srcIp' ? Prisma.raw('src_ip')
          : Prisma.raw('event_ts')
  return Prisma.sql`ORDER BY ${col} ${d}, event_ts DESC`
}

function buildCountQuery(repo: CredentialsRepository, rankingType: CredentialsRankingType, rankingClauses: Prisma.Sql[], havingClauses: Prisma.Sql[]) {
  const w = buildClauseBlock('WHERE', rankingClauses)
  const h = buildClauseBlock('HAVING', havingClauses)
  if (rankingType === 'pairs') return repo.queryRaw<CountOnlyRow>(Prisma.sql`WITH grouped AS (SELECT username, password, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount", COUNT(DISTINCT src_ip)::int AS "uniqueIps", MIN(event_ts) AS "firstSeen", MAX(event_ts) AS "lastSeen" FROM credential_attempts ${w} GROUP BY username, password ${h}) SELECT COUNT(*)::int AS count FROM grouped`)
  if (rankingType === 'passwords') return repo.queryRaw<CountOnlyRow>(Prisma.sql`WITH grouped AS (SELECT password, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount", COUNT(DISTINCT src_ip)::int AS "uniqueIps", COUNT(DISTINCT username)::int AS "usernameCount" FROM credential_attempts ${w} GROUP BY password ${h}) SELECT COUNT(*)::int AS count FROM grouped`)
  return repo.queryRaw<CountOnlyRow>(Prisma.sql`WITH grouped AS (SELECT username, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount", COUNT(DISTINCT src_ip)::int AS "uniqueIps", COUNT(DISTINCT password)::int AS "passwordCount" FROM credential_attempts ${w} GROUP BY username ${h}) SELECT COUNT(*)::int AS count FROM grouped`)
}

function buildRankingQuery(repo: CredentialsRepository, rankingType: CredentialsRankingType, rankingClauses: Prisma.Sql[], havingClauses: Prisma.Sql[], sortBy: string, sortDir: CredentialsSortDirection, pageSize: number, offset: number) {
  const w = buildClauseBlock('WHERE', rankingClauses)
  const h = buildClauseBlock('HAVING', havingClauses)
  const o = getRankingOrderSql(rankingType, sortBy, sortDir)
  if (rankingType === 'pairs') return repo.queryRaw<CredentialPairRow>(Prisma.sql`WITH grouped AS (SELECT username, password, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount", COUNT(DISTINCT src_ip)::int AS "uniqueIps", MIN(event_ts) AS "firstSeen", MAX(event_ts) AS "lastSeen" FROM credential_attempts ${w} GROUP BY username, password ${h}) SELECT * FROM grouped ${o} LIMIT ${pageSize} OFFSET ${offset}`)
  if (rankingType === 'passwords') return repo.queryRaw<PasswordAggregateRow>(Prisma.sql`WITH grouped AS (SELECT password, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount", COUNT(DISTINCT src_ip)::int AS "uniqueIps", COUNT(DISTINCT username)::int AS "usernameCount" FROM credential_attempts ${w} GROUP BY password ${h}) SELECT * FROM grouped ${o} LIMIT ${pageSize} OFFSET ${offset}`)
  return repo.queryRaw<UsernameAggregateRow>(Prisma.sql`WITH grouped AS (SELECT username, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount", COUNT(DISTINCT src_ip)::int AS "uniqueIps", COUNT(DISTINCT password)::int AS "passwordCount" FROM credential_attempts ${w} GROUP BY username ${h}) SELECT * FROM grouped ${o} LIMIT ${pageSize} OFFSET ${offset}`)
}

function mapRankingItems(rankingType: CredentialsRankingType, rows: unknown) {
  if (rankingType === 'pairs') return (rows as CredentialPairRow[]).map(r => ({ username: r.username, password: r.password, attempts: toNumber(r.attempts), successCount: toNumber(r.successCount), failedCount: toNumber(r.failedCount), uniqueIps: toNumber(r.uniqueIps), firstSeen: toOffsetISOString(r.firstSeen), lastSeen: toOffsetISOString(r.lastSeen) }))
  if (rankingType === 'passwords') return (rows as PasswordAggregateRow[]).map(r => ({ password: r.password, attempts: toNumber(r.attempts), successCount: toNumber(r.successCount), failedCount: toNumber(r.failedCount), uniqueIps: toNumber(r.uniqueIps), usernameCount: toNumber(r.usernameCount) }))
  return (rows as UsernameAggregateRow[]).map(r => ({ username: r.username, attempts: toNumber(r.attempts), successCount: toNumber(r.successCount), failedCount: toNumber(r.failedCount), uniqueIps: toNumber(r.uniqueIps), passwordCount: toNumber(r.passwordCount) }))
}

export async function credentialsRoute(fastify: FastifyInstance) {
  const repo = new CredentialsRepository(fastify.prismaRead)

  fastify.get('/stats/credentials', async (request, reply) => {
    const parsed = schema.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid query params', details: parsed.error.flatten().fieldErrors })

    const p = parsed.data
    const startDate = p.startDate ? parseDate(p.startDate, new Date(0)) : undefined
    const endDate = p.endDate ? parseDate(p.endDate, new Date()) : undefined
    const { page, pageSize, offset } = getPagination(p)
    const search = p.search?.trim()

    let scope: EventScope
    let scopeKey = ''
    if (p.sensorId) {
      scope = { sensorIds: [p.sensorId] }
      scopeKey = `:s=${p.sensorId}`
    } else if (p.clientSlug) {
      const cs = await resolveClientSensors(fastify.prismaRead, p.clientSlug)
      scope = { sensorIds: cs?.sensorIds ?? [] }
      scopeKey = `:c=${p.clientSlug}`
    }
    const recentScopeWhere = eventScopeWhere(scope)
    const activeSortBy = p.sortBy ?? defaultSortBy(p.mainTab)
    const activeSortDir = p.sortDir
    const rankingSortBy = p.mainTab === 'rankings' ? activeSortBy : defaultSortBy('rankings')
    const rankingSortDir: CredentialsSortDirection = p.mainTab === 'rankings' ? activeSortDir : 'desc'
    const recentSortBy = p.mainTab === 'recent' ? activeSortBy : 'eventTs'
    const recentSortDir: CredentialsSortDirection = p.mainTab === 'recent' ? activeSortDir : 'desc'

    const cacheKey = `credentials${scopeKey}:${JSON.stringify({ mainTab: p.mainTab, rankingType: p.rankingType, outcome: p.outcome, frequency: p.frequency, search: search ?? '', sortBy: activeSortBy, sortDir: activeSortDir, page, pageSize, startDate: p.startDate ?? '', endDate: p.endDate ?? '' })}`

    return withCache(fastify.cache, cacheKey, 600, async () => {
      const proto = p.protocol
      const authWhere = buildAuthWhereSql({ startDate, endDate, scope, protocol: proto })
      const anyCredWhere = buildAuthWhereSql({ startDate, endDate, scope, protocol: proto, extra: [Prisma.sql`(username IS NOT NULL OR password IS NOT NULL)`] })
      const userWhere = buildAuthWhereSql({ startDate, endDate, scope, protocol: proto, extra: [Prisma.sql`username IS NOT NULL`] })
      const passWhere = buildAuthWhereSql({ startDate, endDate, scope, protocol: proto, extra: [Prisma.sql`password IS NOT NULL`] })

      const searchClause = buildSearchClause(search)
      const scopeClause = eventScopeClause(scope)
      const protoClause = protocolClause(proto)
      const rankingClauses: Prisma.Sql[] = [Prisma.sql`1 = 1`]
      if (startDate) rankingClauses.push(Prisma.sql`event_ts >= ${startDate}`)
      if (endDate) rankingClauses.push(Prisma.sql`event_ts <= ${endDate}`)
      if (scopeClause) rankingClauses.push(scopeClause)
      if (protoClause) rankingClauses.push(protoClause)
      if (searchClause) rankingClauses.push(searchClause)
      if (p.rankingType === 'pairs') rankingClauses.push(Prisma.sql`(username IS NOT NULL OR password IS NOT NULL)`)
      else if (p.rankingType === 'passwords') rankingClauses.push(Prisma.sql`password IS NOT NULL`)
      else rankingClauses.push(Prisma.sql`username IS NOT NULL`)

      const havingClauses: Prisma.Sql[] = [Prisma.sql`1 = 1`]
      if (p.outcome === 'success') havingClauses.push(Prisma.sql`COUNT(*) FILTER (WHERE success IS TRUE) > 0`)
      else if (p.outcome === 'failed') havingClauses.push(Prisma.sql`COUNT(*) FILTER (WHERE success IS FALSE) > 0`)
      if (p.rankingType === 'pairs') {
        if (p.frequency === 'reused') havingClauses.push(Prisma.sql`COUNT(*) > 1`)
        else if (p.frequency === 'single') havingClauses.push(Prisma.sql`COUNT(*) = 1`)
      }

      const recentWhere = buildRecentWhere(p.outcome, startDate, endDate, search, recentScopeWhere, proto)
      const recentOrderBy = buildRecentOrderBy(recentSortBy, recentSortDir)

      const wantRankings = p.mainTab === 'rankings'
      const wantPatterns = p.mainTab === 'patterns'
      const wantRecent = p.mainTab === 'recent'

      const [totalAttempts, successfulAttempts, failedAttempts,
        uniqueUsernamesRows, uniquePasswordsRows, uniquePairsRows, repeatedPairsRows,
        sprayPasswordsCountRows, targetedUsernamesCountRows,
        sprayPasswordRows, targetedUsernameRows, diversifiedAttackerRows,
        rankingCountRows, rankingRows, recentAttempts, recentAttemptsTotal] = await Promise.all([
        repo.countAttempts('all', authWhere),
        repo.countAttempts('success', authWhere),
        repo.countAttempts('failed', authWhere),
        repo.queryRaw<CountOnlyRow>(Prisma.sql`SELECT COUNT(DISTINCT username)::int AS count FROM credential_attempts ${userWhere}`),
        repo.queryRaw<CountOnlyRow>(Prisma.sql`SELECT COUNT(DISTINCT password)::int AS count FROM credential_attempts ${passWhere}`),
        repo.queryRaw<CountOnlyRow>(Prisma.sql`SELECT COUNT(DISTINCT (COALESCE(username, '<null>') || E'\\x1f' || COALESCE(password, '<null>')))::int AS count FROM credential_attempts ${anyCredWhere}`),
        repo.queryRaw<CountOnlyRow>(Prisma.sql`SELECT COUNT(*)::int AS count FROM (SELECT 1 FROM credential_attempts ${anyCredWhere} GROUP BY username, password HAVING COUNT(*) > 1) t`),
        repo.queryRaw<CountOnlyRow>(Prisma.sql`SELECT COUNT(*)::int AS count FROM (SELECT password FROM credential_attempts ${passWhere} GROUP BY password HAVING COUNT(DISTINCT username) >= 3) t`),
        repo.queryRaw<CountOnlyRow>(Prisma.sql`SELECT COUNT(*)::int AS count FROM (SELECT username FROM credential_attempts ${userWhere} GROUP BY username HAVING COUNT(DISTINCT password) >= 3) t`),
        wantPatterns
          ? repo.queryRaw<SprayPasswordRow>(Prisma.sql`SELECT password, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(DISTINCT username)::int AS "usernameCount", COUNT(DISTINCT src_ip)::int AS "ipCount" FROM credential_attempts ${passWhere} GROUP BY password HAVING COUNT(DISTINCT username) >= 2 ORDER BY "usernameCount" DESC, attempts DESC, "successCount" DESC LIMIT 20`)
          : Promise.resolve([] as SprayPasswordRow[]),
        wantPatterns
          ? repo.queryRaw<TargetedUsernameRow>(Prisma.sql`SELECT username, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(DISTINCT password)::int AS "passwordCount", COUNT(DISTINCT src_ip)::int AS "ipCount" FROM credential_attempts ${userWhere} GROUP BY username HAVING COUNT(DISTINCT password) >= 2 ORDER BY "passwordCount" DESC, attempts DESC, "successCount" DESC LIMIT 20`)
          : Promise.resolve([] as TargetedUsernameRow[]),
        wantPatterns
          ? repo.queryRaw<DiversifiedAttackerRow>(Prisma.sql`SELECT src_ip AS "srcIp", COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(DISTINCT (COALESCE(username, '<null>') || E'\\x1f' || COALESCE(password, '<null>')))::int AS "credentialCount", COUNT(DISTINCT username)::int AS "usernameCount", COUNT(DISTINCT password)::int AS "passwordCount", MAX(event_ts) AS "lastSeen" FROM credential_attempts ${authWhere} GROUP BY src_ip HAVING COUNT(*) >= 2 ORDER BY "credentialCount" DESC, attempts DESC, "successCount" DESC LIMIT 20`)
          : Promise.resolve([] as DiversifiedAttackerRow[]),
        wantRankings
          ? buildCountQuery(repo, p.rankingType, rankingClauses, havingClauses)
          : Promise.resolve([] as CountOnlyRow[]),
        wantRankings
          ? buildRankingQuery(repo, p.rankingType, rankingClauses, havingClauses, rankingSortBy, rankingSortDir, pageSize, offset)
          : Promise.resolve([] as CredentialPairRow[]),
        wantRecent
          ? repo.queryRaw<RecentRow>(Prisma.sql`
              SELECT event_ts, src_ip, username, password, success, protocol
              FROM credential_attempts ${recentWhere} ${recentOrderBy}
              LIMIT ${pageSize} OFFSET ${offset}`)
          : Promise.resolve([] as RecentRow[]),
        wantRecent
          ? repo.queryRaw<CountOnlyRow>(Prisma.sql`SELECT COUNT(*)::int AS count FROM credential_attempts ${recentWhere}`).then(r => toNumber(r[0]?.count))
          : Promise.resolve(0),
      ])

      const rankingTotal = toNumber(rankingCountRows[0]?.count)
      const rankingTotalPages = rankingTotal === 0 ? 1 : Math.ceil(rankingTotal / pageSize)
      const recentTotalPages = (recentAttemptsTotal as number) === 0 ? 1 : Math.ceil((recentAttemptsTotal as number) / pageSize)

      return {
        summary: { totalAttempts, successfulAttempts, failedAttempts, uniqueUsernames: toNumber(uniqueUsernamesRows[0]?.count), uniquePasswords: toNumber(uniquePasswordsRows[0]?.count), uniqueCredentialPairs: toNumber(uniquePairsRows[0]?.count), repeatedCredentialPairs: toNumber(repeatedPairsRows[0]?.count), sprayPasswords: toNumber(sprayPasswordsCountRows[0]?.count), targetedUsernames: toNumber(targetedUsernamesCountRows[0]?.count), successRate: totalAttempts > 0 ? successfulAttempts / totalAttempts : 0 },
        sprayPasswords: (sprayPasswordRows as SprayPasswordRow[]).map(r => ({ password: r.password, attempts: toNumber(r.attempts), successCount: toNumber(r.successCount), usernameCount: toNumber(r.usernameCount), ipCount: toNumber(r.ipCount) })),
        targetedUsernames: (targetedUsernameRows as TargetedUsernameRow[]).map(r => ({ username: r.username, attempts: toNumber(r.attempts), successCount: toNumber(r.successCount), passwordCount: toNumber(r.passwordCount), ipCount: toNumber(r.ipCount) })),
        diversifiedAttackers: (diversifiedAttackerRows as DiversifiedAttackerRow[]).map(r => ({ srcIp: r.srcIp, attempts: toNumber(r.attempts), successCount: toNumber(r.successCount), credentialCount: toNumber(r.credentialCount), usernameCount: toNumber(r.usernameCount), passwordCount: toNumber(r.passwordCount), lastSeen: toOffsetISOString(r.lastSeen) })),
        rankingsPage: { items: mapRankingItems(p.rankingType, rankingRows), pagination: { page, pageSize, total: rankingTotal, totalPages: rankingTotalPages, hasNextPage: page < rankingTotalPages, hasPreviousPage: page > 1 }, sortBy: rankingSortBy, sortDir: rankingSortDir },
        recentAttemptsPage: { items: (recentAttempts as RecentRow[]).map(e => ({
          srcIp: e.src_ip,
          username: e.username,
          password: e.password,
          success: e.success,
          protocol: e.protocol,
          eventTs: toOffsetISOString(e.event_ts),
        })), pagination: { page, pageSize, total: recentAttemptsTotal as number, totalPages: recentTotalPages, hasNextPage: page < recentTotalPages, hasPreviousPage: page > 1 }, sortBy: recentSortBy, sortDir: recentSortDir },
        current: { mainTab: p.mainTab, rankingType: p.rankingType, outcome: p.outcome, frequency: p.frequency, search: search ?? '', sortBy: activeSortBy, sortDir: activeSortDir },
      }
    })
  })
}
