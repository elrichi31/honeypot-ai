"use client"

import { useEffect, useState, useCallback } from "react"
import { Activity, RefreshCw } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { SystemCard } from "@/components/monitoring/system-card"
import { RedisCard } from "@/components/monitoring/redis-card"
import { ContainersCard } from "@/components/monitoring/containers-card"
import { ResourceTimeline } from "@/components/monitoring/resource-timeline"
import { ContainerStats } from "@/components/monitoring/container-stats"

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
  const [systemData, setSystemData]       = useState<SystemData | null>(null)
  const [containers, setContainers]       = useState<ContainerInfo[]>([])
  const [containerError, setContainerError] = useState<string | undefined>()
  const [loading, setLoading]             = useState(true)
  const [lastUpdated, setLastUpdated]     = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    const [sysRes, cntRes] = await Promise.allSettled([
      fetch("/api/monitoring/system").then(r => r.ok ? r.json() : null),
      fetch("/api/monitoring/containers").then(r => r.json()),
    ])

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
    }

    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <PageShell>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-emerald-400" />
            <h1 className="text-2xl font-semibold text-foreground">Monitoring</h1>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[11px] text-muted-foreground">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={refresh}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Server resources, cache stats and container health. Refreshes every 30s.
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
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">System Resources</p>
              <SystemCard system={systemData.system} />
            </div>
          )}

          {/* Resource timeline */}
          <div>
            <ResourceTimeline />
          </div>

          {/* Container CPU/RAM table + timeline */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Container Processes</p>
            <ContainerStats />
          </div>

          {/* Cache + Containers side by side on wide screens */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {systemData && (
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Redis Cache</p>
                <RedisCard redis={systemData.redis} />
              </div>
            )}
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Containers</p>
              <ContainersCard containers={containers} error={containerError} />
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
