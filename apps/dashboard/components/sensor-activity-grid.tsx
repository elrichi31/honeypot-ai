import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import {
  Terminal, Globe, HardDrive, Database,
  Network, Wifi, Share2, Radar,
} from "lucide-react"
import type { HoneypotOverview } from "@/lib/api"
import { getServerT } from "@/lib/i18n/server"

const PROTOCOL_CONFIG: Record<string, {
  label: string
  icon: React.ElementType
  href: string
  color: string
  border: string
  bg: string
}> = {
  ssh:        { label: "SSH",       icon: Terminal,  href: "/sessions",      color: "text-green-400",  border: "border-green-400/30",  bg: "bg-green-400/10" },
  http:       { label: "HTTP",      icon: Globe,     href: "/web-attacks",   color: "text-sky-400",    border: "border-sky-400/30",    bg: "bg-sky-400/10" },
  ftp:        { label: "FTP",       icon: HardDrive, href: "/services/ftp",  color: "text-yellow-400", border: "border-yellow-400/30", bg: "bg-yellow-400/10" },
  mysql:      { label: "MySQL",     icon: Database,  href: "/services/mysql",color: "text-purple-400", border: "border-purple-400/30", bg: "bg-purple-400/10" },
  "port-scan":{ label: "Port Scan", icon: Radar,     href: "/services/ports",color: "text-blue-400",   border: "border-blue-400/30",   bg: "bg-blue-400/10" },
  smb:        { label: "SMB",       icon: Share2,    href: "/services/smb",  color: "text-orange-400", border: "border-orange-400/30", bg: "bg-orange-400/10" },
  mssql:      { label: "MSSQL",     icon: Database,  href: "/services/mssql",color: "text-pink-400",   border: "border-pink-400/30",   bg: "bg-pink-400/10" },
  mqtt:       { label: "MQTT",      icon: Wifi,      href: "/services/mqtt", color: "text-teal-400",   border: "border-teal-400/30",   bg: "bg-teal-400/10" },
  rpc:        { label: "RPC",       icon: Network,   href: "/services",      color: "text-indigo-400", border: "border-indigo-400/30", bg: "bg-indigo-400/10" },
  tftp:       { label: "TFTP",      icon: HardDrive, href: "/services",      color: "text-lime-400",   border: "border-lime-400/30",   bg: "bg-lime-400/10" },
}

function relativeTime(ts: string | null) {
  if (!ts) return null
  try { return formatDistanceToNow(new Date(ts), { addSuffix: true }) }
  catch { return null }
}

interface SensorItem {
  key: string
  count: number
  uniqueIps: number
  lastSeen: string | null
  subtitle: string | null
}

export async function SensorActivityGrid({ overview }: { overview: HoneypotOverview }) {
  const t = await getServerT()
  const items: SensorItem[] = []

  if (overview.ssh.sessions > 0) {
    items.push({
      key: "ssh",
      count: overview.ssh.sessions,
      uniqueIps: overview.ssh.uniqueIps,
      lastSeen: overview.ssh.lastSeen,
      subtitle: overview.ssh.successfulLogins > 0
        ? t("dash.sensors.compromised", { n: overview.ssh.successfulLogins.toLocaleString("en-US") })
        : null,
    })
  }

  if (overview.web.hits > 0) {
    items.push({
      key: "http",
      count: overview.web.hits,
      uniqueIps: overview.web.uniqueIps,
      lastSeen: overview.web.lastSeen,
      subtitle: overview.web.topAttackType ? t("dash.sensors.topType", { type: overview.web.topAttackType }) : null,
    })
  }

  for (const p of overview.protocols) {
    if (p.count > 0) {
      items.push({
        key: p.protocol,
        count: p.count,
        uniqueIps: p.uniqueIps,
        lastSeen: p.lastSeen,
        subtitle: p.authAttempts > 0
          ? t("dash.sensors.authAttempts", { n: p.authAttempts.toLocaleString("en-US") })
          : null,
      })
    }
  }

  if (items.length === 0) return null

  return (
    <div className="mb-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {t("dash.sensors.activityBySensor")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => {
          const cfg = PROTOCOL_CONFIG[item.key] ?? {
            label: item.key.toUpperCase(),
            icon: Network,
            href: "/services",
            color: "text-slate-400",
            border: "border-slate-400/30",
            bg: "bg-slate-400/10",
          }
          const Icon = cfg.icon
          const when = relativeTime(item.lastSeen)

          return (
            <Link
              key={item.key}
              href={cfg.href}
              className={`group rounded-xl border ${cfg.border} bg-card p-4 transition-colors hover:bg-muted/30`}
            >
              <div className="flex items-start justify-between">
                <div className={`rounded-lg p-2 ${cfg.bg}`}>
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${cfg.bg} ${cfg.color}`}>
                  {cfg.label}
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold text-foreground">
                {item.count.toLocaleString("en-US")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("dash.sensors.uniqueIps", { n: item.uniqueIps.toLocaleString("en-US") })}
              </p>
              {(item.subtitle || when) && (
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground/70">
                  {item.subtitle && <span className="truncate">{item.subtitle}</span>}
                  {when && <span className="ml-auto shrink-0">{when}</span>}
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
