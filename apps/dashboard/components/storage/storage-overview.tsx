"use client"

import { HardDrive, Database, FolderOpen } from "lucide-react"
import { Surface } from "@/components/ui/surface"
import { useT } from "@/components/locale-provider"

type DiskStats = { totalBytes: number; usedBytes: number; freeBytes: number }
type DbStats   = { totalBytes: number; tables: { name: string; bytes: number }[] }

function fmt(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function UsageBar({ used, total, color }: { used: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-white/[0.06]">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function StorageOverview({ disk, db }: { disk: DiskStats; db: DbStats }) {
  const t = useT()
  const diskPct  = disk.totalBytes > 0 ? ((disk.usedBytes / disk.totalBytes) * 100).toFixed(1) : "0"
  const dbPct    = disk.totalBytes > 0 ? ((db.totalBytes  / disk.totalBytes) * 100).toFixed(1) : "0"
  const topTables = db.tables.slice(0, 5)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {/* Disk used */}
      <Surface className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <HardDrive className="h-4 w-4 text-blue-400" />
          <span className="text-[11px] text-muted-foreground">{t("storage.disk.title")}</span>
        </div>
        <p className="text-xl font-semibold tabular-nums text-blue-400">{fmt(disk.usedBytes)}</p>
        <p className="text-[11px] text-muted-foreground">{diskPct}% of {fmt(disk.totalBytes)}</p>
        <UsageBar used={disk.usedBytes} total={disk.totalBytes}
          color={Number(diskPct) > 85 ? "bg-red-400" : Number(diskPct) > 65 ? "bg-yellow-400" : "bg-blue-400"} />
      </Surface>

      {/* DB size */}
      <Surface className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Database className="h-4 w-4 text-purple-400" />
          <span className="text-[11px] text-muted-foreground">{t("storage.db.title")}</span>
        </div>
        <p className="text-xl font-semibold tabular-nums text-purple-400">{fmt(db.totalBytes)}</p>
        <p className="text-[11px] text-muted-foreground">{t("storage.db.ofDisk", { pct: dbPct })}</p>
        <UsageBar used={db.totalBytes} total={disk.totalBytes} color="bg-purple-400" />
      </Surface>

      {/* Free space */}
      <Surface className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <FolderOpen className="h-4 w-4 text-emerald-400" />
          <span className="text-[11px] text-muted-foreground">{t("storage.free.title")}</span>
        </div>
        <p className="text-xl font-semibold tabular-nums text-emerald-400">{fmt(disk.freeBytes)}</p>
        <p className="text-[11px] text-muted-foreground">{t("storage.free.available")}</p>
        <UsageBar used={disk.freeBytes} total={disk.totalBytes} color="bg-emerald-400" />
      </Surface>

      {/* Table breakdown */}
      <Surface className="sm:col-span-3 px-4 py-3">
        <p className="text-[11px] font-medium text-muted-foreground mb-3">{t("storage.tables.title")}</p>
        <div className="space-y-2">
          {topTables.map(t => {
            const pct = db.totalBytes > 0 ? (t.bytes / db.totalBytes) * 100 : 0
            return (
              <div key={t.name} className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-muted-foreground/70 w-40 truncate">{t.name}</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-purple-400/60" style={{ width: `${pct}%` }} />
                </div>
                <span className="font-mono text-[11px] text-muted-foreground w-16 text-right">{fmt(t.bytes)}</span>
              </div>
            )
          })}
        </div>
      </Surface>
    </div>
  )
}
