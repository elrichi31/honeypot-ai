import cron from 'node-cron'
import type { PrismaClient } from '@prisma/client'
import { checkSensorHealthAlerts, drainThreatQueue } from './threat-alerts.js'
import { sendPeriodicReport } from './weekly-report.js'
import { getAlertConfig } from './runtime-config.js'
import { readSystemMetrics } from '../routes/monitoring.js'
import { sampleContainerStatsForCron } from './docker-stats.js'
import { buildRecentRollups } from './rollups.js'

const SENSOR_HEALTH_SCHEDULE = '* * * * *'
const MONITORING_SNAPSHOT_SCHEDULE = '* * * * *'
// Every 30s (6-field cron with seconds). Drains the threat-evaluation queue off
// the ingest hot path, so each tick runs a bounded number of heavy aggregate
// evaluations instead of firing them per-event under load.
const THREAT_DRAIN_SCHEDULE = '*/30 * * * * *'

let lastReportSent = 0
let threatDrainRunning = false

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

  // Drain queued threat evaluations. Guarded against overlap: if a tick is still
  // working through a backlog when the next fires, skip rather than pile on.
  cron.schedule(THREAT_DRAIN_SCHEDULE, async () => {
    if (threatDrainRunning) return
    threatDrainRunning = true
    try {
      await drainThreatQueue(prisma)
    } catch (err) {
      console.error('[cron] threat drain error:', err)
    } finally {
      threatDrainRunning = false
    }
  }, { timezone: 'UTC' })

  // Sample system metrics every minute for the monitoring timeline
  cron.schedule(MONITORING_SNAPSHOT_SCHEDULE, async () => {
    const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
    try {
      const metrics = readSystemMetrics()
      await prisma.monitoringSnapshot.create({ data: metrics })
      await prisma.monitoringSnapshot.deleteMany({ where: { sampledAt: { lt: cutoff } } })
    } catch (err) {
      console.error('[cron] monitoring snapshot error:', err)
    }
  }, { timezone: 'UTC' })

  // Sample container stats every 2 minutes — cheaper than system metrics (hits dockerd); 5-min
  // bucketing in the history view makes 2-min resolution indistinguishable from 1-min.
  cron.schedule('*/2 * * * *', async () => {
    const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
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
  console.log('[cron] Threat evaluation drain scheduled (every 30s)')
  console.log('[cron] Monitoring snapshots scheduled (system: every minute, containers: every 2 min)')
  console.log('[cron] Daily rollups scheduled (hourly at :15)')
}
