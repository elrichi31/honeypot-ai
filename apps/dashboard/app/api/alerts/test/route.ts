import { NextResponse } from "next/server"
import { sendDiscordAlert } from "@/lib/discord"
import { requireRole } from "@/lib/roles"

export async function POST() {
  const auth_check = await requireRole("admin")
  if (!auth_check.ok) return auth_check.response

  await sendDiscordAlert({
    level: "info",
    title: "🧪 Test message — Honeypot AI",
    description: "Discord alerts are correctly configured.",
    fields: [
      { name: "Successful SSH login", value: "🔓 Immediate alert", inline: true },
      { name: "IP abuse score ≥ 80%", value: "🚨 On enrichment lookup", inline: true },
    ],
  })
  return NextResponse.json({ ok: true })
}
