import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { computeRiskScore, classifyCommands } from '../lib/risk-score.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 5000;

const threatListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().min(1).optional(),
  level: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).optional(),
  crossProtocol: z.coerce.boolean().optional(),
});

export async function threatRoutes(fastify: FastifyInstance) {

  /**
   * GET /threats
   *
   * Returns ALL unique attacker IPs (SSH + web) enriched with:
   *   - Risk score + level
   *   - Which protocols they used
   *   - Command categories detected
   *   - Cross-protocol flag
   *
   * Sorted by risk score DESC.
   */
  fastify.get('/threats', async (request, reply) => {
    const parsed = threatListQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query params',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const pageSize = Math.min(
      parsed.data.pageSize ?? parsed.data.limit ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const offset = parsed.data.offset ?? ((parsed.data.page ?? 1) - 1) * pageSize;
    const page = parsed.data.page ?? Math.floor(offset / pageSize) + 1;
    const search = parsed.data.q?.toLowerCase();

    // ── 1. Aggregate SSH data per IP ─────────────────────────────────────────
    const sshRows = await fastify.prisma.$queryRaw<Array<{
      src_ip:        string;
      sessions:      bigint;
      auth_attempts: bigint;
      had_success:   boolean;
    }>>`
      SELECT
        s.src_ip,
        COUNT(DISTINCT s.id)                                      AS sessions,
        COUNT(e.id) FILTER (WHERE e.event_type IN ('auth.success','auth.failed')) AS auth_attempts,
        BOOL_OR(s.login_success)                                  AS had_success
      FROM sessions s
      LEFT JOIN events e ON e.session_id = s.id
      GROUP BY s.src_ip
    `;

    // ── 2. Fetch commands per IP (for classification) ─────────────────────────
    const cmdRows = await fastify.prisma.$queryRaw<Array<{
      src_ip:  string;
      command: string;
    }>>`
      SELECT DISTINCT e.src_ip, e.command
      FROM events e
      WHERE e.event_type = 'command.input'
        AND e.command IS NOT NULL
    `;

    const cmdsByIp = new Map<string, string[]>();
    for (const r of cmdRows) {
      if (!cmdsByIp.has(r.src_ip)) cmdsByIp.set(r.src_ip, []);
      cmdsByIp.get(r.src_ip)!.push(r.command);
    }

    // ── 3. Aggregate web data per IP ──────────────────────────────────────────
    const webRows = await fastify.prisma.$queryRaw<Array<{
      src_ip:       string;
      total_hits:   bigint;
      attack_types: string[];
    }>>`
      SELECT
        src_ip,
        COUNT(*)                        AS total_hits,
        ARRAY_AGG(DISTINCT attack_type) AS attack_types
      FROM web_hits
      GROUP BY src_ip
    `;

    // ── 4. Build lookup maps ───────────────────────────────────────────────────
    const sshMap = new Map(sshRows.map(r => [r.src_ip, r]));
    const webMap = new Map(webRows.map(r => [r.src_ip, r]));

    const allIps = new Set([...sshMap.keys(), ...webMap.keys()]);

    // ── 5. Score every IP ─────────────────────────────────────────────────────
    const threats = Array.from(allIps).map(ip => {
      const ssh  = sshMap.get(ip);
      const web  = webMap.get(ip);
      const cmds = cmdsByIp.get(ip) ?? [];

      const crossProtocol = !!ssh && !!web;

      const risk = computeRiskScore({
        sshSessions:     Number(ssh?.sessions ?? 0),
        sshAuthAttempts: Number(ssh?.auth_attempts ?? 0),
        sshLoginSuccess: ssh?.had_success ?? false,
        commands:        cmds,
        webHits:         Number(web?.total_hits ?? 0),
        webAttackTypes:  web?.attack_types ?? [],
        crossProtocol,
      });

      return {
        ip,
        // protocols
        ssh: ssh ? {
          sessions:     Number(ssh.sessions),
          authAttempts: Number(ssh.auth_attempts),
          loginSuccess: ssh.had_success,
          commandCount: cmds.length,
        } : null,
        web: web ? {
          hits:        Number(web.total_hits),
          attackTypes: web.attack_types,
        } : null,
        crossProtocol,
        // risk
        score:             risk.score,
        level:             risk.level,
        breakdown:         risk.breakdown,
        commandCategories: Object.fromEntries(
          Object.entries(risk.commandCategories).map(([k, v]) => [k, v.length])
        ),
        topFactors: risk.topFactors,
      };
    });

    threats.sort((a, b) => b.score - a.score);

    const filteredThreats = threats.filter((threat) => {
      if (search && !threat.ip.toLowerCase().includes(search)) return false;
      if (parsed.data.level && threat.level !== parsed.data.level) return false;
      if (
        parsed.data.crossProtocol !== undefined &&
        threat.crossProtocol !== parsed.data.crossProtocol
      ) {
        return false;
      }
      return true;
    });

    const total = filteredThreats.length;
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
    const items = filteredThreats.slice(offset, offset + pageSize);

    return reply.send({
      items,
      summary: {
        total,
        critical: filteredThreats.filter((threat) => threat.level === 'CRITICAL').length,
        high: filteredThreats.filter((threat) => threat.level === 'HIGH').length,
        crossProtocol: filteredThreats.filter((threat) => threat.crossProtocol).length,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  });

  /**
   * GET /threats/:ip
   *
   * Full detail for one IP: risk breakdown + all classified commands.
   */
  fastify.get('/threats/:ip', async (request, reply) => {
    const { ip } = request.params as { ip: string };

    const [sshRows, cmdRows, webRows] = await Promise.all([
      fastify.prisma.$queryRaw<Array<{
        sessions: bigint; auth_attempts: bigint; had_success: boolean;
      }>>`
        SELECT
          COUNT(DISTINCT s.id) AS sessions,
          COUNT(e.id) FILTER (WHERE e.event_type IN ('auth.success','auth.failed')) AS auth_attempts,
          BOOL_OR(s.login_success) AS had_success
        FROM sessions s
        LEFT JOIN events e ON e.session_id = s.id
        WHERE s.src_ip = ${ip}
      `,
      fastify.prisma.event.findMany({
        where: { srcIp: ip, eventType: 'command.input', command: { not: null } },
        select: { command: true, eventTs: true },
        orderBy: { eventTs: 'asc' },
      }),
      fastify.prisma.$queryRaw<Array<{
        total_hits: bigint; attack_types: string[];
      }>>`
        SELECT COUNT(*) AS total_hits, ARRAY_AGG(DISTINCT attack_type) AS attack_types
        FROM web_hits WHERE src_ip = ${ip}
      `,
    ]);

    const ssh = sshRows[0];
    const web = webRows[0];
    const cmds = cmdRows.map(r => r.command!);
    const crossProtocol = Number(ssh?.sessions ?? 0) > 0 && Number(web?.total_hits ?? 0) > 0;

    const risk = computeRiskScore({
      sshSessions:     Number(ssh?.sessions ?? 0),
      sshAuthAttempts: Number(ssh?.auth_attempts ?? 0),
      sshLoginSuccess: ssh?.had_success ?? false,
      commands:        cmds,
      webHits:         Number(web?.total_hits ?? 0),
      webAttackTypes:  web?.attack_types ?? [],
      crossProtocol,
    });

    return reply.send({
      ip,
      crossProtocol,
      ssh: ssh ? {
        sessions:     Number(ssh.sessions),
        authAttempts: Number(ssh.auth_attempts),
        loginSuccess: ssh.had_success,
      } : null,
      web: web ? {
        hits:        Number(web.total_hits),
        attackTypes: web.attack_types ?? [],
      } : null,
      risk: {
        score:             risk.score,
        level:             risk.level,
        breakdown:         risk.breakdown,
        topFactors:        risk.topFactors,
        commandCategories: risk.commandCategories,
      },
      classifiedCommands: cmdRows.map(r => ({
        command:  r.command,
        ts:       r.eventTs,
        category: Object.entries(classifyCommands([r.command!]))
          .find(([, cmds]) => cmds.length > 0)?.[0] ?? 'other',
      })),
    });
  });
}
