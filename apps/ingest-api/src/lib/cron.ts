import cron from 'node-cron'
import type { PrismaClient } from '@prisma/client'
import { sendWeeklyReport } from './weekly-report.js'

// Monday at 09:00 UTC
const WEEKLY_SCHEDULE = '0 9 * * 1'

export function initCron(prisma: PrismaClient): void {
  if (!process.env.DISCORD_WEBHOOK_URL) return

  cron.schedule(WEEKLY_SCHEDULE, async () => {
    console.log('[cron] Sending weekly report...')
    await sendWeeklyReport(prisma)
    console.log('[cron] Weekly report sent.')
  }, { timezone: 'UTC' })

  console.log('[cron] Weekly report scheduled (Mon 09:00 UTC)')
}
