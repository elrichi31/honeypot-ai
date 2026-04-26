import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type {
  CredentialsRankingType, CredentialsMainTab, CredentialsSortDirection,
  CredentialPairRow, UsernameAggregateRow, PasswordAggregateRow,
  SprayPasswordRow, TargetedUsernameRow, DiversifiedAttackerRow, CountOnlyRow,
} from './types.js'
import { parseDate, toNumber, toOffsetISOString, buildAuthWhereSql, buildClauseBlock } from './utils.js'

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

function defaultSortBy(mainTab: CredentialsMainTab, rankingType: CredentialsRankingType) {
  return mainTab === 'recent' ? 'eventTs' : 'attempts'
}

function getRankingOrderSql(rankingType: CredentialsRankingType, sortBy: string, sortDir: CredentialsSortDirection) {
  const d = sortDir === 'asc' ? 'ASC' : 'DESC'
  const col = rankingType === 'pairs'
    ? ({ credentialPair: Prisma.raw(`"username" ${d} NULLS LAST, "password" ${d} NULLS LAST`), attempts: Prisma.raw(`"attempts" ${d}, "lastSeen" DESC`), successCount: Prisma.raw(`"successCount" ${d}, "attempts" DESC`), failedCount: Prisma.raw(`"failedCount" ${d}, "attempts" DESC`), uniqueIps: Prisma.raw(`"uniqueIps" ${d}, "attempts" DESC`), lastSeen: Prisma.raw(`"lastSeen" ${d}, "attempts" DESC`), firstSeen: Prisma.raw(`"firstSeen" ${d}, "attempts" DESC`) }[sortBy] ?? Prisma.raw(`"attempts" DESC, "lastSeen" DESC`))
    : rankingType === 'passwords'
    ? ({ password: Prisma.raw(`"password" ${d} NULLS LAST`), attempts: Prisma.raw(`"attempts" ${d}, "successCount" DESC`), successCount: Prisma.raw(`"successCount" ${d}, "attempts" DESC`), failedCount: Prisma.raw(`"failedCount" ${d}, "attempts" DESC`), usernameCount: Prisma.raw(`"usernameCount" ${d}, "attempts" DESC`), uniqueIps: Prisma.raw(`"uniqueIps" ${d}, "attempts" DESC`) }[sortBy] ?? Prisma.raw(`"attempts" DESC, "successCount" DESC`))
    : ({ username: Prisma.raw(`"username" ${d} NULLS LAST`), attempts: Prisma.raw(`"attempts" ${d}, "successCount" DESC`), successCount: Prisma.raw(`"successCount" ${d}, "attempts" DESC`), failedCount: Prisma.raw(`"failedCount" ${d}, "attempts" DESC`), passwordCount: Prisma.raw(`"passwordCount" ${d}, "attempts" DESC`), uniqueIps: Prisma.raw(`"uniqueIps" ${d}, "attempts" DESC`) }[sortBy] ?? Prisma.raw(`"attempts" DESC, "successCount" DESC`))
  return Prisma.sql`ORDER BY ${col}`
}

function getRecentOrderSql(sortBy: string, sortDir: CredentialsSortDirection) {
  const d = sortDir === 'asc' ? 'ASC' : 'DESC'
  const col = { status: Prisma.raw(`success ${d} NULLS LAST, event_ts DESC`), username: Prisma.raw(`username ${d} NULLS LAST, event_ts DESC`), password: Prisma.raw(`password ${d} NULLS LAST, event_ts DESC`), srcIp: Prisma.raw(`src_ip ${d}, event_ts DESC`), eventTs: Prisma.raw(`event_ts ${d}`) }[sortBy] ?? Prisma.raw(`event_ts DESC`)
  return Prisma.sql`ORDER BY ${col}`
}

