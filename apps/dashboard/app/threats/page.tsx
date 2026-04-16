import { ShieldAlert } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import { fetchThreats } from "@/lib/api"
import type { ThreatSummary } from "@/lib/api"
import { ThreatsTable } from "./threats-table"

export default async function ThreatsPage() {
  let threats: ThreatSummary[] = []
  try {
    threats = await fetchThreats()
  } catch {
    threats = []
  }

  const critical = threats.filter((t) => t.level === "CRITICAL").length
  const high     = threats.filter((t) => t.level === "HIGH").length
  const crossP   = threats.filter((t) => t.crossProtocol).length

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="ml-60 flex-1 p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <h1 className="text-2xl font-semibold text-foreground">Threat Intelligence</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Cross-protocol correlation · Risk scoring por IP · {threats.length} atacantes detectados
          </p>
        </div>

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total IPs</p>
            <p className="mt-1 text-2xl font-semibold font-mono text-foreground">{threats.length}</p>
          </div>
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-xs text-red-400">CRITICAL</p>
            <p className="mt-1 text-2xl font-semibold font-mono text-red-400">{critical}</p>
          </div>
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
            <p className="text-xs text-orange-400">HIGH</p>
            <p className="mt-1 text-2xl font-semibold font-mono text-orange-400">{high}</p>
          </div>
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
            <p className="text-xs text-purple-400">Cross-protocol</p>
            <p className="mt-1 text-2xl font-semibold font-mono text-purple-400">{crossP}</p>
          </div>
        </div>

        <ThreatsTable threats={threats} />
      </main>
    </div>
  )
}
