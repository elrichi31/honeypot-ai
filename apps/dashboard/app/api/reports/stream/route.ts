import { type NextRequest } from "next/server"
import { resolveReportRequest } from "@/lib/reports/resolve-request"
import { collectClientReport } from "@/lib/reports/collect"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// SSE: streams real per-stage collection progress, then the full report data.
// Consumed by the client with EventSource to drive a progress bar + on-page view.
export async function GET(request: NextRequest) {
  const resolved = await resolveReportRequest(request.nextUrl.searchParams)
  if (!resolved.ok) return Response.json({ error: resolved.error }, { status: resolved.status })

  const { sensorIds, clientName, clientSlug, startIso, endIso, timezone } = resolved.value
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`))
      }
      try {
        const data = await collectClientReport({
          sensorIds,
          startDate: startIso,
          endDate: endIso,
          timezone,
          meta: { clientName, clientSlug, startDate: startIso, endDate: endIso, timezone },
          onProgress: (completed, total) => send("progress", { completed, total }),
        })
        send("result", data)
      } catch (err) {
        console.error("[reports] stream collect failed:", err)
        send("failed", { error: "Failed to collect report data" })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
