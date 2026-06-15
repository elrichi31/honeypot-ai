import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/roles"
import { getApiUrl, ingestHeaders } from "@/lib/api/server"

const INTERNAL_API = getApiUrl()

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const { clientId } = await params

  // Fetch the client to get its CrowdStrike credentials
  const clientRes = await fetch(`${INTERNAL_API}/clients`, {
    headers: ingestHeaders(false),
    signal: AbortSignal.timeout(5000),
  })
  if (!clientRes.ok) return NextResponse.json({ error: "Could not fetch clients" }, { status: 502 })

  const clients = await clientRes.json() as Array<{
    id: string
    crowdstrikeHecUrl: string
    crowdstrikeApiKey: string
  }>
  const client = clients.find((c) => c.id === clientId)
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })
  if (!client.crowdstrikeHecUrl || !client.crowdstrikeApiKey) {
    return NextResponse.json({ error: "CrowdStrike credentials not configured" }, { status: 400 })
  }

  const event = {
    time: Math.floor(Date.now() / 1000),
    source: "honeypot-ai",
    sourcetype: "honeypot:alert",
    event: {
      severity: 3,
      level: "info",
      title: "🧪 Honeypot AI — CrowdStrike test event",
      description: "This is a test event sent from Honeypot AI to verify the CrowdStrike Next-Gen SIEM integration.",
      src_ip: null,
      sensor_id: null,
    },
  }

  try {
    const res = await fetch(client.crowdstrikeHecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${client.crowdstrikeApiKey}`,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return NextResponse.json({ error: `CrowdStrike returned ${res.status}`, detail: text }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