export async function credentialsRoute(fastify: FastifyInstance) {
  fastify.get('/stats/credentials', async (request, reply) => {
    const parsed = schema.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid query params', details: parsed.error.flatten().fieldErrors })

    const p = parsed.data
    const startDate = p.startDate ? parseDate(p.startDate, new Date(0)) : undefined
    const endDate = p.endDate ? parseDate(p.endDate, new Date()) : undefined
    const { page, pageSize, offset } = getPagination(p)
    const search = p.search?.trim()
    const activeSortBy = p.sortBy ?? defaultSortBy(p.mainTab, p.rankingType)
    const activeSortDir = p.sortDir
    const rankingSortBy = p.mainTab === 'rankings' ? activeSortBy : defaultSortBy('rankings', p.rankingType)
    const rankingSortDir: CredentialsSortDirection = p.mainTab === 'rankings' ? activeSortDir : 'desc'
    const recentSortBy = p.mainTab === 'recent' ? activeSortBy : 'eventTs'
    const recentSortDir: CredentialsSortDirection = p.mainTab === 'recent' ? activeSortDir : 'desc'

    const authWhere = buildAuthWhereSql({ startDate, endDate })
    const anyCredWhere = buildAuthWhereSql({ startDate, endDate, extra: [Prisma.sql`(username IS NOT NULL OR password IS NOT NULL)`] })
    const userWhere = buildAuthWhereSql({ startDate, endDate, extra: [Prisma.sql`username IS NOT NULL`] })
    const passWhere = buildAuthWhereSql({ startDate, endDate, extra: [Prisma.sql`password IS NOT NULL`] })

    const searchClause = buildSearchClause(search)
    const rankingClauses: Prisma.Sql[] = [Prisma.sql`event_type IN ('auth.success', 'auth.failed')`]
    if (startDate) rankingClauses.push(Prisma.sql`event_ts >= ${startDate}`)
    if (endDate) rankingClauses.push(Prisma.sql`event_ts <= ${endDate}`)
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

    const recentWhere = buildRecentWhere(p.outcome, startDate, endDate, search)
    const recentOrderBy = buildRecentOrderBy(recentSortBy, recentSortDir)

    const [totalAttempts, successfulAttempts, failedAttempts,
      uniqueUsernamesRows, uniquePasswordsRows, uniquePairsRows, repeatedPairsRows,
      sprayPasswordsCountRows, targetedUsernamesCountRows,
      sprayPasswordRows, targetedUsernameRows, diversifiedAttackerRows,
      rankingCountRows, rankingRows, recentAttempts, recentAttemptsTotal] = await Promise.all([
      countAttempts(fastify, 'all', startDate, endDate),
      countAttempts(fastify, 'success', startDate, endDate),
      countAttempts(fastify, 'failed', startDate, endDate),
      fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`SELECT COUNT(DISTINCT username)::int AS count FROM events ${userWhere}`),
      fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`SELECT COUNT(DISTINCT password)::int AS count FROM events ${passWhere}`),
      fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`SELECT COUNT(DISTINCT (COALESCE(username, '<null>') || E'\\x1f' || COALESCE(password, '<null>')))::int AS count FROM events ${anyCredWhere}`),
      fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`SELECT COUNT(*)::int AS count FROM (SELECT 1 FROM events ${anyCredWhere} GROUP BY username, password HAVING COUNT(*) > 1) t`),
      fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`SELECT COUNT(*)::int AS count FROM (SELECT password FROM events ${passWhere} GROUP BY password HAVING COUNT(DISTINCT username) >= 3) t`),
      fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`SELECT COUNT(*)::int AS count FROM (SELECT username FROM events ${userWhere} GROUP BY username HAVING COUNT(DISTINCT password) >= 3) t`),
      fastify.prisma.$queryRaw<SprayPasswordRow[]>(Prisma.sql`SELECT password, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(DISTINCT username)::int AS "usernameCount", COUNT(DISTINCT src_ip)::int AS "ipCount" FROM events ${passWhere} GROUP BY password HAVING COUNT(DISTINCT username) >= 2 ORDER BY "usernameCount" DESC, attempts DESC, "successCount" DESC LIMIT 20`),
      fastify.prisma.$queryRaw<TargetedUsernameRow[]>(Prisma.sql`SELECT username, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(DISTINCT password)::int AS "passwordCount", COUNT(DISTINCT src_ip)::int AS "ipCount" FROM events ${userWhere} GROUP BY username HAVING COUNT(DISTINCT password) >= 2 ORDER BY "passwordCount" DESC, attempts DESC, "successCount" DESC LIMIT 20`),
      fastify.prisma.$queryRaw<DiversifiedAttackerRow[]>(Prisma.sql`SELECT src_ip AS "srcIp", COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(DISTINCT (COALESCE(username, '<null>') || E'\\x1f' || COALESCE(password, '<null>')))::int AS "credentialCount", COUNT(DISTINCT username)::int AS "usernameCount", COUNT(DISTINCT password)::int AS "passwordCount", MAX(event_ts) AS "lastSeen" FROM events ${authWhere} GROUP BY src_ip HAVING COUNT(*) >= 2 ORDER BY "credentialCount" DESC, attempts DESC, "successCount" DESC LIMIT 20`),
      buildCountQuery(fastify, p.rankingType, rankingClauses, havingClauses),
      buildRankingQuery(fastify, p.rankingType, rankingClauses, havingClauses, rankingSortBy, rankingSortDir, pageSize, offset),
      fastify.prisma.event.findMany({ where: recentWhere, orderBy: recentOrderBy, take: pageSize, skip: offset }),
      fastify.prisma.event.count({ where: recentWhere }),
    ])

    const rankingTotal = toNumber(rankingCountRows[0]?.count)
    const rankingTotalPages = rankingTotal === 0 ? 1 : Math.ceil(rankingTotal / pageSize)
    const recentTotalPages = recentAttemptsTotal === 0 ? 1 : Math.ceil(recentAttemptsTotal / pageSize)

    return {
      summary: { totalAttempts, successfulAttempts, failedAttempts, uniqueUsernames: toNumber(uniqueUsernamesRows[0]?.count), uniquePasswords: toNumber(uniquePasswordsRows[0]?.count), uniqueCredentialPairs: toNumber(uniquePairsRows[0]?.count), repeatedCredentialPairs: toNumber(repeatedPairsRows[0]?.count), sprayPasswords: toNumber(sprayPasswordsCountRows[0]?.count), targetedUsernames: toNumber(targetedUsernamesCountRows[0]?.count), successRate: totalAttempts > 0 ? successfulAttempts / totalAttempts : 0 },
      sprayPasswords: sprayPasswordRows.map(r => ({ password: r.password, attempts: toNumber(r.attempts), successCount: toNumber(r.successCount), usernameCount: toNumber(r.usernameCount), ipCount: toNumber(r.ipCount) })),
      targetedUsernames: targetedUsernameRows.map(r => ({ username: r.username, attempts: toNumber(r.attempts), successCount: toNumber(r.successCount), passwordCount: toNumber(r.passwordCount), ipCount: toNumber(r.ipCount) })),
      diversifiedAttackers: diversifiedAttackerRows.map(r => ({ srcIp: r.srcIp, attempts: toNumber(r.attempts), successCount: toNumber(r.successCount), credentialCount: toNumber(r.credentialCount), usernameCount: toNumber(r.usernameCount), passwordCount: toNumber(r.passwordCount), lastSeen: toOffsetISOString(r.lastSeen) })),
      rankingsPage: { items: mapRankingItems(p.rankingType, rankingRows), pagination: { page, pageSize, total: rankingTotal, totalPages: rankingTotalPages, hasNextPage: page < rankingTotalPages, hasPreviousPage: page > 1 }, sortBy: rankingSortBy, sortDir: rankingSortDir },
      recentAttemptsPage: { items: recentAttempts.map(e => ({ ...e, eventTs: toOffsetISOString(e.eventTs), createdAt: toOffsetISOString(e.createdAt), cowrieTs: toOffsetISOString(new Date(e.cowrieTs as string)) })), pagination: { page, pageSize, total: recentAttemptsTotal, totalPages: recentTotalPages, hasNextPage: page < recentTotalPages, hasPreviousPage: page > 1 }, sortBy: recentSortBy, sortDir: recentSortDir },
      current: { mainTab: p.mainTab, rankingType: p.rankingType, outcome: p.outcome, frequency: p.frequency, search: search ?? '', sortBy: activeSortBy, sortDir: activeSortDir },
    }
  })
}

