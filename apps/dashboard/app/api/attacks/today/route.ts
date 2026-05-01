import { getApiUrl } from "@/lib/api/client"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    const res = await fetch(`${getApiUrl()}/attacks/today`, { cache: "no-store" })
    if (!res.ok) return NextResponse.json({ attackedCountries: [], sensors: [] })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ attackedCountries: [], sensors: [] })
  }
}
