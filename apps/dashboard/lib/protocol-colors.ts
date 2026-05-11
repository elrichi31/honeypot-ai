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
}

export const PROTOCOL_CHIP_CLASS: Record<string, string> = {
  ssh: "text-rose-400 border-rose-500/40 bg-rose-500/10",
  http: "text-orange-400 border-orange-500/40 bg-orange-500/10",
  ftp: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
  mysql: "text-purple-400 border-purple-500/40 bg-purple-500/10",
  "port-scan": "text-sky-400 border-sky-500/40 bg-sky-500/10",
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
