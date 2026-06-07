import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"
import { ALL_SERVICES, genDeployId, type ServiceKey } from "@/lib/sensor-compose-builder"
import { buildScript } from "@/lib/sensor-install-script"
import { resolveIngestUrl, getIngestSecret } from "@/lib/server-config"

const REGISTRY = process.env.SENSOR_REGISTRY ?? "ghcr.io/elrichi31/honeypot-ai"
const RAW_BASE = process.env.SENSOR_RAW_BASE ?? "https://raw.githubusercontent.com/elrichi31/honeypot-ai/master"

export type { ServiceKey }

function parseServices(value: string | null): ServiceKey[] {
  const requested = (value ?? "")
    .split(",")
    .map((service) => service.trim())
    .filter((service): service is ServiceKey => (ALL_SERVICES as string[]).includes(service))
  const services = requested.length > 0 ? requested : [...ALL_SERVICES]
  // Deception (OpenCanary) is an internal trap network reached via cowrie. Force
  // ssh in so the network has an entry point even if the caller omitted it.
  if (services.includes("deception") && !services.includes("ssh")) {
    services.unshift("ssh")
  }
  return services
}

function filenameSuffix(services: ServiceKey[], clientSlug: string) {
  if (clientSlug) return `${clientSlug}-${services.join("-")}`
  return services.length === ALL_SERVICES.length ? "all" : services.join("-")
}

function missingConfigResponse(ingestUrl: string | null, secret: string) {
  if (!ingestUrl) {
    return NextResponse.json(
      { error: "Could not resolve ingest URL. Set SENSOR_INGEST_URL in your .env" },
      { status: 500 },
    )
  }
  return secret ? null : NextResponse.json({ error: "INGEST_SHARED_SECRET is not set" }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const authCheck = await requireRole("analyst")
  if (!authCheck.ok) return authCheck.response

  const params = req.nextUrl.searchParams
  const services = parseServices(params.get("services"))
  const clientSlug = params.get("clientSlug")?.trim() ?? ""
  const clientName = params.get("clientName")?.trim() ?? ""
  const { url: ingestUrl } = await resolveIngestUrl()
  const secret = getIngestSecret()
  const configError = missingConfigResponse(ingestUrl, secret)
  if (configError) return configError
  if (!ingestUrl) return NextResponse.json({ error: "Could not resolve ingest URL" }, { status: 500 })

  const deployId = genDeployId()
  const filename = `install-sensor-${filenameSuffix(services, clientSlug)}.sh`
  await logInstallDownload(req, filename, services, clientSlug, deployId)

  return new NextResponse(buildScript(deployId, ingestUrl, secret, RAW_BASE, REGISTRY, services, clientSlug, clientName), {
    headers: {
      "Content-Type": "text/x-sh; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}

async function logInstallDownload(req: NextRequest, filename: string, services: ServiceKey[], clientSlug: string, deployId: string) {
  await logAudit({
    action: "DOWNLOAD",
    resource: "SENSOR",
    resourceName: filename,
    details: { filename, services, clientSlug: clientSlug || null, deployId },
    request: req,
  })
}
