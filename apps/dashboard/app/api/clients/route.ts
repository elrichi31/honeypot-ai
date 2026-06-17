import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"
import { getApiUrl, ingestHeaders } from "@/lib/api/server"

const INTERNAL_API = getApiUrl()
const UPSTREAM_TIMEOUT_MS = 10000

/** Invalidate the cached lists that show clients or sensor↔client grouping. */
function revalidateClientViews() {
  revalidatePath("/clients")
  revalidatePath("/sensors")
}

export async function GET() {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const res = await fetch(`${INTERNAL_API}/clients`, {
    cache: "no-store",
    // GET /clients on the ingest-api is guarded by ensureIngestToken, so the
    // proxy must forward the shared secret (the POST already did).
    headers: ingestHeaders(false),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
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
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
  const responseBody = await res.text()

  if (res.ok) {
    revalidateClientViews()
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
