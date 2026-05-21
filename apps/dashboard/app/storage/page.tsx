"use client"

import { useEffect, useState } from "react"
import { HardDrive } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { StorageOverview } from "@/components/storage/storage-overview"
import { IngestionChart } from "@/components/storage/ingestion-chart"
import { RetentionSettings } from "@/components/storage/retention-settings"

type StatsPayload = {
  disk:      { totalBytes: number; usedBytes: number; freeBytes: number }
  db:        { totalBytes: number; tables: { name: string; bytes: number }[] }
  ingestion: { date: string; ssh: number; web: number; protocol: number; defense: number }[]
}

export default function StoragePage() {
  const [stats, setStats]   = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/storage/stats")
      .then(r => r.ok ? r.json() : null)
      .then((d: unknown) => { if (d && typeof d === "object") setStats(d as StatsPayload) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <PageShell>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <HardDrive className="h-5 w-5 text-blue-400" />
          <h1 className="text-2xl font-semibold text-foreground">Storage</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Disk usage, database size, daily ingestion and retention policy.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-blue-400" />
        </div>
      ) : stats ? (
        <div className="space-y-6">
          <StorageOverview disk={stats.disk} db={stats.db} />
          <IngestionChart data={stats.ingestion} />
          <RetentionSettings />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Could not load storage stats.</p>
      )}
    </PageShell>
  )
}
