import {
  Terminal, Globe, HardDrive, Database,
  Network, Wifi, Share2, Radar,
} from "lucide-react"

export interface ProtocolConfig {
  label: string
  icon: React.ElementType
  href: string
  color: string
  border: string
  bg: string
}

export const PROTOCOL_CONFIG: Record<string, ProtocolConfig> = {
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

export function getProtocolConfig(key: string): ProtocolConfig {
  return PROTOCOL_CONFIG[key] ?? {
    label: key.toUpperCase(),
    icon: Network,
    href: "/services",
    color: "text-slate-400",
    border: "border-slate-400/30",
    bg: "bg-slate-400/10",
  }
}
