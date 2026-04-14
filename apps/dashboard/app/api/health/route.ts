import { NextResponse } from "next/server"

const INTERNAL_API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export async function GET() {
  try {
    const [healthRes, sessionsRes] = await Promise.all([
      fetch(`${INTERNAL_API}/health`, { signal: AbortSignal.timeout(3000) }),
      fetch(`${INTERNAL_API}/sessions?limit=1`, { signal: AbortSignal.timeout(3000) }),
    ])

    const apiOnline = healthRes.ok

    let lastEventAt: string | null = null
    if (sessionsRes.ok) {
      const sessions = await sessionsRes.json()
      if (Array.isArray(sessions) && sessions.length > 0) {
        lastEventAt = sessions[0].startedAt ?? sessions[0].createdAt ?? null
      }
    }

    return NextResponse.json({ apiOnline, lastEventAt })
  } catch {
    return NextResponse.json({ apiOnline: false, lastEventAt: null })
  }
}
