import { NextRequest, NextResponse } from "next/server"

export function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ["/threats/:ip*", "/web-attacks/:ip*", "/ssh/:ip*"],
}
