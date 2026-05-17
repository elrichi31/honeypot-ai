import { NextRequest, NextResponse } from "next/server"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"

const INTERNAL_API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

function ingestHeaders() {
  return {
    "Content-Type": "application/json",
    ...(process.env.INGEST_SHARED_SECRET
      ? { "X-Ingest-Token": process.env.INGEST_SHARED_SECRET }
      : {}),
  }
}

export async function POST(req: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const body = await req.text()
  const res = await fetch(`${INTERNAL_API}/sensor/tokens`, {
    method: "POST",
    headers: ingestHeaders(),
    body,
  })
  const responseBody = await res.text()

  if (res.ok) {
    try {
      const parsed = JSON.parse(body)
      const created = JSON.parse(responseBody)
      await logAudit({
        action: "CREATE",
        resource: "TOKEN",
        resourceId: created?.id,
        resourceName: parsed?.clientId,
        details: { clientId: parsed?.clientId, services: parsed?.services },
        request: req,
      })
    } catch { /* non-critical */ }
  }

  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
