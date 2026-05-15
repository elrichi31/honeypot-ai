import { NextResponse } from "next/server"

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
  let ingestUrl: string
  let source: "SENSOR_INGEST_URL" | "NEXT_PUBLIC_API_URL" | "auto-detected"

  if (process.env.SENSOR_INGEST_URL) {
    ingestUrl = process.env.SENSOR_INGEST_URL
    source = "SENSOR_INGEST_URL"
  } else {
    const configured = process.env.NEXT_PUBLIC_API_URL ?? ""
    if (configured && !configured.includes("localhost") && !configured.includes("127.0.0.1")) {
      ingestUrl = configured
      source = "NEXT_PUBLIC_API_URL"
    } else {
      try {
        const res = await fetch("https://api.ipify.org?format=text", {
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) throw new Error("ipify error")
        const ip = (await res.text()).trim()
        ingestUrl = `http://${ip}:3000`
        source = "auto-detected"
      } catch {
        return NextResponse.json({ error: "Could not resolve public IP. Set SENSOR_INGEST_URL in your .env" }, { status: 500 })
      }
    }
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
