import type { NextRequest } from "next/server"
import type { AuthOk } from "@/lib/roles"

const internalApiUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"

export function controlApiUrl(path: string): string {
  return `${internalApiUrl}${path}`
}

export function controlHeaders(auth: AuthOk, request: NextRequest): HeadersInit | null {
  const secret = process.env.CONTROL_API_SECRET
  if (!secret) return null

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return {
    "X-Control-Api-Token": secret,
    "X-Control-Actor-Id": auth.userId,
    "X-Control-Actor-Role": auth.role,
    "X-Control-Actor-Superadmin": String(auth.isSuperadmin),
    "X-Control-Actor-Ip": forwardedFor || "unknown",
    ...(auth.clientId ? { "X-Control-Actor-Client-Id": auth.clientId } : {}),
  }
}
