import { type NextRequest } from "next/server"
import { requireRole } from "@/lib/roles"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { SCOPE_NONE } from "@/lib/roles-shared"
import { db } from "@/lib/db"
import { collectClientReport } from "@/lib/reports/collect"
import { renderReportHtml } from "@/lib/reports/template"
import { htmlToPdf } from "@/lib/reports/pdf"
import { translate } from "@/lib/i18n/dictionaries"
import type { Locale, TranslationKey } from "@/lib/i18n/dictionaries"
import type { ReportRange } from "@/lib/reports/types"

export const dynamic = "force-dynamic"
// PDF generation with Playwright can take 5-15s; set a generous timeout.
export const maxDuration = 60

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

export async function GET(request: NextRequest) {
  const auth = await requireRole("viewer")
  if (!auth.ok) return auth.response

  const scope = await effectiveSensorScope()

  // Fail-closed: user has no tenant
  if (scope.clientId === SCOPE_NONE) {
    return Response.json({ error: "No tenant scope" }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const range = (sp.get("range") ?? "week") as ReportRange
  const timezone = sp.get("timezone") ?? "UTC"
  const locale = (sp.get("locale") ?? "en") as Locale

  if (range !== "week" && range !== "month") {
    return Response.json({ error: "Invalid range. Use week or month." }, { status: 400 })
  }

  // Superadmin viewing "global" must supply an explicit clientId in the query.
  let effectiveClientId = scope.clientId
  let sensorIds = scope.sensorIds

  if (effectiveClientId === null) {
    // superadmin global view
    const qClientId = sp.get("clientId")
    if (!qClientId) {
      return Response.json({ error: "clientId is required for global scope" }, { status: 400 })
    }
    effectiveClientId = qClientId
    // Resolve sensors for that client
    try {
      const { rows } = await db.query<{ sensor_id: string }>(
        `SELECT sensor_id FROM sensors WHERE client_id = $1`,
        [effectiveClientId],
      )
      sensorIds = rows.map((r) => r.sensor_id)
    } catch {
      return Response.json({ error: "Failed to resolve client sensors" }, { status: 500 })
    }
  }

  // Load client name
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

  let data
  try {
    data = await collectClientReport({
      sensorIds,
      range,
      timezone,
      meta: { clientName, clientSlug, range, timezone },
    })
  } catch (err) {
    console.error("[reports] collectClientReport failed:", err)
    return Response.json({ error: "Failed to collect report data" }, { status: 500 })
  }

  let html: string
  try {
    html = renderReportHtml(data, t)
  } catch (err) {
    console.error("[reports] renderReportHtml failed:", err)
    return Response.json({ error: "Failed to render report HTML" }, { status: 500 })
  }

  let pdf: Buffer
  try {
    pdf = await htmlToPdf(html)
  } catch (err) {
    console.error("[reports] htmlToPdf failed:", err)
    return Response.json({ error: "Failed to generate PDF" }, { status: 500 })
  }

  const date = new Date().toISOString().slice(0, 10)
  const filename = `report-${clientSlug}-${range}-${date}.pdf`

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
