export const PROTOCOL_MARKER_COLOR: Record<string, string> = {
  ssh: "#f43f5e",
  http: "#fb923c",
  ftp: "#facc15",
  mysql: "#c084fc",
  "port-scan": "#38bdf8",
  dionaea: "#ef4444",
  smb: "#f97316",
  mssql: "#ec4899",
  rpc: "#818cf8",
  tftp: "#a3e635",
  mqtt: "#14b8a6",
  ids: "#f87171",
}

export const PROTOCOL_CHIP_CLASS: Record<string, string> = {
  ssh: "text-rose-400 border-rose-500/40 bg-rose-500/10",
  http: "text-orange-400 border-orange-500/40 bg-orange-500/10",
  ftp: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
  mysql: "text-purple-400 border-purple-500/40 bg-purple-500/10",
  "port-scan": "text-sky-400 border-sky-500/40 bg-sky-500/10",
  smb: "text-orange-400 border-orange-500/40 bg-orange-500/10",
  mssql: "text-pink-400 border-pink-500/40 bg-pink-500/10",
  rpc: "text-indigo-400 border-indigo-500/40 bg-indigo-500/10",
  tftp: "text-lime-400 border-lime-500/40 bg-lime-500/10",
  mqtt: "text-teal-400 border-teal-500/40 bg-teal-500/10",
  dionaea: "text-red-400 border-red-500/40 bg-red-500/10",
  ids: "text-red-400 border-red-500/40 bg-red-500/10",
}

export const PROTOCOL_DOT_CLASS: Record<string, string> = {
  ssh: "bg-rose-400",
  http: "bg-orange-400",
  ftp: "bg-yellow-400",
  mysql: "bg-purple-400",
  "port-scan": "bg-sky-400",
  dionaea: "bg-red-400",
  smb: "bg-orange-400",
  mssql: "bg-pink-400",
  rpc: "bg-indigo-400",
  tftp: "bg-lime-400",
  mqtt: "bg-teal-400",
  ids: "bg-red-400",
}

export function getProtocolChipClass(protocol: string): string {
  return PROTOCOL_CHIP_CLASS[protocol] ?? "text-muted-foreground border-border bg-muted"
}

export function getProtocolDotClass(protocol: string): string {
  return PROTOCOL_DOT_CLASS[protocol] ?? "bg-muted-foreground"
}

export function getProtocolMarkerColor(protocol: string): string {
  return PROTOCOL_MARKER_COLOR[protocol] ?? "#6b7280"
}

// Colour by destination port. Known service ports reuse their protocol's colour
// so ssh(22)/http(80)/mysql(3306) stay visually consistent with the rest of the
// UI; any other port (the arbitrary ports IDS scans hammer) gets a stable
// hash-derived hue so each port reads as a distinct colour on the map.
const PORT_MARKER_COLOR: Record<number, string> = {
  21: "#facc15",   22: "#f43f5e",   23: "#fb7185",   25: "#a3e635",
  80: "#fb923c",   443: "#f97316",  445: "#f59e0b",  1433: "#ec4899",
  3306: "#c084fc", 1883: "#14b8a6", 3389: "#38bdf8", 8080: "#fdba74",
}

function portHashColor(port: number): string {
  const hue = (port * 47) % 360
  return `hsl(${hue}, 70%, 62%)`
}

export function getPortColor(port?: number | null, fallbackType?: string): string {
  if (port == null) return fallbackType ? getProtocolMarkerColor(fallbackType) : "#6b7280"
  return PORT_MARKER_COLOR[port] ?? portHashColor(port)
}
