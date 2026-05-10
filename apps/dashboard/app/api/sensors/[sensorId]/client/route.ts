import { NextRequest, NextResponse } from "next/server"

const INTERNAL_API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

function ingestHeaders() {
  return {
    "Content-Type": "application/json",
    ...(process.env.INGEST_SHARED_SECRET
      ? { "X-Ingest-Token": process.env.INGEST_SHARED_SECRET }
      : {}),
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ sensorId: string }> },
) {
  const { sensorId } = await params
  const body = await req.text()
  const res = await fetch(`${INTERNAL_API}/sensors/${encodeURIComponent(sensorId)}/client`, {
    method: "PUT",
    headers: ingestHeaders(),
    body,
  })
  const responseBody = await res.text()

  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
