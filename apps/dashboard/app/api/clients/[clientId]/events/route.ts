import { type NextRequest } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params
  const apiBase = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
  const upstream = `${apiBase}/clients/${encodeURIComponent(clientId)}/events${new URL(request.url).search}`
  const res = await fetch(upstream, { cache: "no-store" })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}
