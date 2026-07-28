/**
 * The generated installer/updater is shell that runs as root on a customer box;
 * these guard the parts whose failure is silent or destructive.
 *
 * Run from apps/dashboard:
 *   npx tsx lib/sensor-install-script.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildScript } from "./sensor-install-script.ts"
import type { ServiceKey } from "./sensor-compose-builder.ts"

function script(services: ServiceKey[], clientSlug = "acme", clientName = "ACME Inc") {
  return buildScript("d1", "https://ingest.example", "s3cr3t", "https://raw.example", "ghcr.io/x", services, clientSlug, clientName)
}

test(".sensor-meta carries the identity sensor-update needs to refresh in place", () => {
  const s = script(["int-ssh", "int-http"])
  for (const line of [
    "DEPLOY_ID='d1'",
    "SERVICES='int-ssh,int-http'",
    "CLIENT_SLUG='acme'",
    "INGEST_API_URL='https://ingest.example'",
  ]) {
    assert.ok(s.includes(line), `.sensor-meta must contain ${line}`)
  }
  assert.match(s, /chmod 600 \.sensor-meta/, "the file holds the ingest secret")
})

test("a client name with an apostrophe cannot break out of the meta file", () => {
  const s = script(["int-ssh"], "acme", "Bob's Bank")
  assert.ok(s.includes(String.raw`CLIENT_NAME='Bob'\''s Bank'`), "single quotes must be escaped shell-style")
})

// The refresh must never leave the host without a working compose: validate the
// download, and keep the current file on any failure.
test("sensor-update validates a fetched compose before swapping it in", () => {
  const s = script(["int-ssh"])
  assert.match(s, /docker compose -f docker-compose\.yml\.new config -q/, "must validate before replacing")
  assert.match(s, /cp docker-compose\.yml docker-compose\.yml\.bak/, "must back up the previous compose")
  assert.ok(s.includes("continuing with the current one"), "must degrade instead of failing the update")
})

// pipefail + set -e turns a failed lookup into an abort, and every int-* node is
// on a LAN that may have no route to 1.1.1.1.
test("the LAN IP lookup cannot abort the script on a host without a default route", () => {
  const s = script(["int-ssh"])
  const lookups = s.match(/HOST_LAN_IP=\$\(ip route get[^\n]*/g) ?? []
  assert.ok(lookups.length > 0, "expected the LAN IP lookup")
  for (const line of lookups) {
    assert.ok(line.includes("|| true"), `lookup must not be fatal: ${line}`)
  }
})

test("re-running the installer neither moves sshd twice nor clobbers its backup", () => {
  const s = script(["int-ssh"])
  assert.match(s, /grep -q ':22 ' && ! ss -tlnp \| grep -q ':8022 '/, "must skip when already moved")
  assert.match(s, /\[ -f \/etc\/ssh\/sshd_config\.pre-honeypot \] \|\|/, "must not overwrite an existing backup")
})
