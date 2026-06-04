import { NextResponse } from "next/server"
import { requireRole } from "@/lib/roles"
import { resolveIngestUrl } from "@/lib/server-config"

async function getVmdkInfo(): Promise<{ releasedAt: string | null }> {
  let releasedAt: string | null = null

  const vmdkUrl = process.env.BASE_VMDK_URL
  if (vmdkUrl) {
    // Parse GitHub releases URL: https://github.com/{owner}/{repo}/releases/download/{tag}/{file}
    const match = vmdkUrl.match(/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\//)
    if (match) {
      const [, owner, repo, tag] = match
      const apiUrl = tag === "latest"
        ? `https://api.github.com/repos/${owner}/${repo}/releases/latest`
        : `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`
      try {
        const res = await fetch(apiUrl, {
          headers: { Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const data = await res.json() as { assets?: Array<{ name: string; updated_at: string }> }
          // Use the asset's updated_at — reflects when the file was last replaced, not when the release was created
          const fileName = vmdkUrl.split("/").pop() ?? ""
          const asset = data.assets?.find(a => a.name === fileName)
          releasedAt = asset?.updated_at ?? null
        }
      } catch {
        // ignore — optional info
      }
    }
  }

  return { releasedAt }
}

export async function GET() {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const { url: ingestUrl, source } = await resolveIngestUrl()
  if (!ingestUrl) {
    return NextResponse.json(
      { error: "Could not resolve ingest URL. Set it in Settings → Infrastructure (Manual) or define SENSOR_INGEST_URL in your .env" },
      { status: 500 },
    )
  }

  let ip = ""
  let port = ""
  try {
    const url = new URL(ingestUrl)
    ip = url.hostname
    port = url.port || (url.protocol === "https:" ? "443" : "80")
  } catch {
    ip = ingestUrl
  }

  const { releasedAt } = await getVmdkInfo()

  let ovaUrl: string | null = null
  if (process.env.BASE_OVA_URL) {
    ovaUrl = process.env.BASE_OVA_URL
  } else if (process.env.BASE_VMDK_URL) {
    ovaUrl = process.env.BASE_VMDK_URL.replace(/\.vmdk(\?.*)?$/, ".ova$1")
  }

  return NextResponse.json({ ingestUrl, ip, port, source, vmdkReleasedAt: releasedAt, ovaUrl })
}
