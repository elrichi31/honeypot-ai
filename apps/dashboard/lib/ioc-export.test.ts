/**
 * Tests for the IoC export helpers.
 * Run from apps/dashboard:  npx tsx --test lib/ioc-export.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { toPlainList, toCsv, toStixBundle, stixPattern, type IocEntry } from "./ioc-export.ts"

const ENTRIES: IocEntry[] = [
  { type: "ip", value: "45.249.247.86", meta: { source: "honeypot", score: 88, level: "CRITICAL" } },
  { type: "ip", value: "197.255.229.88", meta: { source: "honeypot", score: 70, level: "HIGH" } },
  { type: "hash", value: "a8460f446be540410004b1a8db4083773fa46f7fe76fa84219c93daa1669f8f2", meta: { source: "cowrie", fileType: "ELF" } },
]

test("toPlainList produces one indicator per line", () => {
  const out = toPlainList(ENTRIES)
  assert.equal(out.split("\n").length, ENTRIES.length)
  assert.equal(out.split("\n")[0], "45.249.247.86")
})

test("toCsv has a header and escapes special characters", () => {
  const csv = toCsv([
    { type: "ip", value: "1.2.3.4", meta: { source: "honeypot", protocols: "ssh,http" } },
  ])
  const lines = csv.split("\n")
  assert.equal(lines[0], "type,value,source,first_seen,extra")
  // the protocols value contains a comma, so the extra column must be quoted
  assert.match(lines[1], /"protocols=ssh,http"/)
})

test("stixPattern picks the right pattern for IP vs hash length", () => {
  assert.equal(stixPattern({ type: "ip", value: "1.2.3.4" }), "[ipv4-addr:value = '1.2.3.4']")
  assert.equal(
    stixPattern({ type: "hash", value: "d41d8cd98f00b204e9800998ecf8427e" }),
    "[file:hashes.'MD5' = 'd41d8cd98f00b204e9800998ecf8427e']",
  )
  assert.match(stixPattern(ENTRIES[2]), /SHA-256/)
})

test("toStixBundle produces a valid bundle with one indicator per IoC", () => {
  const bundle = JSON.parse(toStixBundle(ENTRIES))
  assert.equal(bundle.type, "bundle")
  assert.ok(bundle.id.startsWith("bundle--"))
  assert.equal(bundle.objects.length, ENTRIES.length)
  for (const o of bundle.objects) {
    assert.equal(o.type, "indicator")
    assert.equal(o.spec_version, "2.1")
    assert.ok(o.pattern && o.pattern_type === "stix")
  }
})

test("empty input yields empty/valid output", () => {
  assert.equal(toPlainList([]), "")
  assert.equal(toCsv([]).split("\n")[0], "type,value,source,first_seen,extra")
  const bundle = JSON.parse(toStixBundle([]))
  assert.equal(bundle.objects.length, 0)
})
