import { NextRequest, NextResponse } from "next/server"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"

const INTERNAL_API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

type SensorConfig = {
  name: string
  sensorPrefix: string
  ports: string
  probePorts: string
}

const SENSOR_CONFIGS: Record<string, SensorConfig> = {
  ssh: {
    name: "SSH Honeypot (Cowrie)",
    sensorPrefix: "cowrie",
    ports: "22 2222",
    probePorts: "2222 2222",
  },
  dionaea: {
    name: "Dionaea Multi-Protocol Honeypot",
    sensorPrefix: "dionaea",
    ports: "21 42 135 445 1433 1723 1883 3306 8081",
    probePorts: "21 42 135 445 1433 1723 1883 3306 81",
  },
  http: {
    name: "Web Honeypot",
    sensorPrefix: "web",
    ports: "80 8443",
    probePorts: "8080 8080",
  },
  "port-scan": {
    name: "Port Honeypot",
    sensorPrefix: "port",
    ports: "2375 3389 4444 5900 6379 8888 9090 9200 27017",
    probePorts: "2375 3389 4444 5900 6379 8888 9090 9200 27017",
  },
}

export async function GET(req: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const { searchParams } = new URL(req.url)
  const clientSlug = searchParams.get("clientSlug")
  const sensorType = searchParams.get("sensorType")

  if (!clientSlug || !sensorType) {
    return NextResponse.json({ error: "Missing clientSlug or sensorType" }, { status: 400 })
  }

  const config = SENSOR_CONFIGS[sensorType]
  if (!config) {
    return NextResponse.json({ error: "Unknown sensor type" }, { status: 400 })
  }

  const clientsRes = await fetch(`${INTERNAL_API}/clients`, { cache: "no-store" })
  if (!clientsRes.ok) {
    return NextResponse.json({ error: "Could not fetch clients" }, { status: 500 })
  }

  const clients = (await clientsRes.json()) as Array<{ slug: string; code: string; name: string }>
  const client = clients.find((c) => c.slug === clientSlug)
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }

  const code = client.code || clientSlug.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8)
  const sensorId = `${config.sensorPrefix}-01-${code}`
  const secret = process.env.INGEST_SHARED_SECRET ?? ""

  const lines = [
    `# ─────────────────────────────────────────────────`,
    `# Sensor: ${config.name}`,
    `# Client: ${client.name} (${code})`,
    `# Generated: ${new Date().toISOString()}`,
    `# ─────────────────────────────────────────────────`,
    ``,
    `# Replace with the public IP/hostname of your honeypot server`,
    `INGEST_API_URL=http://YOUR_SERVER_IP:3000`,
    `INGEST_SHARED_SECRET=${secret}`,
    ``,
    `SENSOR_ID=${sensorId}`,
    `SENSOR_NAME=${config.name}`,
    `SENSOR_PORTS="${config.ports}"`,
    `SENSOR_PROBE_PORTS="${config.probePorts}"`,
    ``,
    `# Public IP of this sensor machine (leave empty to auto-detect)`,
    `HONEYPOT_IP=`,
  ]

  const content = lines.join("\n")
  const filename = `${sensorId}.env`

  await logAudit({
    action: "DOWNLOAD",
    resource: "SENSOR",
    resourceId: sensorId,
    resourceName: `${config.name} (${client.name})`,
    details: { filename, sensorType, clientSlug },
    request: req,
  })

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
