import cron from 'node-cron'
import type { PrismaClient } from '@prisma/client'
import { checkSensorHealthAlerts } from './threat-alerts.js'
import { sendPeriodicReport } from './weekly-report.js'
import { getAlertConfig } from './runtime-config.js'
import { readSystemMetrics } from '../routes/monitoring.js'

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

  // Sample CPU/RAM every minute for the monitoring timeline
  cron.schedule(SENSOR_HEALTH_SCHEDULE, async () => {
    try {
      const metrics = readSystemMetrics()
      await prisma.monitoringSnapshot.create({ data: metrics })
      // Purge samples older than 35 days
      await prisma.monitoringSnapshot.deleteMany({
        where: { sampledAt: { lt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) } },
      })
    } catch (err) {
      console.error('[cron] monitoring snapshot error:', err)
    }
  }, { timezone: 'UTC' })

  console.log('[cron] Periodic report scheduled (interval read from config, checked hourly)')
  console.log('[cron] Sensor health checks scheduled (every minute)')
  console.log('[cron] Monitoring snapshots scheduled (every minute)')
}