function countAttempts(fastify: FastifyInstance, type: 'all' | 'success' | 'failed', startDate?: Date, endDate?: Date) {
  const where = {
    eventType: type === 'all' ? { in: ['auth.success', 'auth.failed'] } : type === 'success' ? 'auth.success' : 'auth.failed',
    ...((startDate || endDate) ? { eventTs: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } } : {}),
  }
  return fastify.prisma.event.count({ where })
}

function buildRecentWhere(outcome: string, startDate?: Date, endDate?: Date, search?: string) {
  return {
    eventType: { in: outcome === 'success' ? ['auth.success'] : outcome === 'failed' ? ['auth.failed'] : ['auth.success', 'auth.failed'] },
    ...((startDate || endDate) ? { eventTs: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } } : {}),
    ...(search ? { OR: [{ srcIp: { startsWith: search, mode: 'insensitive' as const } }, { username: { contains: search, mode: 'insensitive' as const } }, { password: { contains: search, mode: 'insensitive' as const } }] } : {}),
  }
}

function buildRecentOrderBy(sortBy: string, sortDir: CredentialsSortDirection) {
  const d = sortDir as 'asc' | 'desc'
  return sortBy === 'status' ? [{ success: d }, { eventTs: 'desc' as const }]
    : sortBy === 'username' ? [{ username: d }, { eventTs: 'desc' as const }]
    : sortBy === 'password' ? [{ password: d }, { eventTs: 'desc' as const }]
    : sortBy === 'srcIp' ? [{ srcIp: d }, { eventTs: 'desc' as const }]
    : [{ eventTs: d }]
}

