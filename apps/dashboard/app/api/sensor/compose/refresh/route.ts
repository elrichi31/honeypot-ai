import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { ALL_SERVICES, buildCompose, type ServiceKey } from "@/lib/sensor-compose-builder"
import { buildScript, helperScript, refreshManifest } from "@/lib/sensor-install-script"
import { resolveIngestUrl, getIngestSecret } from "@/lib/server-config"

const REGISTRY = process.env.SENSOR_REGISTRY ?? "ghcr.io/elrichi31/honeypot-ai"
const RAW_BASE = process.env.SENSOR_RAW_BASE ?? "https://raw.githubusercontent.com/elrichi31/honeypot-ai/master"

const VALID_SERVICES: ServiceKey[] = [
  ...ALL_SERVICES,
  "internal-canary", "smb", "int-smb", "int-mysql", "int-ssh", "int-http",
]

function tokenMatches(presented: string, expected: string) {
  if (!expected || presented.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(presented), Buffer.from(expected))
}

// Regenerates the compose of an ALREADY deployed sensor so sensor-update can
// pick up template fixes without a full reinstall. Unlike the sibling route it
// takes the deployId instead of minting one: a fresh id would rename every
// sensor on the host and orphan the old rows.
//
// Session auth is not an option — the caller is a sensor host, reaching this
// through ingest-api because the dashboard is not internet-facing. It presents
// the shared ingest secret, which it must already hold to run a sensor, and
// which is exactly what the returned compose carries. No new access is granted.
export async function GET(req: NextRequest) {
  const secret = getIngestSecret()
  if (!tokenMatches(req.headers.get("x-ingest-token") ?? "", secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const params = req.nextUrl.searchParams
  const deployId = params.get("deployId")?.trim() ?? ""
  if (!deployId) return NextResponse.json({ error: "Missing deployId" }, { status: 400 })

  const services = (params.get("services") ?? "")
    .split(",")
    .map(s => s.trim())
    .filter((s): s is ServiceKey => (VALID_SERVICES as string[]).includes(s))
  if (services.length === 0) return NextResponse.json({ error: "No valid services" }, { status: 400 })

  const { url: ingestUrl } = await resolveIngestUrl()
  if (!ingestUrl) return NextResponse.json({ error: "Could not resolve ingest URL" }, { status: 500 })

  const clientSlug = params.get("clientSlug")?.trim() ?? ""
  const clientName = params.get("clientName")?.trim() ?? ""
  const text = (body: string) =>
    new NextResponse(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } })

  // One route, three payloads: the compose, the list of everything else the
  // install owns, and each helper command. Splitting them would mean three
  // proxy hops and three allowlist entries for no gain.
  switch (params.get("kind") ?? "compose") {
    case "compose":
      return new NextResponse(
        buildCompose(deployId, ingestUrl, secret, services, REGISTRY, clientSlug, clientName, RAW_BASE),
        { headers: { "Content-Type": "text/yaml; charset=utf-8" } },
      )

    case "files": {
      // Reuse the caller's own params so each helper URL carries the identity
      // this request already proved; building them from kind+name alone gets a
      // 400 back from the route that has to generate them.
      const helperUrl = (name: string) => {
        const next = new URLSearchParams(params)
        next.set("kind", "helper")
        next.set("name", name)
        return `${ingestUrl}/sensor/compose?${next}`
      }
      return text(refreshManifest(services, RAW_BASE, helperUrl))
    }

    case "helper": {
      const name = params.get("name")?.trim() ?? ""
      const built = buildScript(deployId, ingestUrl, secret, RAW_BASE, REGISTRY, services, clientSlug, clientName)
      const helper = helperScript(built, name)
      if (!helper) return NextResponse.json({ error: `Unknown helper: ${name}` }, { status: 404 })
      return text(helper)
    }

    default:
      return NextResponse.json({ error: "Unknown kind" }, { status: 400 })
  }
}
