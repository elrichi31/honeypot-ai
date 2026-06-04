import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'

/**
 * Computes the daily rollups for a single UTC day and UPSERTs them into the
 * permanent daily_* tables. Idempotent: re-running for the same day overwrites
 * that day's rows, so it's safe to run repeatedly or backfill.
 *
 * `day` is the date string 'YYYY-MM-DD'; the window is [day 00:00, day+1 00:00).
 */
export async function buildDailyRollups(prisma: PrismaClient, day: string): Promise<void> {
  const start = `${day} 00:00:00+00`
  const end = `${day} 00:00:00+00`

  // Per-IP attacker activity for the day, unioned across all raw sources.
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO daily_attacker_stats
      (day, src_ip, events, auth_attempts, login_successes, protocol_hits, web_hits, sessions, updated_at)
    SELECT ${day}::date AS day, src_ip,
           COALESCE(SUM(events), 0), COALESCE(SUM(auth_attempts), 0),
           COALESCE(SUM(login_successes), 0), COALESCE(SUM(protocol_hits), 0),
           COALESCE(SUM(web_hits), 0), COALESCE(SUM(sessions), 0), now()
    FROM (
      SELECT src_ip,
             COUNT(*) AS events,
             COUNT(*) FILTER (WHERE event_type IN ('auth.success','auth.failed')) AS auth_attempts,
             COUNT(*) FILTER (WHERE event_type = 'auth.success') AS login_successes,
             0 AS protocol_hits, 0 AS web_hits, 0 AS sessions
      FROM events
      WHERE event_ts >= ${start}::timestamptz AND event_ts < (${end}::timestamptz + interval '1 day')
      GROUP BY src_ip
      UNION ALL
      SELECT src_ip, 0, 0, 0, COUNT(*), 0, 0
      FROM protocol_hits
      WHERE timestamp >= ${start}::timestamptz AND timestamp < (${end}::timestamptz + interval '1 day')
      GROUP BY src_ip
      UNION ALL
      SELECT src_ip, 0, 0, 0, 0, COUNT(*), 0
      FROM web_hits
      WHERE timestamp >= ${start}::timestamptz AND timestamp < (${end}::timestamptz + interval '1 day')
      GROUP BY src_ip
      UNION ALL
      SELECT src_ip, 0, 0, 0, 0, 0, COUNT(*)
      FROM sessions
      WHERE started_at >= ${start}::timestamptz AND started_at < (${end}::timestamptz + interval '1 day')
      GROUP BY src_ip
    ) u
    GROUP BY src_ip
    ON CONFLICT (day, src_ip) DO UPDATE SET
      events = EXCLUDED.events, auth_attempts = EXCLUDED.auth_attempts,
      login_successes = EXCLUDED.login_successes, protocol_hits = EXCLUDED.protocol_hits,
      web_hits = EXCLUDED.web_hits, sessions = EXCLUDED.sessions, updated_at = now()
  `)

  // Global daily totals (single row).
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO daily_summary
      (day, ssh_events, web_hits, protocol_hits, sessions, unique_ips, login_successes, suricata_alerts, updated_at)
    SELECT ${day}::date,
      (SELECT COUNT(*) FROM events       WHERE event_ts  >= ${start}::timestamptz AND event_ts  < (${end}::timestamptz + interval '1 day')),
      (SELECT COUNT(*) FROM web_hits     WHERE timestamp >= ${start}::timestamptz AND timestamp < (${end}::timestamptz + interval '1 day')),
      (SELECT COUNT(*) FROM protocol_hits WHERE timestamp >= ${start}::timestamptz AND timestamp < (${end}::timestamptz + interval '1 day')),
      (SELECT COUNT(*) FROM sessions     WHERE started_at >= ${start}::timestamptz AND started_at < (${end}::timestamptz + interval '1 day')),
      (SELECT COUNT(DISTINCT src_ip) FROM (
        SELECT src_ip FROM events        WHERE event_ts  >= ${start}::timestamptz AND event_ts  < (${end}::timestamptz + interval '1 day')
        UNION SELECT src_ip FROM protocol_hits WHERE timestamp >= ${start}::timestamptz AND timestamp < (${end}::timestamptz + interval '1 day')
        UNION SELECT src_ip FROM web_hits WHERE timestamp >= ${start}::timestamptz AND timestamp < (${end}::timestamptz + interval '1 day')
      ) ips),
      (SELECT COUNT(*) FROM events WHERE event_type = 'auth.success' AND event_ts >= ${start}::timestamptz AND event_ts < (${end}::timestamptz + interval '1 day')),
      (SELECT COUNT(*) FROM suricata_alerts WHERE timestamp >= ${start}::timestamptz AND timestamp < (${end}::timestamptz + interval '1 day')),
      now()
    ON CONFLICT (day) DO UPDATE SET
      ssh_events = EXCLUDED.ssh_events, web_hits = EXCLUDED.web_hits,
      protocol_hits = EXCLUDED.protocol_hits, sessions = EXCLUDED.sessions,
      unique_ips = EXCLUDED.unique_ips, login_successes = EXCLUDED.login_successes,
      suricata_alerts = EXCLUDED.suricata_alerts, updated_at = now()
  `)

  // Credential attempts (username/password) for the day.
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO daily_credential_stats (day, username, password, attempts, successes, unique_ips, updated_at)
    SELECT ${day}::date, COALESCE(username, ''), COALESCE(password, ''),
           COUNT(*), COUNT(*) FILTER (WHERE event_type = 'auth.success'), COUNT(DISTINCT src_ip), now()
    FROM events
    WHERE event_type IN ('auth.success','auth.failed')
      AND event_ts >= ${start}::timestamptz AND event_ts < (${end}::timestamptz + interval '1 day')
    GROUP BY COALESCE(username, ''), COALESCE(password, '')
    ON CONFLICT (day, username, password) DO UPDATE SET
      attempts = EXCLUDED.attempts, successes = EXCLUDED.successes,
      unique_ips = EXCLUDED.unique_ips, updated_at = now()
  `)

  // Command frequency for the day.
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO daily_command_stats (day, command, count, unique_ips, updated_at)
    SELECT ${day}::date, command, COUNT(*), COUNT(DISTINCT src_ip), now()
    FROM events
    WHERE event_type = 'command.input' AND command IS NOT NULL AND command <> ''
      AND event_ts >= ${start}::timestamptz AND event_ts < (${end}::timestamptz + interval '1 day')
    GROUP BY command
    ON CONFLICT (day, command) DO UPDATE SET
      count = EXCLUDED.count, unique_ips = EXCLUDED.unique_ips, updated_at = now()
  `)
}

/** Builds rollups for yesterday and today (today is partial but kept fresh). */
export async function buildRecentRollups(prisma: PrismaClient): Promise<void> {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  await buildDailyRollups(prisma, fmt(yesterday))
  await buildDailyRollups(prisma, fmt(today))
}
