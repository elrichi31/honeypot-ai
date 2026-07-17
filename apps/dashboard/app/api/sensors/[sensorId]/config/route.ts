import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireRole } from "@/lib/roles"
import { logAudit } from "@/lib/audit"

export const dynamic = "force-dynamic"

const internalApiUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sensorId: string }> },
) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const { sensorId } = await params
  const res = await fetch(`${internalApiUrl}/sensors/${encodeURIComponent(sensorId)}/config`, {
    cache: "no-store",
    headers: { "X-Ingest-Token": process.env.INGEST_SHARED_SECRET ?? "" },
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ sensorId: string }> },
) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const { sensorId } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const res = await fetch(`${internalApiUrl}/sensors/${encodeURIComponent(sensorId)}/config`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Ingest-Token": process.env.INGEST_SHARED_SECRET ?? "",
      "X-Requested-By": auth_check.userId,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))

  if (res.ok) {
    await logAudit({
      action: "UPDATE",
      resource: "SENSOR_CONFIG",
      resourceId: sensorId,
      resourceName: sensorId,
      request: req,
    })
  }

  return NextResponse.json(data, { status: res.status })
}
