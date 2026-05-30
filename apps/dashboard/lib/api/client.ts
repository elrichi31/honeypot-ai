export function getApiUrl() {
  return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
}

export async function apiFetch<T>(url: string, revalidate?: number): Promise<T> {
  const init: RequestInit = revalidate != null
    ? { next: { revalidate } }
    : { cache: "no-store" }
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`)
  return res.json()
}

export function buildSearchParams(params: Record<string, string | number | boolean | undefined | null>): URLSearchParams {
  const sp = new URLSearchParams()
  for (const [key, val] of Object.entries(params)) {
    if (val != null && val !== "") sp.set(key, String(val))
  }
  return sp
}
