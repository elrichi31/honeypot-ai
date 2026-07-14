import { type NextRequest } from "next/server"
import { resolveReportRequest } from "@/lib/reports/resolve-request"
import { collectClientReport } from "@/lib/reports/collect"
import { generatePdf } from "@/lib/reports/pdf"
import { translate } from "@/lib/i18n/dictionaries"
import type { TranslationKey } from "@/lib/i18n/dictionaries"

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET(request: NextRequest) {
  const resolved = await resolveReportRequest(request.nextUrl.searchParams)
  if (!resolved.ok) return Response.json({ error: resolved.error }, { status: resolved.status })

  const { sensorIds, clientName, clientSlug, startIso, endIso, timezone, locale } = resolved.value

  const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars)

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
