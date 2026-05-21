export function countryFlag(code: string): string {
  if (!code || code.length !== 2) return ""
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("")
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

export function formatTs(ts: string): string {
  const d = new Date(ts)
  return (
    d.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "2-digit" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
  )
}
