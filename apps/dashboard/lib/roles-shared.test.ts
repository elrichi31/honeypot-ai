/**
 * Tests for tenant scope resolution (the core of multi-tenant isolation).
 * Run from apps/dashboard:  npx tsx --test lib/roles-shared.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { resolveScopeClientId, SCOPE_NONE } from "./roles-shared.ts"

test("superadmin with no tenant selected → null (all clients)", () => {
  const r = resolveScopeClientId({ isSuperadmin: true, clientId: null })
  assert.equal(r.clientId, null)
  assert.equal(r.denied, false)
})

test("superadmin entering a tenant → that client", () => {
  const r = resolveScopeClientId({ isSuperadmin: true, clientId: null }, "client-x")
  assert.equal(r.clientId, "client-x")
})

test("scoped user is forced to their own client, ignoring a different request", () => {
  const r = resolveScopeClientId({ isSuperadmin: false, clientId: "client-a" }, "client-b")
  assert.equal(r.clientId, "client-a", "must NOT honor the requested other client")
  assert.equal(r.denied, true, "mismatch flagged for auditing")
})

test("scoped user requesting their own client → allowed, not denied", () => {
  const r = resolveScopeClientId({ isSuperadmin: false, clientId: "client-a" }, "client-a")
  assert.equal(r.clientId, "client-a")
  assert.equal(r.denied, false)
})

test("non-superadmin without a clientId → SCOPE_NONE (fail-closed, sees nothing)", () => {
  const r = resolveScopeClientId({ isSuperadmin: false, clientId: null }, "client-b")
  assert.equal(r.clientId, SCOPE_NONE)
})
