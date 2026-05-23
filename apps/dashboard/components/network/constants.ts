import { Server, Lock, Database, Network, HardDrive, Radio, Globe } from "lucide-react"

// ─── Canvas geometry ──────────────────────────────────────────────────────────
export const CANVAS_W    = 1400
export const CANVAS_H    = 700
export const NODE_W      = 118
export const NODE_H      = 104
export const STEP        = NODE_W + 22   // column width including gap
export const CLIENT_GAP  = 64
export const EXT_Y       = 260
export const INT_Y       = 490
export const INET_Y      = 90
export const INT_LABEL_Y = INT_Y - NODE_H / 2 - 24

// ─── Protocol metadata ────────────────────────────────────────────────────────
export type ProtocolMeta = {
  label: string
  icon: React.ElementType
  color: string
  bg: string
  border: string
  glow: string   // raw RGB triplet: "r,g,b"
}

export const PROTOCOL_META: Record<string, ProtocolMeta> = {
  ssh:         { label: "SSH",       icon: Server,    color: "text-cyan-400",   bg: "bg-cyan-400/10",   border: "border-cyan-400/40",   glow: "34,211,238"  },
  ftp:         { label: "FTP",       icon: HardDrive, color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/40", glow: "250,204,21"  },
  mysql:       { label: "MySQL",     icon: Database,  color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/40", glow: "192,132,252" },
  "port-scan": { label: "Port Scan", icon: Radio,     color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/40",   glow: "96,165,250"  },
  http:        { label: "HTTP",      icon: Globe,     color: "text-green-400",  bg: "bg-green-400/10",  border: "border-green-400/40",  glow: "74,222,128"  },
  dionaea:     { label: "Dionaea",   icon: Network,   color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/40",    glow: "248,113,113" },
  smb:         { label: "SMB",       icon: Server,    color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/40", glow: "251,146,60"  },
  mssql:       { label: "MSSQL",     icon: Database,  color: "text-pink-400",   bg: "bg-pink-400/10",   border: "border-pink-400/40",   glow: "244,114,182" },
  rpc:         { label: "RPC",       icon: Network,   color: "text-indigo-400", bg: "bg-indigo-400/10", border: "border-indigo-400/40", glow: "129,140,248" },
  tftp:        { label: "TFTP",      icon: Server,    color: "text-lime-400",   bg: "bg-lime-400/10",   border: "border-lime-400/40",   glow: "163,230,53"  },
  mqtt:        { label: "MQTT",      icon: Network,   color: "text-teal-400",   bg: "bg-teal-400/10",   border: "border-teal-400/40",   glow: "45,212,191"  },
  deception:   { label: "Deception", icon: Lock,      color: "text-violet-400", bg: "bg-violet-400/10", border: "border-violet-400/40", glow: "167,139,250" },
}

const FALLBACK_META: ProtocolMeta = {
  label: "", icon: Server,
  color: "text-slate-400", bg: "bg-slate-400/10", border: "border-slate-400/40", glow: "148,163,184",
}

export function getMeta(protocol: string): ProtocolMeta {
  const m = PROTOCOL_META[protocol]
  return m ? m : { ...FALLBACK_META, label: protocol }
}
