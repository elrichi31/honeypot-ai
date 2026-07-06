import { NextResponse } from "next/server"

/**
 * Logs the error server-side (with context) before responding, so a toast the
 * user never reports still leaves a traceable line in the dashboard logs.
 *
 * Generates its own short requestId (these routes run their own logic — OpenAI,
 * Docker control, etc. — rather than proxying to ingest-api, which already
 * stamps its own via Fastify's `request.id`) and logs + returns it so a bug
 * report can be grepped to this exact line. See ERROR_HANDLING.md Fase 5.
 */
export function logAndRespond(err: unknown, context: Record<string, unknown>): NextResponse {
  const message = err instanceof Error ? err.message : String(err)
  const requestId = crypto.randomUUID().slice(0, 8)
  console.error("[api]", { ...context, requestId }, err)
  return NextResponse.json({ error: message, requestId }, { status: 500 })
}
