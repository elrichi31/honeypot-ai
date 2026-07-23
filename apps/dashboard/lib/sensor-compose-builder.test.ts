/**
 * Verifies every honeypot's event log is actually shipped by the generated
 * vector service. The bug this guards against: a honeypot writes events to a
 * file that no vector config tails, so events never reach ingest.
 *
 * Run from apps/dashboard:
 *   npx tsx --test lib/sensor-compose-builder.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildCompose, type ServiceKey } from "./sensor-compose-builder.ts"

function compose(services: ServiceKey[]) {
  return buildCompose("test01", "https://ingest.example", "secret", services)
}

// For each file-logging honeypot: the honeypot mounts its events volume, vector
// mounts the same volume read-only, loads the shipper config, and sets the log path.
const CASES: { service: ServiceKey; vol: string; dir: string; config: string; logEnv: string }[] = [
  { service: "port",  vol: "port_events",  dir: "port-honeypot",  config: "protocol.toml",     logEnv: "PORT_LOG_PATH" },
  { service: "ftp",   vol: "ftp_events",   dir: "ftp-honeypot",   config: "protocol.toml",     logEnv: "FTP_LOG_PATH" },
  { service: "mysql", vol: "mysql_events", dir: "mysql-honeypot", config: "protocol.toml",     logEnv: "MYSQL_LOG_PATH" },
  { service: "smb",   vol: "smb_events",   dir: "smb-honeypot",   config: "protocol.toml",     logEnv: "SMB_LOG_PATH" },
  { service: "http",  vol: "web_events",   dir: "web-honeypot",   config: "web-honeypot.toml", logEnv: "WEB_LOG_PATH" },
]

for (const c of CASES) {
  test(`${c.service}: events are wired end-to-end to vector`, () => {
    const yaml = compose([c.service])
    assert.match(yaml, new RegExp(`- ${c.vol}:/var/log/${c.dir}\\b`), "honeypot must mount its events volume")
    assert.match(yaml, new RegExp(`- ${c.vol}:/var/log/${c.dir}:ro`), "vector must mount the events volume read-only")
    assert.ok(yaml.includes(`/etc/vector/${c.config}`), `vector must load ${c.config}`)
    assert.match(yaml, new RegExp(`${c.logEnv}: /var/log/${c.dir}/events\\.json`), "vector must set the log path env")
    assert.match(yaml, new RegExp(`^  ${c.vol}:$`, "m"), "events volume must be declared")
  })
}

test("ssh: cowrie is shipped and vector depends on it", () => {
  const yaml = compose(["ssh"])
  assert.ok(yaml.includes("/etc/vector/cowrie.toml"), "vector must load cowrie.toml")
  assert.ok(yaml.includes("COWRIE_LOG_PATH:"), "vector must set COWRIE_LOG_PATH")
  assert.match(yaml, /depends_on:\s*\n\s*- cowrie/, "vector must depend on cowrie")
})

test("suricata is always shipped", () => {
  assert.ok(compose(["port"]).includes("/etc/vector/suricata.toml"))
  assert.ok(compose(["ssh"]).includes("/etc/vector/suricata.toml"))
})

test("only one vector service is emitted", () => {
  const yaml = compose(["ssh", "http", "port", "ftp", "mysql", "smb"])
  const count = (yaml.match(/^  vector:$/gm) ?? []).length
  assert.equal(count, 1, "exactly one vector service")
  // and it wires every honeypot's config
  for (const cfg of ["cowrie.toml", "suricata.toml", "protocol.toml", "web-honeypot.toml"]) {
    assert.ok(yaml.includes(`/etc/vector/${cfg}`), `combined vector must load ${cfg}`)
  }
})
