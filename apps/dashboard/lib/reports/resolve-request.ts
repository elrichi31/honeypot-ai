// Server-only: shared auth + tenant-scope + window resolution for report
// endpoints (PDF download and SSE stream). Keeps both routes DRY.
import { requireRole } from "@/lib/roles"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { SCOPE_NONE } from "@/lib/roles-shared"
import { db } from "@/lib/db"
import type { Locale } from "@/lib/i18n/dictionaries"

const MAX_SPAN_MS = 92 * 24 * 60 * 60 * 1000

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

export interface ResolvedReportRequest {
  sensorIds: string[] | undefined
  clientName: string
  clientSlug: string
  startIso: string
  endIso: string
  timezone: string
  locale: Locale
}

export type ResolveResult =
  | { ok: true; value: ResolvedReportRequest }
  | { ok: false; error: string; status: number }

export async function resolveReportRequest(sp: URLSearchParams): Promise<ResolveResult> {
  const auth = await requireRole("viewer")
  if (!auth.ok) return { ok: false, error: "Unauthorized", status: 401 }

  const scope = await effectiveSensorScope()
  if (scope.clientId === SCOPE_NONE) return { ok: false, error: "No tenant scope", status: 403 }

  const timezone = sp.get("timezone") ?? "UTC"
  const locale = (sp.get("locale") ?? "en") as Locale

  const start = sp.get("startDate") ? new Date(sp.get("startDate")!) : null
  const end = sp.get("endDate") ? new Date(sp.get("endDate")!) : null
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return { ok: false, error: "startDate and endDate are required (ISO 8601).", status: 400 }
  if (start.getTime() >= end.getTime())
    return { ok: false, error: "startDate must be before endDate.", status: 400 }
  if (end.getTime() - start.getTime() > MAX_SPAN_MS)
    return { ok: false, error: "Date range must not exceed 92 days.", status: 400 }

  let effectiveClientId = scope.clientId
  let sensorIds = scope.sensorIds

  if (effectiveClientId === null) {
    const qClientId = sp.get("clientId")
    if (!qClientId) return { ok: false, error: "clientId is required for global scope", status: 400 }
    effectiveClientId = qClientId
  }

  if (effectiveClientId && sensorIds === undefined) {
    try {
      const { rows } = await db.query<{ sensor_id: string }>(
        `SELECT sensor_id FROM sensors WHERE client_id = $1`,
        [effectiveClientId],
      )
      sensorIds = rows.map((r) => r.sensor_id)
    } catch {
      return { ok: false, error: "Failed to resolve client sensors", status: 500 }
    }
  }

  let clientName = effectiveClientId
  let clientSlug = slugify(effectiveClientId)
  try {
    const { rows } = await db.query<{ name: string; slug: string | null }>(
      `SELECT name, slug FROM clients WHERE id = $1`,
      [effectiveClientId],
    )
    if (rows[0]) {
      clientName = rows[0].name
      clientSlug = rows[0].slug ?? slugify(rows[0].name)
    }
  } catch {
    // Non-fatal: fall back to id as name
  }

  return {
    ok: true,
    value: {
      sensorIds,
      clientName,
      clientSlug,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      timezone,
      locale,
    },
  }
}
