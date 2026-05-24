import { NextRequest, NextResponse } from "next/server"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"

const INTERNAL_API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

function ingestHeaders(contentType = true) {
  return {
    ...(contentType ? { "Content-Type": "application/json" } : {}),
    ...(process.env.INGEST_SHARED_SECRET
      ? { "X-Ingest-Token": process.env.INGEST_SHARED_SECRET }
      : {}),
  }
}

export async function GET() {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const res = await fetch(`${INTERNAL_API}/clients`, { cache: "no-store" })
  const body = await res.text()

  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}

export async function POST(req: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const body = await req.text()
  const res = await fetch(`${INTERNAL_API}/clients`, {
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
        resource: "CLIENT",
        resourceId: created?.id,
        resourceName: parsed?.name ?? created?.name,
        details: { name: parsed?.name, slug: parsed?.slug },
        request: req,
      })
    } catch { /* non-critical */ }
  }

  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
