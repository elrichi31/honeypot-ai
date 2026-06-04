import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"

const INTERNAL_API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

/** Invalidate the cached lists that show clients or sensor↔client grouping. */
function revalidateClientViews() {
  revalidatePath("/clients")
  revalidatePath("/clients/[slug]", "page")
  revalidatePath("/sensors")
}

function ingestHeaders(withBody = true) {
  return {
    ...(withBody ? { "Content-Type": "application/json" } : {}),
    ...(process.env.INGEST_SHARED_SECRET
      ? { "X-Ingest-Token": process.env.INGEST_SHARED_SECRET }
      : {}),
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const { clientId } = await params
  const body = await req.text()

  const res = await fetch(`${INTERNAL_API}/clients/${encodeURIComponent(clientId)}`, {
    method: "PATCH",
    headers: ingestHeaders(),
    body,
  })

  const responseBody = await res.text()

  if (res.ok) {
    revalidateClientViews()
    try {
      const parsed = JSON.parse(body)
      const updated = JSON.parse(responseBody)
      await logAudit({
        action: "UPDATE",
        resource: "CLIENT",
        resourceId: clientId,
        resourceName: updated?.name ?? parsed?.name,
        details: parsed,
        request: req,
      })
    } catch { /* non-critical */ }
  }

  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const { clientId } = await params

  const res = await fetch(`${INTERNAL_API}/clients/${encodeURIComponent(clientId)}`, {
    method: "DELETE",
    headers: ingestHeaders(false),
  })

  if (res.ok || res.status === 204) {
    revalidateClientViews()
    await logAudit({
      action: "DELETE",
      resource: "CLIENT",
      resourceId: clientId,
      request: req,
    })
  }

  if (res.status === 204) return new NextResponse(null, { status: 204 })

  const responseBody = await res.text()
  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
