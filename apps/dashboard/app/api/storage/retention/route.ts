export const dynamic = "force-dynamic"

const apiBase = () => process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export async function GET() {
  const res = await fetch(`${apiBase()}/storage/retention`, { cache: "no-store" })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}
