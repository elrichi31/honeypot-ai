import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { logAudit } from "@/lib/audit"

const internalApiUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sensorId: string }> },
) {
  const { sensorId } = await params

  const res = await fetch(`${internalApiUrl}/sensors/${encodeURIComponent(sensorId)}`, {
    method: "DELETE",
    headers: {
      "X-Ingest-Token": process.env.INGEST_SHARED_SECRET ?? "",
    },
  })

  const data = await res.json().catch(() => ({}))

  if (res.ok) {
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
