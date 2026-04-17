import { betterFetch } from "@better-fetch/fetch"
import { NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = ["/login", "/setup", "/api/auth", "/api/setup-status"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const { data: session } = await betterFetch<{ session: unknown }>(
    "/api/auth/get-session",
    {
      baseURL: request.nextUrl.origin,
      headers: { cookie: request.headers.get("cookie") ?? "" },
    }
  )

  if (!session?.session) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
