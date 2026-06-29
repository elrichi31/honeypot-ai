"use client"

import { useEffect, useState, useCallback } from "react"
import { Activity, RefreshCw } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { SystemCard } from "@/components/monitoring/system-card"
import { RedisCard } from "@/components/monitoring/redis-card"
import { ContainersCard } from "@/components/monitoring/containers-card"
import { ResourceTimeline } from "@/components/monitoring/resource-timeline"
import { ContainerStats } from "@/components/monitoring/container-stats"
import { useT } from "@/components/locale-provider"

type SystemData = {
  system: {
    uptime: number
    loadAvg: [number, number, number]
    memory: { totalKb: number; availableKb: number; usedKb: number; usedPercent: number }
  }
  redis: {
    connected: boolean
    version?: string | null
    uptimeSeconds?: number
    memoryUsedBytes?: number
    memoryPeakBytes?: number
    hitRate?: number | null
    opsPerSec?: number
    connectedClients?: number
    totalCommands?: number
  }
}

type ContainerInfo = {
  name: string
  state: string
  status: string
  image: string
  created: number
}

export default function MonitoringPage() {
  const t = useT()
  const [systemData, setSystemData]       = useState<SystemData | null>(null)
  const [containers, setContainers]       = useState<ContainerInfo[]>([])
  const [containerError, setContainerError] = useState<string | undefined>()
  const [loading, setLoading]             = useState(true)
  const [lastUpdated, setLastUpdated]     = useState<Date | null>(null)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const [sysRes, cntRes] = await Promise.allSettled([
      fetch("/api/monitoring/system", { signal })
        .then(async (r) => r.ok ? r.json() : null),
      fetch("/api/monitoring/containers", { signal })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        }),
    ])

    if (signal?.aborted) return

    if (sysRes.status === "fulfilled" && sysRes.value) {
      setSystemData(sysRes.value)
    }

    if (cntRes.status === "fulfilled") {
      const val = cntRes.value
      if (Array.isArray(val)) {
        setContainers(val)
        setContainerError(undefined)
      } else if (val?.error) {
        setContainerError(val.error)
      }
    } else if (cntRes.status === "rejected" && cntRes.reason?.name !== "AbortError") {
      setContainerError(String(cntRes.reason))
    }

    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    refresh(controller.signal)
    const id = setInterval(() => {
      if (!document.hidden) refresh()
    }, 60_000)
    return () => { controller.abort(); clearInterval(id) }
  }, [refresh])

  return (
    <PageShell>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-emerald-400" />
            <h1 className="text-2xl font-semibold text-foreground">{t("monitoring.title")}</h1>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[11px] text-muted-foreground">
                {t("monitoring.updated", { time: lastUpdated.toLocaleTimeString() })}
              </span>
            )}
            <button
              onClick={() => refresh()}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              {t("monitoring.refresh")}
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("monitoring.subtitle")}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-emerald-400" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* System resources */}
          {systemData && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("monitoring.section.systemResources")}</p>
              <SystemCard system={systemData.system} />
            </div>
          )}

          {/* Resource timeline */}
          <div>
            <ResourceTimeline />
          </div>

          {/* Container CPU/RAM table + timeline */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("monitoring.section.containerProcesses")}</p>
            <ContainerStats />
          </div>

          {/* Cache + Containers side by side on wide screens */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {systemData && (
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("monitoring.section.redisCache")}</p>
                <RedisCard redis={systemData.redis} />
              </div>
            )}
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("monitoring.section.containers")}</p>
              <ContainersCard containers={containers} error={containerError} />
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
