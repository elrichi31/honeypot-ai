import type { PrismaClient } from '@prisma/client'
import { normalizeSlug, clientNameFromSlug } from '../../lib/sensor-utils.js'

export type ClientRef = { id: string | null; name: string | null; slug: string | null }

export type SensorRow = {
  sensor_id: string; client_id: string | null; client_name: string | null
  client_slug: string | null; client_code: string | null; name: string
  protocol: string; ip: string; version: string; ports: number[]
  probe_ports: number[]; probe_host: string; last_seen: Date
  created_at: Date; event_count: bigint
}

export class SensorRepository {
  constructor(private prisma: PrismaClient, private prismaRead: PrismaClient) {}

  async resolveClientId(
    slugOrId: { slug?: string | null; name?: string | null; id?: string | null },
  ): Promise<ClientRef> {
    if (slugOrId.id) {
      const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
        SELECT id, name, slug FROM clients WHERE id = ${slugOrId.id} LIMIT 1
      `
      const c = rows[0]
      return c ? { id: c.id, name: c.name, slug: c.slug } : { id: null, name: null, slug: null }
    }

    const normalizedSlug = normalizeSlug(slugOrId.slug ?? '')
    if (!normalizedSlug) return { id: null, name: null, slug: null }

    const displayName = (slugOrId.name ?? '').trim() || clientNameFromSlug(normalizedSlug)
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
      INSERT INTO clients (id, name, slug, description, created_at)
      VALUES (gen_random_uuid()::text, ${displayName}, ${normalizedSlug}, '', ${new Date()})
      ON CONFLICT (slug) DO UPDATE SET
        name = COALESCE(NULLIF(EXCLUDED.name, ''), clients.name)
      RETURNING id, name, slug
    `
    const c = rows[0]
    return c ? { id: c.id, name: c.name, slug: c.slug } : { id: null, name: null, slug: null }
  }

  async upsertHeartbeat(args: {
    sensorId: string; clientId: string | null; name: string; protocol: string
    ip: string; version: string; ports: number[]; probePorts: number[]
    probeHost: string; now: Date
  }): Promise<void> {
    const { sensorId, clientId, name, protocol, ip, version, ports, probePorts, probeHost, now } = args
    await this.prisma.$executeRaw`
      INSERT INTO sensors (id, sensor_id, client_id, name, protocol, ip, version, ports, probe_ports, probe_host, last_seen, created_at)
      VALUES (gen_random_uuid()::text, ${sensorId}, ${clientId}, ${name}, ${protocol}, ${ip}, ${version},
        CAST(${JSON.stringify(ports)} AS jsonb), CAST(${JSON.stringify(probePorts)} AS jsonb),
        ${probeHost}, ${now}, ${now})
      ON CONFLICT (sensor_id) DO UPDATE SET
        client_id = COALESCE(EXCLUDED.client_id, sensors.client_id), name = EXCLUDED.name,
        protocol = EXCLUDED.protocol, ip = EXCLUDED.ip, version = EXCLUDED.version,
        ports = EXCLUDED.ports, probe_ports = EXCLUDED.probe_ports,
        probe_host = EXCLUDED.probe_host, last_seen = EXCLUDED.last_seen
    `
  }

  async list(): Promise<SensorRow[]> {
    // Sensor heartbeats drive the online/offline badge and must be strongly
    // consistent. Reading this list from the replica can mark every sensor
    // offline during replication lag even while heartbeats are arriving on the
    // primary, so /sensors stays on the primary.
    return this.prisma.$queryRaw<SensorRow[]>`
      WITH ssh_counts AS (
        SELECT sensor_id, COUNT(*)::bigint AS n FROM sessions GROUP BY sensor_id
      ),
      web_counts AS (
        SELECT sensor_id, COUNT(*)::bigint AS n FROM web_hits GROUP BY sensor_id
      ),
      proto_counts AS (
        -- sensor_id is backfilled from data->>'sensor'; COALESCE covers the few old
        -- rows where it wasn't, counting each hit once under its effective sensor.
        SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id, COUNT(*)::bigint AS n
        FROM protocol_hits
        WHERE COALESCE(sensor_id, data->>'sensor') IS NOT NULL
        GROUP BY COALESCE(sensor_id, data->>'sensor')
      )
      SELECT
        s.sensor_id, c.id AS client_id, c.name AS client_name, c.slug AS client_slug,
        c.code AS client_code, s.name, s.protocol, s.ip, s.version,
        s.ports, s.probe_ports, s.probe_host, s.last_seen, s.created_at,
        COALESCE(
          CASE
            WHEN s.protocol = 'ssh'  THEN sc.n
            WHEN s.protocol = 'http' THEN wc.n
            ELSE pc.n
          END, 0
        )::bigint AS event_count
      FROM sensors s
      LEFT JOIN clients c     ON c.id = s.client_id
      LEFT JOIN ssh_counts sc ON sc.sensor_id = s.sensor_id
      LEFT JOIN web_counts wc ON wc.sensor_id = s.sensor_id
      LEFT JOIN proto_counts pc ON pc.sensor_id = s.sensor_id
      ORDER BY s.last_seen DESC
    `
  }

  async getCowrieSessionCount(): Promise<{ count: bigint; last_seen: Date | null }> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint; last_seen: Date | null }>>`
      SELECT COUNT(*) AS count, MAX(started_at) AS last_seen FROM sessions
    `
    return rows[0] ?? { count: 0n, last_seen: null }
  }

  async findClientBySlug(slug: string): Promise<{ id: string; name: string; slug: string } | null> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
      SELECT id, name, slug FROM clients WHERE slug = ${slug} LIMIT 1
    `
    return rows[0] ?? null
  }

  async getSensorClientId(sensorId: string): Promise<{ client_id: string | null } | null> {
    const rows = await this.prisma.$queryRaw<Array<{ client_id: string | null }>>`
      SELECT client_id FROM sensors WHERE sensor_id = ${sensorId}
    `
    return rows[0] ?? null
  }

  async assignClient(sensorId: string, clientId: string | null): Promise<{ sensor_id: string } | null> {
    const rows = await this.prisma.$queryRaw<Array<{ sensor_id: string }>>`
      UPDATE sensors SET client_id = ${clientId} WHERE sensor_id = ${sensorId} RETURNING sensor_id
    `
    return rows[0] ?? null
  }

  async delete(sensorId: string): Promise<{ sensor_id: string } | null> {
    const rows = await this.prisma.$queryRaw<Array<{ sensor_id: string }>>`
      DELETE FROM sensors WHERE sensor_id = ${sensorId} RETURNING sensor_id
    `
    return rows[0] ?? null
  }

  async getConfig(sensorId: string): Promise<{ config: unknown; config_hash: string } | null> {
    const rows = await this.prisma.$queryRaw<Array<{ config: unknown; config_hash: string }>>`
      SELECT config, config_hash FROM sensor_configs WHERE sensor_id = ${sensorId}
    `
    return rows[0] ?? null
  }

  async upsertConfig(sensorId: string, configStr: string, hash: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO sensor_configs (sensor_id, config, config_hash, updated_at)
      VALUES (${sensorId}, CAST(${configStr} AS jsonb), ${hash}, NOW())
      ON CONFLICT (sensor_id) DO UPDATE SET
        config      = EXCLUDED.config,
        config_hash = EXCLUDED.config_hash,
        updated_at  = EXCLUDED.updated_at
    `
  }

  async findClientById(clientId: string): Promise<{ id: string } | null> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM clients WHERE id = ${clientId} LIMIT 1
    `
    return rows[0] ?? null
  }

  async createProvisionToken(args: {
    id: string; token: string; clientId: string; services: string; expiresAt: Date
  }): Promise<void> {
    const { id, token, clientId, services, expiresAt } = args
    await this.prisma.$executeRaw`
      INSERT INTO sensor_provision_tokens (id, token, client_id, services, created_at, expires_at)
      VALUES (${id}, ${token}, ${clientId}, ${services}, NOW(), ${expiresAt})
    `
  }

  async redeemProvisionToken(token: string): Promise<{
    id: string; expires_at: Date; services: string
    client_name: string; client_slug: string; client_code: string
  } | null> {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; expires_at: Date; services: string
      client_name: string; client_slug: string; client_code: string
    }>>`
      SELECT t.id, t.expires_at, t.services,
             c.name AS client_name, c.slug AS client_slug, c.code AS client_code
      FROM sensor_provision_tokens t
      JOIN clients c ON c.id = t.client_id
      WHERE t.token = ${token}
        AND t.used_at IS NULL
      LIMIT 1
    `
    return rows[0] ?? null
  }

  async markProvisionTokenUsed(id: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE sensor_provision_tokens SET used_at = NOW() WHERE id = ${id}
    `
  }
}
