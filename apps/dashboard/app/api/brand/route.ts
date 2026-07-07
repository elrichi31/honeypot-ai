import { NextResponse } from "next/server"
import { readConfig } from "@/lib/server-config"

// Public (unauthenticated) on purpose: the login page renders pre-auth and
// needs to know which identity to show before a session exists.
export async function GET() {
  const config = readConfig()
  return NextResponse.json({ brand: config.brand ?? "default" })
}