function buildCountQuery(fastify: FastifyInstance, rankingType: CredentialsRankingType, rankingClauses: Prisma.Sql[], havingClauses: Prisma.Sql[]) {
  const w = buildClauseBlock('WHERE', rankingClauses)
  const h = buildClauseBlock('HAVING', havingClauses)
  if (rankingType === 'pairs') return fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`WITH grouped AS (SELECT username, password, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount", COUNT(DISTINCT src_ip)::int AS "uniqueIps", MIN(event_ts) AS "firstSeen", MAX(event_ts) AS "lastSeen" FROM events ${w} GROUP BY username, password ${h}) SELECT COUNT(*)::int AS count FROM grouped`)
  if (rankingType === 'passwords') return fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`WITH grouped AS (SELECT password, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount", COUNT(DISTINCT src_ip)::int AS "uniqueIps", COUNT(DISTINCT username)::int AS "usernameCount" FROM events ${w} GROUP BY password ${h}) SELECT COUNT(*)::int AS count FROM grouped`)
  return fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`WITH grouped AS (SELECT username, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount", COUNT(DISTINCT src_ip)::int AS "uniqueIps", COUNT(DISTINCT password)::int AS "passwordCount" FROM events ${w} GROUP BY username ${h}) SELECT COUNT(*)::int AS count FROM grouped`)
}

function buildRankingQuery(fastify: FastifyInstance, rankingType: CredentialsRankingType, rankingClauses: Prisma.Sql[], havingClauses: Prisma.Sql[], sortBy: string, sortDir: CredentialsSortDirection, pageSize: number, offset: number) {
  const w = buildClauseBlock('WHERE', rankingClauses)
  const h = buildClauseBlock('HAVING', havingClauses)
  const o = getRankingOrderSql(rankingType, sortBy, sortDir)
  if (rankingType === 'pairs') return fastify.prisma.$queryRaw<CredentialPairRow[]>(Prisma.sql`WITH grouped AS (SELECT username, password, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount", COUNT(DISTINCT src_ip)::int AS "uniqueIps", MIN(event_ts) AS "firstSeen", MAX(event_ts) AS "lastSeen" FROM events ${w} GROUP BY username, password ${h}) SELECT * FROM grouped ${o} LIMIT ${pageSize} OFFSET ${offset}`)
  if (rankingType === 'passwords') return fastify.prisma.$queryRaw<PasswordAggregateRow[]>(Prisma.sql`WITH grouped AS (SELECT password, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount", COUNT(DISTINCT src_ip)::int AS "uniqueIps", COUNT(DISTINCT username)::int AS "usernameCount" FROM events ${w} GROUP BY password ${h}) SELECT * FROM grouped ${o} LIMIT ${pageSize} OFFSET ${offset}`)
  return fastify.prisma.$queryRaw<UsernameAggregateRow[]>(Prisma.sql`WITH grouped AS (SELECT username, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount", COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount", COUNT(DISTINCT src_ip)::int AS "uniqueIps", COUNT(DISTINCT password)::int AS "passwordCount" FROM events ${w} GROUP BY username ${h}) SELECT * FROM grouped ${o} LIMIT ${pageSize} OFFSET ${offset}`)
}

function mapRankingItems(rankingType: CredentialsRankingType, rows: unknown) {
  if (rankingType === 'pairs') return (rows as CredentialPairRow[]).map(r => ({ username: r.username, password: r.password, attempts: toNumber(r.attempts), successCount: toNumber(r.successCount), failedCount: toNumber(r.failedCount), uniqueIps: toNumber(r.uniqueIps), firstSeen: toOffsetISOString(r.firstSeen), lastSeen: toOffsetISOString(r.lastSeen) }))
  if (rankingType === 'passwords') return (rows as PasswordAggregateRow[]).map(r => ({ password: r.password, attempts: toNumber(r.attempts), successCount: toNumber(r.successCount), failedCount: toNumber(r.failedCount), uniqueIps: toNumber(r.uniqueIps), usernameCount: toNumber(r.usernameCount) }))
  return (rows as UsernameAggregateRow[]).map(r => ({ username: r.username, attempts: toNumber(r.attempts), successCount: toNumber(r.successCount), failedCount: toNumber(r.failedCount), uniqueIps: toNumber(r.uniqueIps), passwordCount: toNumber(r.passwordCount) }))
}
