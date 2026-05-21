import { type NextRequest } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const apiBase = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
  const res = await fetch(`${apiBase}/api-defense/events${new URL(request.url).search}`, { cache: "no-store" })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}
