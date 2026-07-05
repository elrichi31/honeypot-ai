import { NextResponse } from "next/server"

/**
 * Logs the error server-side (with context) before responding, so a toast the
 * user never reports still leaves a traceable line in the dashboard logs.
 */
export function logAndRespond(err: unknown, context: Record<string, unknown>): NextResponse {
  const message = err instanceof Error ? err.message : String(err)
  console.error("[api]", context, err)
  return NextResponse.json({ error: message }, { status: 500 })
}
