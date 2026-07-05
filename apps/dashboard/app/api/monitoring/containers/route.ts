import { NextResponse } from "next/server"
import http from "http"
import { existsSync } from "fs"
import { requireRole } from "@/lib/roles"

export const dynamic = "force-dynamic"

const DOCKER_SOCKET = existsSync("/host/var/run/docker.sock")
  ? "/host/var/run/docker.sock"
  : "/var/run/docker.sock"

interface DockerContainer {
  Names: string[]
  State: string
  Status: string
  Created: number
  Image: string
}

function dockerGet(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: DOCKER_SOCKET, path, method: "GET" },
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

export async function GET() {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  try {
    const { status, body } = await dockerGet("/containers/json?all=true")
    if (status !== 200) return NextResponse.json([])

    const containers = JSON.parse(body) as DockerContainer[]
    const result = containers.map((c) => ({
      name:    c.Names[0]?.replace(/^\//, "") ?? "unknown",
      state:   c.State,
      status:  c.Status,
      image:   c.Image.split(":")[0].split("/").pop() ?? c.Image,
      created: c.Created,
    }))

    result.sort((a, b) => {
      const order = ["running", "paused", "exited"]
      return order.indexOf(a.state) - order.indexOf(b.state)
    })

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("ENOENT") || msg.includes("EACCES")) {
      console.error("[api] /api/monitoring/containers", { dockerSocket: DOCKER_SOCKET }, err)
      return NextResponse.json({ error: "socket_unavailable" }, { status: 503 })
    }
    console.error("[api] /api/monitoring/containers", { dockerSocket: DOCKER_SOCKET, path: "/containers/json?all=true" }, err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
