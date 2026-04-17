import { notFound } from "next/navigation"
import { PageShell } from "@/components/page-shell"
import Link from "next/link"
import { formatDistanceToNow, differenceInSeconds } from "date-fns"
import { formatDateTimeLong } from "@/lib/timezone"
import { readConfig } from "@/lib/server-config"
import {
  ArrowLeft,
  Globe,
  Clock,
  Terminal,
  Key,
  Fingerprint,
  Monitor,
  Shield,
  ShieldX,
  Download,
} from "lucide-react"
import { EventTimeline } from "@/components/event-timeline"
import { AiSummary } from "@/components/ai-summary"
import { fetchSession, fetchThreat } from "@/lib/api"
import { RiskBadge } from "@/components/risk-badge"

function StatCard({
  icon: Icon,
  label,
  value,
  color = "text-muted-foreground",
  bg = "bg-secondary",
}: {
  icon: React.ElementType
  label: string
  value: string | number
  color?: string
  bg?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold text-foreground">{value}</p>
      </div>
    </div>
  )
}

export default async function SessionReplayPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let session
  let threat = null

  try {
    session = await fetchSession(id)
  } catch {
    notFound()
  }

  try {
    threat = await fetchThreat(session.srcIp)
  } catch {
    // threat data may not exist yet for this IP
  }

  const config = readConfig()
  const timezone = config.timezone ?? process.env.DASHBOARD_TIMEZONE ?? "UTC"
  const events = session.events ?? []

  const commands = events.filter((e) => e.eventType === "command.input" && e.command)
  const authAttempts = events.filter(
    (e) => e.eventType === "auth.success" || e.eventType === "auth.failed"
  )
  const successfulAuth = authAttempts.find((e) => e.success === true)

  // Detect file downloads from messages (wget/curl/scp patterns)
  const downloads = events.filter(
    (e) =>
      e.command &&
      (e.command.includes("wget") ||
        e.command.includes("curl") ||
        e.command.includes("scp") ||
        e.command.includes("tftp"))
  )

  const duration =
    session.endedAt
      ? differenceInSeconds(new Date(session.endedAt), new Date(session.startedAt))
      : null

  return (
    <PageShell>
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/sessions"
            className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to sessions
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-mono text-2xl font-semibold text-foreground">
                {session.srcIp}
              </h1>
              <p className="text-sm text-muted-foreground">
                {formatDateTimeLong(session.startedAt, timezone)} ·{" "}
                {formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {threat && <RiskBadge level={threat.risk.level} score={threat.risk.score} ip={session.srcIp} />}
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  session.loginSuccess
                    ? "bg-destructive/20 text-destructive"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {session.loginSuccess ? "Compromised" : "Blocked"}
              </span>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={Clock} label="Duration" value={duration ? `${duration}s` : "Active"} />
          <StatCard
            icon={Terminal}
            label="Commands"
            value={commands.length}
            color="text-warning"
            bg="bg-warning/20"
          />
          <StatCard
            icon={successfulAuth ? Shield : ShieldX}
            label="Login"
            value={successfulAuth ? "Success" : "Failed"}
            color={successfulAuth ? "text-destructive" : "text-success"}
            bg={successfulAuth ? "bg-destructive/20" : "bg-success/20"}
          />
          <StatCard
            icon={Key}
            label="Auth attempts"
            value={authAttempts.length}
          />
          <StatCard icon={Download} label="Downloads" value={downloads.length} color="text-chart-2" bg="bg-chart-2/20" />
          <StatCard icon={Globe} label="Protocol" value={session.protocol} />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          {/* Left column: metadata + credentials + commands */}
          <div className="space-y-6 xl:col-span-1">
            {/* Session metadata */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">Session Info</h3>
              </div>
              <div className="space-y-3 p-4 text-sm">
                {session.clientVersion && (
                  <div className="flex items-start gap-2">
                    <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Client version</p>
                      <p className="font-mono text-foreground break-all">{session.clientVersion}</p>
                    </div>
                  </div>
                )}
                {session.hassh && (
                  <div className="flex items-start gap-2">
                    <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">HASSH fingerprint</p>
                      <p className="font-mono text-xs text-foreground break-all">{session.hassh}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Source IP</p>
                    <p className="font-mono text-foreground">{session.srcIp}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Credentials attempted */}
            {authAttempts.length > 0 && (
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border p-4">
                  <h3 className="font-semibold text-foreground">Credentials Tried</h3>
                  <p className="text-xs text-muted-foreground">{authAttempts.length} attempts</p>
                </div>
                <div className="divide-y divide-border">
                  {authAttempts.map((e) => (
                    <div key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-foreground">{e.username}</span>
                        <span className="text-muted-foreground">:</span>
                        <span className="text-foreground">{e.password}</span>
                      </div>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-xs ${
                          e.success
                            ? "bg-destructive/20 text-destructive"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {e.success ? "OK" : "FAIL"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Commands used */}
            {commands.length > 0 && (
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border p-4">
                  <h3 className="font-semibold text-foreground">Commands Executed</h3>
                  <p className="text-xs text-muted-foreground">{commands.length} commands</p>
                </div>
                <div className="p-3 space-y-1.5">
                  {commands.map((e, i) => (
                    <code
                      key={i}
                      className="flex rounded bg-secondary px-3 py-1.5 font-mono text-xs text-foreground"
                    >
                      <span className="mr-2 select-none text-muted-foreground">$</span>
                      {e.command}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {/* Files downloaded */}
            {downloads.length > 0 && (
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border p-4">
                  <h3 className="font-semibold text-foreground">Download Attempts</h3>
                  <p className="text-xs text-muted-foreground">{downloads.length} detected</p>
                </div>
                <div className="p-3 space-y-1.5">
                  {downloads.map((e, i) => (
                    <code
                      key={i}
                      className="flex rounded bg-warning/10 px-3 py-1.5 font-mono text-xs text-warning"
                    >
                      <Download className="mr-2 h-3 w-3 mt-0.5 shrink-0" />
                      {e.command}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column: timeline + AI */}
          <div className="space-y-6 xl:col-span-2">
            <AiSummary session={session} events={events} />

            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">Event Timeline</h3>
                <p className="text-xs text-muted-foreground">{events.length} events recorded</p>
              </div>
              <div className="p-4">
                {events.length > 0 ? (
                  <EventTimeline events={events} />
                ) : (
                  <p className="text-sm text-muted-foreground">No events recorded.</p>
                )}
              </div>
            </div>
          </div>
        </div>
  </PageShell>
  )
}
