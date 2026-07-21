/**
 * Tests for tenant scope resolution (the core of multi-tenant isolation).
 * Run from apps/dashboard:  npx tsx --test lib/roles-shared.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { resolveScopeClientId, isGlobalRole, hasPermission, SCOPE_NONE } from "./roles-shared.ts"

test("global staff with no tenant selected → null (all clients)", () => {
  const r = resolveScopeClientId({ isGlobal: true, clientId: null })
  assert.equal(r.clientId, null)
  assert.equal(r.denied, false)
})

test("global staff entering a tenant → that client", () => {
  const r = resolveScopeClientId({ isGlobal: true, clientId: null }, "client-x")
  assert.equal(r.clientId, "client-x")
})

test("cliente is forced to their own client, ignoring a different request", () => {
  const r = resolveScopeClientId({ isGlobal: false, clientId: "client-a" }, "client-b")
  assert.equal(r.clientId, "client-a", "must NOT honor the requested other client")
  assert.equal(r.denied, true, "mismatch flagged for auditing")
})

test("cliente requesting their own client → allowed, not denied", () => {
  const r = resolveScopeClientId({ isGlobal: false, clientId: "client-a" }, "client-a")
  assert.equal(r.clientId, "client-a")
  assert.equal(r.denied, false)
})

test("cliente without a clientId → SCOPE_NONE (fail-closed, sees nothing)", () => {
  const r = resolveScopeClientId({ isGlobal: false, clientId: null }, "client-b")
  assert.equal(r.clientId, SCOPE_NONE)
})

test("only cliente is tenant-scoped; every staff role is global", () => {
  assert.equal(isGlobalRole("cliente"), false)
  for (const role of ["superadmin", "admin", "analyst", "viewer"] as const) {
    assert.equal(isGlobalRole(role), true, `${role} must be global`)
  }
})

test("cliente reads like a viewer, and cannot reach analyst/admin routes", () => {
  assert.equal(hasPermission("cliente", "viewer"), true)
  assert.equal(hasPermission("cliente", "analyst"), false)
  assert.equal(hasPermission("cliente", "admin"), false)
})
