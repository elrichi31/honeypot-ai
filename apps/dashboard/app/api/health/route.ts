import { NextResponse } from "next/server"

const INTERNAL_API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export async function GET() {
  try {
    const res = await fetch(`${INTERNAL_API}/health/db`, { signal: AbortSignal.timeout(5000), cache: "no-store" })
    if (!res.ok) return NextResponse.json({ apiOnline: false, lastEventAt: null })
    const data = await res.json()
    return NextResponse.json({ apiOnline: true, lastEventAt: data.lastEventAt ?? null })
  } catch {
    return NextResponse.json({ apiOnline: false, lastEventAt: null })
  }
}
