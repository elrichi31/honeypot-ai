import cron from 'node-cron'
import type { PrismaClient } from '@prisma/client'
import { checkSensorHealthAlerts } from './threat-alerts.js'
import { sendPeriodicReport } from './weekly-report.js'
import { getAlertConfig } from './runtime-config.js'

const SENSOR_HEALTH_SCHEDULE = '* * * * *'

let lastReportSent = 0

export function initCron(prisma: PrismaClient): void {
  // Check every hour whether enough time has passed to send the periodic report
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

  console.log('[cron] Periodic report scheduled (interval read from config, checked hourly)')
  console.log('[cron] Sensor health checks scheduled (every minute)')
}
