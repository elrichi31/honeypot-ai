/**
 * Run from apps/dashboard:
 *   npx tsx lib/sensor-image-versions.test.ts
 *
 * The registry call itself is exercised separately (it needs network); these
 * cover the decisions made around it, where a wrong answer is user-visible.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { imageForSensor, versionStatus, resolveVersionStatuses } from "./sensor-image-versions.ts"

test("internal nodes map to the image of their real protocol, not 'deception'", () => {
  assert.equal(imageForSensor({ protocol: "deception", realProtocol: "smb" }), "smb-honeypot")
  assert.equal(imageForSensor({ protocol: "deception", realProtocol: "http" }), "web-honeypot")
  assert.equal(imageForSensor({ protocol: "ssh", realProtocol: null }), "cowrie")
  // An opencanary trap network has no realProtocol and is its own image.
  assert.equal(imageForSensor({ protocol: "deception", realProtocol: null }), "opencanary")
})

// Silence beats a false alarm: a sensor that reports nothing, or a registry we
// could not reach, must not be painted as out of date.
test("a missing version on either side is 'unknown', never 'outdated'", () => {
  assert.equal(versionStatus(undefined, "abc123"), "unknown")
  assert.equal(versionStatus("", "abc123"), "unknown")
  assert.equal(versionStatus("abc123", null), "unknown")
  assert.equal(versionStatus(undefined, null), "unknown")
})

test("equal shas are current, different ones are outdated", () => {
  assert.equal(versionStatus("abc123", "abc123"), "current")
  assert.equal(versionStatus("abc123", "def456"), "outdated")
})

test("every sensor gets a status, including ones with no known image", () => {
  const sensors = [
    { sensorId: "a", protocol: "smb", realProtocol: null, imageVersion: "sha1" },
    { sensorId: "b", protocol: "suricata", realProtocol: null, imageVersion: "sha1" },
    { sensorId: "c", protocol: "ssh", realProtocol: null, imageVersion: undefined },
  ]
  return resolveVersionStatuses(sensors as never).then(statuses => {
    assert.deepEqual(Object.keys(statuses).sort(), ["a", "b", "c"])
    assert.equal(statuses.b, "unknown", "an unmapped protocol cannot be judged")
    assert.equal(statuses.c, "unknown", "a sensor that reports nothing cannot be judged")
  })
})
