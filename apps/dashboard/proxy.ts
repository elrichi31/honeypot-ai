import { NextRequest, NextResponse } from "next/server"

// "Public" here means "not gated on a session cookie". The compose-refresh
// route is called by sensor hosts through ingest-api, which have no session;
// it authenticates on the shared ingest secret itself. Without this entry the
// caller is redirected to /login and receives that page as its compose.
const PUBLIC_PATHS = [
  "/login", "/setup", "/api/auth", "/api/setup-status", "/api/brand", "/brands",
  "/api/sensor/compose/refresh",
]
const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
]

function isPrefetchRequest(request: NextRequest) {
  return (
    request.headers.has("next-router-prefetch") ||
    request.headers.has("x-middleware-prefetch") ||
    request.headers.get("purpose") === "prefetch"
  )
}

function hasSessionCookie(request: NextRequest) {
  return SESSION_COOKIE_NAMES.some((cookieName) => request.cookies.has(cookieName))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((publicPath) => pathname.startsWith(publicPath))) {
    return NextResponse.next()
  }

  if (isPrefetchRequest(request)) {
    return NextResponse.next()
  }

  if (!hasSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
