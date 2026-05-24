import { NextResponse } from "next/server"
import { sendDiscordAlert } from "@/lib/discord"
import { requireRole } from "@/lib/roles"

export async function POST() {
  const auth_check = await requireRole("admin")
  if (!auth_check.ok) return auth_check.response

  await sendDiscordAlert({
    level: "info",
    title: "🧪 Mensaje de prueba — Honeypot AI",
    description: "Las alertas de Discord están correctamente configuradas.",
    fields: [
      { name: "Login SSH exitoso", value: "🔓 Alerta inmediata", inline: true },
      { name: "IP abuse score ≥ 80%", value: "🚨 Al consultar enrichment", inline: true },
    ],
  })
  return NextResponse.json({ ok: true })
}
