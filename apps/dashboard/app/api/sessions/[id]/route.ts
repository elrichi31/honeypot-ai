import { NextResponse } from "next/server"

const INTERNAL_API =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const res = await fetch(`${INTERNAL_API}/sessions/${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: "Upstream API unavailable" }, { status: 502 })
  }
}
