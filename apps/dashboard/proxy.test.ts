/**
 * Run from apps/dashboard:
 *   npx tsx proxy.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { proxy } from "./proxy.ts"

function get(path: string) {
  return proxy(new NextRequest(new URL(`http://dash.internal${path}`)))
}

// Sensors authenticate with the shared ingest secret, not a session cookie. If
// the cookie gate catches this route, the caller is redirected to /login and
// silently receives that HTML page as its docker-compose.yml.
test("compose refresh is reachable without a session cookie", async () => {
  const res = await get("/api/sensor/compose/refresh?deployId=d1&services=int-ssh")
  assert.notEqual(res.status, 307, "must not redirect to /login")
  assert.equal(res.headers.get("location"), null)
})

test("the session gate still guards everything else", async () => {
  for (const path of ["/sensors", "/api/sensor/install", "/api/sensor/compose"]) {
    const res = await get(path)
    assert.ok(res.headers.get("location")?.endsWith("/login"), `${path} must redirect to /login`)
  }
})
