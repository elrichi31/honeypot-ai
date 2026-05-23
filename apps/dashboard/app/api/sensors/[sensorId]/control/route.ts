import { NextRequest, NextResponse } from "next/server"
import { exec } from "child_process"
import { promisify } from "util"
import { requireRole } from "@/lib/roles"
import { logAudit } from "@/lib/audit"

const execAsync = promisify(exec)

const ALLOWED_ACTIONS = new Set(["start", "stop", "restart"])

// Only allow alphanumeric + dash + underscore container names to prevent injection
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/

const internalApiUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"

async function getContainerName(sensorId: string): Promise<string | null> {
  try {
    const res = await fetch(`${internalApiUrl}/sensors`, {
      headers: { "X-Ingest-Token": process.env.INGEST_SHARED_SECRET ?? "" },
      cache: "no-store",
    })
    if (!res.ok) return null
    const sensors = await res.json() as Array<{ sensorId: string; probeHost: string }>
    const sensor = sensors.find((s) => s.sensorId === sensorId)
    return sensor?.probeHost || null
  } catch {
    return null
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sensorId: string }> },
) {
  const auth_check = await requireRole("admin")
  if (!auth_check.ok) return auth_check.response

  const { sensorId } = await params
  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? "")

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Invalid action. Use start, stop, or restart." }, { status: 400 })
  }

  const containerName = await getContainerName(sensorId)
  if (!containerName) {
    return NextResponse.json({ error: "Sensor not found or has no container name." }, { status: 404 })
  }

  if (!SAFE_NAME_RE.test(containerName)) {
    return NextResponse.json({ error: "Invalid container name." }, { status: 400 })
  }

  try {
    const { stdout, stderr } = await execAsync(`docker container ${action} ${containerName}`)
    const output = (stdout + stderr).trim()

    await logAudit({
      action: "UPDATE",
      resource: "SENSOR",
      resourceId: sensorId,
      resourceName: sensorId,
      details: { dockerAction: action, container: containerName, output },
      request: req,
    })

    return NextResponse.json({ ok: true, action, container: containerName, output })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
