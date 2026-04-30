import { getApiUrl } from "@/lib/api/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const controller = new AbortController()
  request.signal.addEventListener("abort", () => controller.abort())

  try {
    const upstream = await fetch(`${getApiUrl()}/events/live`, {
      cache: "no-store",
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    })

    if (!upstream.ok || !upstream.body) {
      return new Response("Live event stream is unavailable", { status: upstream.status || 502 })
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    if (controller.signal.aborted) {
      return new Response(null, { status: 204 })
    }

    const message = error instanceof Error ? error.message : "Unknown stream error"
    return new Response(message, { status: 502 })
  }
}
