import type { Sensor } from "@/lib/api"
import type { Group, Layout, SensorNode, Cluster } from "./types"
import { CANVAS_W, STEP, CLIENT_GAP, EXT_Y, INT_Y, INET_Y, NODE_H, INT_LABEL_Y } from "./constants"

// ─── IP helpers ───────────────────────────────────────────────────────────────
export function isPrivateIp(ip: string): boolean {
  if (!ip || ip === "-") return false
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return false
  const [a, b] = v4.split(".").map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

// ─── Group sensors by client ──────────────────────────────────────────────────
export function buildGroups(sensors: Sensor[]): Group[] {
  const map = new Map<string, Group>()

  for (const s of sensors) {
    const key = s.clientId ?? "__unassigned__"
    if (!map.has(key)) {
      map.set(key, { key, name: s.clientName ?? "Sin cliente", slug: s.clientSlug, external: [], internal: [] })
    }
    const g = map.get(key)!
    if (isPrivateIp(s.ip)) g.internal.push(s)
    else g.external.push(s)
  }

  return Array.from(map.values()).sort((a, b) =>
    a.key === "__unassigned__" ? 1 : b.key === "__unassigned__" ? -1 : a.name.localeCompare(b.name)
  )
}

// ─── Compute node positions in the fixed canvas space ────────────────────────
export function computeLayout(groups: Group[]): Layout {
  const rawWidths = groups.map(g => Math.max(1, g.external.length) * STEP)
  const rawTotal  = rawWidths.reduce((s, w) => s + w, 0) + Math.max(0, groups.length - 1) * CLIENT_GAP

  const scale = rawTotal > CANVAS_W - 80 ? (CANVAS_W - 80) / rawTotal : 1
  const S  = STEP * scale
  const CG = CLIENT_GAP * scale

  const extNodes: SensorNode[] = []
  const intNodes: SensorNode[] = []
  const clusters: Cluster[]    = []

  let cursor = (CANVAS_W - rawTotal * scale) / 2

  for (const group of groups) {
    const cw = Math.max(1, group.external.length) * S
    const cx = cursor + cw / 2

    group.external.forEach((s, i) => {
      extNodes.push({ sensor: s, x: cursor + i * S + S / 2, y: EXT_Y, clientKey: group.key })
    })

    const intCount = group.internal.length
    const intW     = Math.max(1, intCount) * S
    const iStart   = cx - intW / 2

    group.internal.forEach((s, i) => {
      intNodes.push({ sensor: s, x: iStart + i * S + S / 2, y: INT_Y, clientKey: group.key })
    })

    clusters.push({
      key: group.key, name: group.name, cx,
      extX1: cursor - 12, extX2: cursor + cw + 12,
      intX1: cx - intW / 2 - 12, intX2: cx + intW / 2 + 12,
      hasInt: intCount > 0,
    })

    cursor += cw + CG
  }

  return {
    internet: { x: CANVAS_W / 2, y: INET_Y },
    extNodes,
    intNodes,
    clusters,
  }
}

// ─── Cubic bezier path (vertical S-curve) ─────────────────────────────────────
export function bez(x1: number, y1: number, x2: number, y2: number): string {
  const d = Math.abs(y2 - y1) * 0.52
  return [
    `M ${x1.toFixed(1)} ${y1.toFixed(1)}`,
    `C ${x1.toFixed(1)} ${(y1 + d).toFixed(1)},`,
    `${x2.toFixed(1)} ${(y2 - d).toFixed(1)},`,
    `${x2.toFixed(1)} ${y2.toFixed(1)}`,
  ].join(" ")
}
