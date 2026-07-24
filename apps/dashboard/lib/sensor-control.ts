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
  // ingest-api's actor schema only knows the staff ladder (viewer/analyst/admin/
  // superadmin) — "cliente" is a dashboard-only tenant-scoped role that reads
  // like a viewer (see roles-shared.ts), so translate it before it crosses the
  // control-plane boundary or the request 400s on an unrecognized role.
  const controlRole = auth.role === "cliente" ? "viewer" : auth.role
  return {
    "X-Control-Api-Token": secret,
    "X-Control-Actor-Id": auth.userId,
    "X-Control-Actor-Role": controlRole,
    "X-Control-Actor-Superadmin": String(auth.isSuperadmin),
    "X-Control-Actor-Global": String(auth.isGlobal),
    "X-Control-Actor-Ip": forwardedFor || "unknown",
    ...(auth.clientId ? { "X-Control-Actor-Client-Id": auth.clientId } : {}),
  }
}
