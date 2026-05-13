import { NextResponse } from "next/server"

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

  return NextResponse.json({ ingestUrl, ip, port, source })
}
