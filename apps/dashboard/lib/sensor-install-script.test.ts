/**
 * The generated installer/updater is shell that runs as root on a customer box;
 * these guard the parts whose failure is silent or destructive.
 *
 * Run from apps/dashboard:
 *   npx tsx lib/sensor-install-script.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildScript, refreshManifest, helperScript, HELPER_NAMES } from "./sensor-install-script.ts"
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

// Everything the installer put on the host must be reachable by the updater,
// or that part silently rots at the version it was installed with.
test("the refresh manifest covers the mounted files and every helper", () => {
  const manifest = refreshManifest(["int-ssh", "int-http"], "https://raw.example", "https://ingest.example")
  const dests = manifest.split("\n").map(l => l.split(" ")[0])
  for (const mounted of ["heartbeat.py", "control_agent.py", "cowrie.toml", "web-honeypot.toml"]) {
    assert.ok(dests.includes(mounted), `${mounted} is mounted into a container but never refreshed`)
  }
  for (const helper of HELPER_NAMES) {
    assert.ok(dests.includes(helper), `${helper} would stay at its installed version forever`)
  }
})

test("config files are fetched from the public host, helpers from ingest", () => {
  const manifest = refreshManifest(["int-ssh"], "https://raw.example", "https://ingest.example")
  for (const line of manifest.split("\n")) {
    const [dest, url] = line.split(" ")
    const expected = dest.startsWith("sensor-") ? "https://ingest.example" : "https://raw.example"
    assert.ok(url.startsWith(expected), `${dest} should come from ${expected}, got ${url}`)
  }
})

test("every helper can be extracted back out of the built script", () => {
  const s = script(["int-ssh", "int-http", "int-smb"])
  for (const name of HELPER_NAMES) {
    const body = helperScript(s, name)
    assert.ok(body && body.startsWith("#!"), `${name} did not extract as a script`)
  }
  assert.equal(helperScript(s, "sensor-evil"), null, "only known helpers may be served")
})

// The token authenticates us to our own API; the config files come from a
// public host that must never see it.
test("the ingest secret is only sent to the ingest API", () => {
  const s = script(["int-ssh"])
  const withToken = s.split("\n").filter(l => l.includes("X-Ingest-Token") && l.includes("curl"))
  assert.ok(withToken.length > 0, "expected authenticated fetches")
  for (const line of withToken) {
    assert.ok(line.includes("$INGEST_API_URL") || line.includes('"$url"'), `unscoped token use: ${line.trim()}`)
  }
  assert.match(s, /case "\$url" in/, "the token must be applied per-URL, not to every fetch")
})

// bash reads a script as it executes it, so overwriting sensor-update in place
// while it runs corrupts the rest of the run.
test("refreshed files are moved into place, never written over", () => {
  const s = script(["int-ssh"])
  assert.match(s, /mv "\$STAGE\/\$dest" "\$DIR\/\$dest"/, "must swap by rename")
  assert.ok(!/curl[^\n]*-o "\$DIR\/\$dest"/.test(s), "must never download straight onto a live file")
})

// A changed bind-mount is invisible to "up -d": the container keeps running the
// process it started with.
test("changed mounted files trigger a container restart", () => {
  const s = script(["int-ssh"])
  assert.match(s, /if \[ "\$REFRESHED_MOUNTS" -gt 0 \]; then\n\s+echo[^\n]*\n\s*docker compose restart/)
})
