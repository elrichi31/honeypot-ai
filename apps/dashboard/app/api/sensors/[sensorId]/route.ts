import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"

const internalApiUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sensorId: string }> },
) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const { sensorId } = await params

  const res = await fetch(`${internalApiUrl}/sensors/${encodeURIComponent(sensorId)}`, {
    method: "DELETE",
    headers: {
      "X-Ingest-Token": process.env.INGEST_SHARED_SECRET ?? "",
    },
  })

  const data = await res.json().catch(() => ({}))

  if (res.ok) {
    // Drop the cached /sensors list (revalidate: 30) so the page re-render
    // triggered by router.refresh() shows fresh data instead of the stale row.
    revalidatePath("/sensors")
    await logAudit({
      action: "DELETE",
      resource: "SENSOR",
      resourceId: sensorId,
      resourceName: sensorId,
      request: req,
    })
  }

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status })
  }

  return NextResponse.json(data)
}
