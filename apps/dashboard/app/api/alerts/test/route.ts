import { NextResponse } from "next/server"
import { sendDiscordAlert } from "@/lib/discord"

export async function POST() {
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
