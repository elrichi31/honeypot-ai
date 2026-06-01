import { NextRequest, NextResponse } from "next/server"
import http from "http"
import { requireRole } from "@/lib/roles"
import { logAudit } from "@/lib/audit"

const ALLOWED_ACTIONS = new Set(["start", "stop", "restart"])
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/
const DOCKER_SOCKET = "/var/run/docker.sock"

const internalApiUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"

// Cache container names for 60s to avoid hitting ingest-api on every poll
const containerNameCache = new Map<string, { name: string | null; expiresAt: number }>()

async function getContainerName(sensorId: string): Promise<string | null> {
  const now = Date.now()
  const cached = containerNameCache.get(sensorId)
  if (cached && cached.expiresAt > now) return cached.name

  try {
    const res = await fetch(`${internalApiUrl}/sensors`, {
      headers: { "X-Ingest-Token": process.env.INGEST_SHARED_SECRET ?? "" },
      cache: "no-store",
    })
    if (!res.ok) return null
    const sensors = await res.json() as Array<{ sensorId: string; probeHost: string }>
    const sensor = sensors.find((s) => s.sensorId === sensorId)
    const name = sensor?.probeHost || null
    containerNameCache.set(sensorId, { name, expiresAt: now + 60_000 })
    return name
  } catch {
    return null
  }
}

function dockerRequest(method: string, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: DOCKER_SOCKET, path, method, headers: { "Content-Length": 0 } },
      (res) => {
        let body = ""
        res.on("data", (chunk) => { body += chunk })
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }))
      },
    )
    req.on("error", reject)
    req.end()
  })
}

// GET — returns actual Docker container state
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sensorId: string }> },
) {
  const { sensorId } = await params
  const containerName = await getContainerName(sensorId)
  if (!containerName) {
    return NextResponse.json({ status: "unmanaged" })
  }

  try {
    const { status, body } = await dockerRequest("GET", `/containers/${containerName}/json`)
    if (status === 404) return NextResponse.json({ status: "not_found" })
    if (status !== 200) return NextResponse.json({ status: "unknown" })
    const info = JSON.parse(body)
    return NextResponse.json({
      status: info.State?.Status ?? "unknown",   // running | exited | paused | restarting
      running: info.State?.Running ?? false,
      paused: info.State?.Paused ?? false,
      startedAt: info.State?.StartedAt,
      finishedAt: info.State?.FinishedAt,
      container: containerName,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes("ENOENT") || message.includes("EACCES")) {
      return NextResponse.json({ status: "socket_unavailable" })
    }
    return NextResponse.json({ status: "unknown" })
  }
}

// POST — start | stop | restart
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
    const { status, body: responseBody } = await dockerRequest(
      "POST", `/containers/${containerName}/${action}`,
    )

    if (status === 404) {
      return NextResponse.json({ error: `Container "${containerName}" not found.` }, { status: 404 })
    }
    if (status >= 500) {
      return NextResponse.json({ error: responseBody || "Docker daemon error" }, { status: 502 })
    }

    await logAudit({
      action: "UPDATE",
      resource: "SENSOR",
      resourceId: sensorId,
      resourceName: sensorId,
      details: { dockerAction: action, container: containerName },
      request: req,
    })

    return NextResponse.json({ ok: true, action, container: containerName })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes("ENOENT") || message.includes("EACCES")) {
      return NextResponse.json(
        { error: "Docker socket not available. Mount /var/run/docker.sock in the dashboard container." },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
