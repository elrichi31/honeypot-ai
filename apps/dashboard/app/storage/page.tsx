import type { Metadata } from "next"
import { HardDrive } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { apiFetch, getApiUrl } from "@/lib/api/client"
import { getServerT } from "@/lib/i18n/server"
import { StorageOverview } from "@/components/storage/storage-overview"
import { IngestionChart } from "@/components/storage/ingestion-chart"
import { RetentionSettings } from "@/components/storage/retention-settings"
import { SectionError } from "@/components/section-error"

export const metadata: Metadata = {
  title: "Storage — HoneyTrap",
}

type StatsPayload = {
  disk: { totalBytes: number; usedBytes: number; freeBytes: number }
  db:   { totalBytes: number; tables: { name: string; bytes: number }[] }
}

async function fetchStats(): Promise<StatsPayload | null> {
  try {
    return await apiFetch<StatsPayload>(`${getApiUrl()}/storage/stats`, undefined, 10000)
  } catch {
    return null
  }
}

export default async function StoragePage() {
  const [t, stats] = await Promise.all([getServerT(), fetchStats()])

  return (
    <PageShell>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <HardDrive className="h-5 w-5 text-blue-400" />
          <h1 className="text-2xl font-semibold text-foreground">{t("storage.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("storage.subtitle")}
        </p>
      </div>

      <div className="space-y-6">
        {stats ? (
          <StorageOverview disk={stats.disk} db={stats.db} />
        ) : (
          <SectionError />
        )}
        <IngestionChart />
        <RetentionSettings />
      </div>
    </PageShell>
  )
}
