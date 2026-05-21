import { type NextRequest } from "next/server"

export const dynamic = "force-dynamic"

const apiBase = () => process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export async function GET(request: NextRequest) {
  const search = new URL(request.url).search
  const res = await fetch(`${apiBase()}/storage/ingestion${search}`, { cache: "no-store" })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}
