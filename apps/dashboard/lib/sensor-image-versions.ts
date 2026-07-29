/**
 * "Is this sensor running the current image?" answered against the registry
 * itself: the sha baked into whatever `:latest` resolves to right now is, by
 * definition, what the host would get if it pulled. Comparing against the
 * repo's HEAD instead would flag every sensor as stale on any commit that
 * never rebuilt an image.
 *
 * Every failure returns null and the UI simply says nothing — a registry
 * hiccup must never render a healthy sensor as broken.
 */
import type { Sensor } from "@/lib/api"

const REGISTRY = process.env.SENSOR_REGISTRY ?? "ghcr.io/elrichi31/honeypot-ai"
const CACHE_TTL_MS = 10 * 60 * 1000
const REQUEST_TIMEOUT_MS = 5000

const ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
].join(",")

// Which published image backs a sensor. Internal deception nodes carry their
// true protocol in realProtocol; `protocol` is just 'deception' for all of them.
const IMAGE_BY_PROTOCOL: Record<string, string> = {
  ssh: "cowrie",
  http: "web-honeypot",
  ftp: "ftp-honeypot",
  mysql: "mysql-honeypot",
  port: "port-honeypot",
  "port-scan": "port-honeypot",
  smb: "smb-honeypot",
  deception: "opencanary",
}

export function imageForSensor(sensor: Pick<Sensor, "protocol" | "realProtocol">): string | null {
  const key = sensor.realProtocol || sensor.protocol
  return IMAGE_BY_PROTOCOL[key] ?? null
}

type CacheEntry = { version: string | null; expires: number }
const cache = new Map<string, CacheEntry>()

async function ghcr(path: string, token: string, accept = ACCEPT) {
  const res = await fetch(`https://ghcr.io/v2/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: accept },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`ghcr ${path}: ${res.status}`)
  return res
}

async function fetchLatestVersion(image: string): Promise<string | null> {
  const repo = `${REGISTRY.replace(/^ghcr\.io\//, "")}/${image}`

  const tokenRes = await fetch(
    `https://ghcr.io/token?scope=${encodeURIComponent(`repository:${repo}:pull`)}&service=ghcr.io`,
    { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  )
  if (!tokenRes.ok) return null
  const { token } = await tokenRes.json()
  if (!token) return null

  const index = await (await ghcr(`${repo}/manifests/latest`, token)).json()
  // Multi-arch images answer with an index; single-arch ones are the manifest.
  const digest = index.manifests
    ? index.manifests.find((m: { platform?: { architecture?: string } }) =>
        m.platform?.architecture === "amd64")?.digest
    : null
  const manifest = digest ? await (await ghcr(`${repo}/manifests/${digest}`, token)).json() : index

  const configDigest = manifest?.config?.digest
  if (!configDigest) return null

  const config = await (await ghcr(`${repo}/blobs/${configDigest}`, token, "*/*")).json()
  const env: string[] = config?.config?.Env ?? []
  const baked = env.find(e => e.startsWith("SENSOR_IMAGE_VERSION="))?.split("=", 2)[1]
  // Locally built images carry the "dev" default; that is not a release.
  return baked && baked !== "dev" ? baked : null
}

export async function latestImageVersion(image: string): Promise<string | null> {
  const hit = cache.get(image)
  if (hit && hit.expires > Date.now()) return hit.version

  let version: string | null = null
  try {
    version = await fetchLatestVersion(image)
  } catch {
    // Registry unreachable or shape changed: fall through with null. Keep a
    // short-lived negative entry so one outage does not hammer ghcr.io.
  }
  cache.set(image, { version, expires: Date.now() + CACHE_TTL_MS })
  return version
}

export type SensorVersionStatus = "current" | "outdated" | "unknown"

export function versionStatus(reported: string | undefined, latest: string | null): SensorVersionStatus {
  if (!reported || !latest) return "unknown"
  return reported === latest ? "current" : "outdated"
}

/** sensorId → status, resolved in one pass over the distinct images in use. */
export async function resolveVersionStatuses(
  sensors: Pick<Sensor, "sensorId" | "protocol" | "realProtocol" | "imageVersion">[],
): Promise<Record<string, SensorVersionStatus>> {
  const images = [...new Set(sensors.map(imageForSensor).filter((i): i is string => i !== null))]
  const latest = new Map(
    await Promise.all(images.map(async image => [image, await latestImageVersion(image)] as const)),
  )

  const out: Record<string, SensorVersionStatus> = {}
  for (const sensor of sensors) {
    const image = imageForSensor(sensor)
    out[sensor.sensorId] = versionStatus(sensor.imageVersion, image ? latest.get(image) ?? null : null)
  }
  return out
}
