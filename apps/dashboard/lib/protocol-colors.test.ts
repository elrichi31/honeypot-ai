import { test } from "node:test"
import assert from "node:assert/strict"
import { getPortColor, getProtocolMarkerColor } from "./protocol-colors.js"

test("known service ports reuse their protocol colour", () => {
  assert.equal(getPortColor(22), "#f43f5e")
  assert.equal(getPortColor(80), "#fb923c")
  assert.equal(getPortColor(3306), "#c084fc")
})

test("unknown ports get a stable, deterministic colour", () => {
  const a = getPortColor(49152)
  const b = getPortColor(49152)
  assert.equal(a, b)
  assert.notEqual(getPortColor(49152), getPortColor(49153))
})

test("missing port falls back to the type colour", () => {
  assert.equal(getPortColor(null, "ssh"), getProtocolMarkerColor("ssh"))
  assert.equal(getPortColor(undefined, "ids"), getProtocolMarkerColor("ids"))
})

test("missing port and no type is a neutral grey", () => {
  assert.equal(getPortColor(null), "#6b7280")
})
