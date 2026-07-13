import { type NextRequest } from "next/server"
import { requireRole } from "@/lib/roles"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { SCOPE_NONE } from "@/lib/roles-shared"
import { db } from "@/lib/db"
import { collectClientReport } from "@/lib/reports/collect"
import { generatePdf } from "@/lib/reports/pdf"
import { translate } from "@/lib/i18n/dictionaries"
import type { Locale, TranslationKey } from "@/lib/i18n/dictionaries"
import { logAndRespond } from "@/lib/api-error"

const MAX_SPAN_MS = 92 * 24 * 60 * 60 * 1000

export const dynamic = "force-dynamic"
export const maxDuration = 30

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

export async function GET(request: NextRequest) {
  const auth = await requireRole("viewer")
  if (!auth.ok) return auth.response

  const scope = await effectiveSensorScope()

  if (scope.clientId === SCOPE_NONE) {
    return Response.json({ error: "No tenant scope" }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const startDate = sp.get("startDate")
  const endDate = sp.get("endDate")
  const timezone = sp.get("timezone") ?? "UTC"
  const locale = (sp.get("locale") ?? "en") as Locale

  const start = startDate ? new Date(startDate) : null
  const end = endDate ? new Date(endDate) : null
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return Response.json({ error: "startDate and endDate are required (ISO 8601)." }, { status: 400 })
  }
  if (start.getTime() >= end.getTime()) {
    return Response.json({ error: "startDate must be before endDate." }, { status: 400 })
  }
  if (end.getTime() - start.getTime() > MAX_SPAN_MS) {
    return Response.json({ error: "Date range must not exceed 92 days." }, { status: 400 })
  }

  let effectiveClientId = scope.clientId
  let sensorIds = scope.sensorIds

  const resolveClientSensors = async (clientId: string) => {
    const { rows } = await db.query<{ sensor_id: string }>(
      `SELECT sensor_id FROM sensors WHERE client_id = $1`,
      [clientId],
    )
    return rows.map((r) => r.sensor_id)
  }

  if (effectiveClientId === null) {
    const qClientId = sp.get("clientId")
    if (!qClientId) {
      return Response.json({ error: "clientId is required for global scope" }, { status: 400 })
    }
    effectiveClientId = qClientId
  }

  if (effectiveClientId && sensorIds === undefined) {
    try {
      sensorIds = await resolveClientSensors(effectiveClientId)
    } catch (err) {
      return logAndRespond(err, { route: "/api/reports", step: "resolveClientSensors", clientId: effectiveClientId })
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
    // Non-fatal: use id as name fallback
  }

  const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars)

  const startIso = start.toISOString()
  const endIso = end.toISOString()

  let data
  try {
    data = await collectClientReport({
      sensorIds,
      startDate: startIso,
      endDate: endIso,
      timezone,
      meta: { clientName, clientSlug, startDate: startIso, endDate: endIso, timezone },
    })
  } catch (err) {
    console.error("[reports] collectClientReport failed:", err)
    return Response.json({ error: "Failed to collect report data" }, { status: 500 })
  }

  let pdf: Buffer
  try {
    pdf = await generatePdf(data, t)
  } catch (err) {
    console.error("[reports] generatePdf failed:", err)
    return Response.json({ error: "Failed to generate PDF" }, { status: 500 })
  }

  const filename = `report-${clientSlug}-${startIso.slice(0, 10)}_${endIso.slice(0, 10)}.pdf`

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  })
}
