export const dynamic = "force-dynamic"

export async function GET() {
  const apiBase = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
  const res = await fetch(`${apiBase}/api-defense/summary`, { cache: "no-store" })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}
