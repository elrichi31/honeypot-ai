import type { PrismaClient } from '@prisma/client'
import { AlertRepository } from './alerts.repository.js'
import type { AlertRow } from './alerts.repository.js'

export class AlertService {
  private repo: AlertRepository

  constructor(prisma: PrismaClient) {
    this.repo = new AlertRepository(prisma)
  }

  async list(args: {
    limit: number
    unreadOnly: boolean
    clientId?: string
  }): Promise<{ alerts: ReturnType<typeof mapAlert>[]; unreadCount: number }> {
    const [rows, unreadCount] = await Promise.all([
      this.repo.list(args),
      this.repo.countUnread(args.clientId),
    ])
    return { alerts: rows.map(mapAlert), unreadCount }
  }

  markRead(id: string): Promise<number> {
    return this.repo.markRead(id)
  }

  markAllRead(clientId?: string): Promise<number> {
    return this.repo.markAllRead(clientId)
  }

  deleteAll(clientId?: string): Promise<number> {
    return this.repo.deleteAll(clientId)
  }

  deleteOne(id: string, clientId?: string): Promise<number> {
    return this.repo.deleteOne(id, clientId)
  }
}

function mapAlert(r: AlertRow) {
  return {
    id: r.id,
    alertKey: r.alert_key,
    level: r.level,
    title: r.title,
    description: r.description,
    fields: r.fields,
    srcIp: r.src_ip,
    sensorId: r.sensor_id,
    clientId: r.client_id,
    clientName: r.client_name,
    readAt: r.read_at,
    createdAt: r.created_at,
  }
}
