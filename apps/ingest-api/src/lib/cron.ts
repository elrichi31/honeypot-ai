import cron from 'node-cron'
import type { PrismaClient } from '@prisma/client'
import { checkSensorHealthAlerts } from './threat-alerts.js'
import { sendWeeklyReport } from './weekly-report.js'

// Monday at 09:00 UTC
const WEEKLY_SCHEDULE = '0 9 * * 1'
const SENSOR_HEALTH_SCHEDULE = '* * * * *'

export function initCron(prisma: PrismaClient): void {
  cron.schedule(WEEKLY_SCHEDULE, async () => {
    console.log('[cron] Sending weekly report...')
    await sendWeeklyReport(prisma)
    console.log('[cron] Weekly report sent.')
  }, { timezone: 'UTC' })

  cron.schedule(SENSOR_HEALTH_SCHEDULE, async () => {
    await checkSensorHealthAlerts(prisma)
  }, { timezone: 'UTC' })

  console.log('[cron] Weekly report scheduled (Mon 09:00 UTC)')
  console.log('[cron] Sensor health checks scheduled (every minute)')
}
