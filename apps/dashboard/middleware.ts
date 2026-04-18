import { NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = ["/login", "/setup", "/api/auth", "/api/setup-status"]

function getSetCookieHeaders(response: Response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie()
  }

  const header = response.headers.get("set-cookie")
  if (!header) return []

  // Split combined Set-Cookie values without breaking the Expires attribute.
  return header.split(/,(?=\s*[^;=]+=[^;]+)/g)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const authResponse = await fetch(new URL("/api/auth/get-session", request.url), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
    cache: "no-store",
  }).catch(() => null)

  if (!authResponse?.ok) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const session = (await authResponse.json().catch(() => null)) as
    | { session?: unknown }
    | null

  if (!session?.session) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const response = NextResponse.next()

  for (const cookie of getSetCookieHeaders(authResponse)) {
    response.headers.append("set-cookie", cookie)
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
