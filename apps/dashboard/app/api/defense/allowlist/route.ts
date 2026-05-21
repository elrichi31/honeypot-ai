import { type NextRequest } from "next/server"

export const dynamic = "force-dynamic"

const apiBase = () => process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export async function GET() {
  const res = await fetch(`${apiBase()}/api-defense/allowlist`, { cache: "no-store" })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const res = await fetch(`${apiBase()}/api-defense/allowlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}
