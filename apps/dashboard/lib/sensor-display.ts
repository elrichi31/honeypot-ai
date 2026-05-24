import { Database, Globe, Lock, Network, Server } from "lucide-react"

export const PROTOCOL_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  ssh:         { label: "SSH",       icon: Server,   color: "text-cyan-400",   bg: "bg-cyan-400/10"   },
  ftp:         { label: "FTP",       icon: Server,   color: "text-yellow-400", bg: "bg-yellow-400/10" },
  mysql:       { label: "MySQL",     icon: Database, color: "text-purple-400", bg: "bg-purple-400/10" },
  "port-scan": { label: "Port Scan", icon: Network,  color: "text-blue-400",   bg: "bg-blue-400/10"   },
  http:        { label: "HTTP",      icon: Globe,    color: "text-green-400",  bg: "bg-green-400/10"  },
  dionaea:     { label: "Dionaea",   icon: Network,  color: "text-red-400",    bg: "bg-red-400/10"    },
  smb:         { label: "SMB",       icon: Server,   color: "text-orange-400", bg: "bg-orange-400/10" },
  mssql:       { label: "MSSQL",     icon: Database, color: "text-pink-400",   bg: "bg-pink-400/10"   },
  rpc:         { label: "RPC",       icon: Network,  color: "text-indigo-400", bg: "bg-indigo-400/10" },
  tftp:        { label: "TFTP",      icon: Server,   color: "text-lime-400",   bg: "bg-lime-400/10"   },
  mqtt:        { label: "MQTT",      icon: Network,  color: "text-teal-400",   bg: "bg-teal-400/10"   },
  deception:   { label: "Deception", icon: Lock,     color: "text-violet-400", bg: "bg-violet-400/10" },
}

export function getProtocolMeta(protocol: string) {
  return PROTOCOL_META[protocol] ?? { label: protocol, icon: Server, color: "text-slate-400", bg: "bg-slate-400/10" }
}

export function isPrivateIp(ip: string): boolean {
  if (!ip || ip === "-") return false
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return false
  const [a, b] = v4.split(".").map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

export function formatRelative(value: string | null | undefined): string {
  if (!value || new Date(value).getTime() === 0) return "-"
  const diff = Date.now() - new Date(value).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
