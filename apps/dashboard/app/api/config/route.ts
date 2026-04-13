import { NextRequest, NextResponse } from "next/server"
import { readConfig, writeConfig, getOpenAiKey } from "@/lib/server-config"

export async function GET() {
  const key = getOpenAiKey()
  return NextResponse.json({
    openaiApiKey: key ? `${key.slice(0, 7)}${"•".repeat(20)}` : "",
    hasKey: !!key,
  })
}

export async function POST(req: NextRequest) {
  const { openaiApiKey } = await req.json()

  if (typeof openaiApiKey !== "string") {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 })
  }

  const config = readConfig()
  config.openaiApiKey = openaiApiKey.trim() || undefined
  writeConfig(config)

  return NextResponse.json({ ok: true })
}
