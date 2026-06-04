import cron from 'node-cron'
import type { PrismaClient } from '@prisma/client'
import { checkSensorHealthAlerts } from './threat-alerts.js'
import { sendPeriodicReport } from './weekly-report.js'
import { getAlertConfig } from './runtime-config.js'
import { readSystemMetrics } from '../routes/monitoring.js'
import { sampleContainerStatsForCron } from './docker-stats.js'
import { buildRecentRollups } from './rollups.js'

const SENSOR_HEALTH_SCHEDULE = '* * * * *'

let lastReportSent = 0

export function initCron(prisma: PrismaClient): void {
  cron.schedule('0 * * * *', async () => {
    const { reportIntervalHours } = getAlertConfig()
    if (reportIntervalHours === 0) return
    const intervalMs = reportIntervalHours * 60 * 60 * 1000
    if (Date.now() - lastReportSent >= intervalMs) {
      console.log(`[cron] Sending ${reportIntervalHours}h report...`)
      await sendPeriodicReport(prisma)
      lastReportSent = Date.now()
      console.log('[cron] Periodic report sent.')
    }
  }, { timezone: 'UTC' })

  cron.schedule(SENSOR_HEALTH_SCHEDULE, async () => {
    await checkSensorHealthAlerts(prisma)
  }, { timezone: 'UTC' })

  // Sample CPU/RAM + container stats every minute for the monitoring timeline
  cron.schedule(SENSOR_HEALTH_SCHEDULE, async () => {
    const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
    try {
      const metrics = readSystemMetrics()
      await prisma.monitoringSnapshot.create({ data: metrics })
      await prisma.monitoringSnapshot.deleteMany({ where: { sampledAt: { lt: cutoff } } })
    } catch (err) {
      console.error('[cron] monitoring snapshot error:', err)
    }
    try {
      const stats = await sampleContainerStatsForCron()
      if (stats.length > 0) {
        await prisma.containerSnapshot.createMany({ data: stats })
        await prisma.containerSnapshot.deleteMany({ where: { sampledAt: { lt: cutoff } } })
      }
    } catch (err) {
      console.error('[cron] container snapshot error:', err)
    }
  }, { timezone: 'UTC' })

  // Roll up yesterday + today into the permanent daily_* tables. Runs hourly so
  // historical stats are captured well before the 7-day retention prunes raw
  // rows; idempotent UPSERTs make re-runs harmless. Also runs once at startup.
  buildRecentRollups(prisma).catch((err) => console.error('[cron] rollup startup error:', err))
  cron.schedule('15 * * * *', async () => {
    try {
      await buildRecentRollups(prisma)
    } catch (err) {
      console.error('[cron] rollup error:', err)
    }
  }, { timezone: 'UTC' })

  console.log('[cron] Periodic report scheduled (interval read from config, checked hourly)')
  console.log('[cron] Sensor health checks scheduled (every minute)')
  console.log('[cron] Monitoring snapshots scheduled (every minute)')
  console.log('[cron] Daily rollups scheduled (hourly at :15)')
}
