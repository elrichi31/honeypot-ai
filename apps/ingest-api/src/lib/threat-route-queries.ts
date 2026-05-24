import type { PrismaClient } from '@prisma/client'
import type { ProtocolAggRow, SshAggRow, WebAggRow } from './threat-types.js'

export type CommandAggRow = {
  src_ip: string
  command: string
}

export type CommandDetailRow = {
  command: string | null
  eventTs: Date
}

export async function queryThreatSshRows(prisma: PrismaClient) {
  return prisma.$queryRaw<Array<SshAggRow>>`
    SELECT
      s.src_ip,
      COUNT(DISTINCT s.id) AS sessions,
      COUNT(e.id) FILTER (WHERE e.event_type IN ('auth.success','auth.failed')) AS auth_attempts,
      BOOL_OR(s.login_success) AS had_success,
      MIN(s.started_at) AS first_seen,
      MAX(COALESCE(s.ended_at, s.started_at)) AS last_seen
    FROM sessions s
    LEFT JOIN events e ON e.session_id = s.id
    GROUP BY s.src_ip
  `
}

export async function queryThreatCommandRows(prisma: PrismaClient) {
  return prisma.$queryRaw<Array<CommandAggRow>>`
    SELECT DISTINCT e.src_ip, e.command
    FROM events e
    WHERE e.event_type = 'command.input'
      AND e.command IS NOT NULL
  `
}

export async function queryThreatWebRows(prisma: PrismaClient) {
  return prisma.$queryRaw<Array<WebAggRow>>`
    SELECT
      src_ip,
      COUNT(*) AS total_hits,
      ARRAY_AGG(DISTINCT attack_type) AS attack_types,
      MIN(timestamp) AS first_seen,
      MAX(timestamp) AS last_seen
    FROM web_hits
    GROUP BY src_ip
  `
}

export async function queryThreatProtocolRows(prisma: PrismaClient) {
  return prisma.$queryRaw<Array<ProtocolAggRow>>`
    SELECT
      src_ip,
      protocol,
      COUNT(*) AS total_hits,
      COUNT(*) FILTER (WHERE event_type = 'auth') AS auth_attempts,
      COUNT(*) FILTER (WHERE event_type = 'command') AS command_events,
      COUNT(*) FILTER (WHERE event_type = 'connect') AS connect_events,
      ARRAY_AGG(DISTINCT dst_port) AS dst_ports,
      ARRAY_AGG(DISTINCT username) FILTER (WHERE username IS NOT NULL AND username <> '') AS usernames,
      ARRAY_AGG(DISTINCT password) FILTER (WHERE password IS NOT NULL AND password <> '') AS passwords,
      MIN(timestamp) AS first_seen,
      MAX(timestamp) AS last_seen
    FROM protocol_hits
    GROUP BY src_ip, protocol
  `
}

export async function queryThreatSshRow(prisma: PrismaClient, ip: string) {
  return prisma.$queryRaw<Array<SshAggRow>>`
    SELECT
      s.src_ip,
      COUNT(DISTINCT s.id) AS sessions,
      COUNT(e.id) FILTER (WHERE e.event_type IN ('auth.success','auth.failed')) AS auth_attempts,
      BOOL_OR(s.login_success) AS had_success,
      MIN(s.started_at) AS first_seen,
      MAX(COALESCE(s.ended_at, s.started_at)) AS last_seen
    FROM sessions s
    LEFT JOIN events e ON e.session_id = s.id
    WHERE s.src_ip = ${ip}
    GROUP BY s.src_ip
  `
}

export async function queryThreatWebRow(prisma: PrismaClient, ip: string) {
  return prisma.$queryRaw<Array<WebAggRow>>`
    SELECT
      src_ip,
      COUNT(*) AS total_hits,
      ARRAY_AGG(DISTINCT attack_type) AS attack_types,
      MIN(timestamp) AS first_seen,
      MAX(timestamp) AS last_seen
    FROM web_hits
    WHERE src_ip = ${ip}
    GROUP BY src_ip
  `
}

export async function queryThreatProtocolRowsByIp(prisma: PrismaClient, ip: string) {
  return prisma.$queryRaw<Array<ProtocolAggRow>>`
    SELECT
      src_ip,
      protocol,
      COUNT(*) AS total_hits,
      COUNT(*) FILTER (WHERE event_type = 'auth') AS auth_attempts,
      COUNT(*) FILTER (WHERE event_type = 'command') AS command_events,
      COUNT(*) FILTER (WHERE event_type = 'connect') AS connect_events,
      ARRAY_AGG(DISTINCT dst_port) AS dst_ports,
      ARRAY_AGG(DISTINCT username) FILTER (WHERE username IS NOT NULL AND username <> '') AS usernames,
      ARRAY_AGG(DISTINCT password) FILTER (WHERE password IS NOT NULL AND password <> '') AS passwords,
      MIN(timestamp) AS first_seen,
      MAX(timestamp) AS last_seen
    FROM protocol_hits
    WHERE src_ip = ${ip}
    GROUP BY src_ip, protocol
  `
}

export async function queryThreatCommandsByIp(prisma: PrismaClient, ip: string) {
  return prisma.event.findMany({
    where: { srcIp: ip, eventType: 'command.input', command: { not: null } },
    select: { command: true, eventTs: true },
    orderBy: { eventTs: 'asc' },
  })
}

