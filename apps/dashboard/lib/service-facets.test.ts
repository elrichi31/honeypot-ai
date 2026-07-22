import { test } from "node:test"
import assert from "node:assert/strict"
import { buildServiceFacets } from "./service-facets.js"
import type { ProtocolInsights } from "./api"

const id = (k: string) => k

function insights(partial: Partial<ProtocolInsights>): ProtocolInsights {
  return {
    totals: { total: 0, uniqueIps: 0, authAttempts: 0, commandEvents: 0, lastSeen: null },
    topIps: [], topPorts: [], topUsernames: [], topPasswords: [],
    topCommands: [], topServices: [], topDatabases: [],
    ...partial,
  }
}

test("empty insights yield no facets", () => {
  assert.deepEqual(buildServiceFacets(insights({}), id), [])
})

test("drops empty facets, keeps at most 3, at most 4 items each", () => {
  const facets = buildServiceFacets(insights({
    topCommands: Array.from({ length: 6 }, (_, i) => ({ command: `cmd${i}`, count: 6 - i })),
    topDatabases: [{ database: "mysql", count: 3 }],
    topServices: [{ service: "svc", count: 2 }],
    topPorts: [{ dstPort: 3306, count: 5, lastSeen: "" }],
  }), id)
  assert.equal(facets.length, 3)
  const commands = facets.find((f) => f.label === "commands")
  assert.ok(commands)
  assert.equal(commands.items.length, 4)
})

test("credential pairs suppress the standalone usernames facet", () => {
  const facets = buildServiceFacets(insights({
    topCredentials: [{ username: "root", password: "toor", count: 9 }],
    topUsernames: [{ username: "root", count: 9 }],
    topCommands: [{ command: "ls", count: 1 }],
  }), id)
  const keys = facets.map((f) => f.label)
  assert.ok(keys.includes("credentials"))
  assert.ok(!keys.includes("usernames"))
})

test("usernames facet survives when there are no credential pairs", () => {
  const facets = buildServiceFacets(insights({
    topUsernames: [{ username: "admin", count: 4 }],
  }), id)
  assert.deepEqual(facets.map((f) => f.label), ["usernames"])
})

test("empty username/password render as ∅ placeholder", () => {
  const facets = buildServiceFacets(insights({
    topCredentials: [{ username: "", password: "", count: 1 }],
  }), id)
  assert.equal(facets[0].items[0].label, "∅ / ∅")
})
