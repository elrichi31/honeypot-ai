import { test } from "node:test"
import assert from "node:assert/strict"
import { isSensorInstalled } from "./sensor-install-status"

const externalSmb = { protocol: "smb", realProtocol: null }
const internalSmb = { protocol: "deception", realProtocol: "smb" }
const openCanary = { protocol: "deception", realProtocol: null }

const smbExternalEntry = { protocol: "smb", category: "external" as const }
const smbInternalEntry = { protocol: "smb", category: "deception" as const }
const openCanaryEntry = { protocol: "deception", category: "deception" as const }

test("an external sensor does not mark its internal twin installed", () => {
  assert.equal(isSensorInstalled(smbExternalEntry, [externalSmb]), true)
  assert.equal(isSensorInstalled(smbInternalEntry, [externalSmb]), false)
  assert.equal(isSensorInstalled(openCanaryEntry, [externalSmb]), false)
})

test("an internal decoy marks only its own entry installed", () => {
  assert.equal(isSensorInstalled(smbInternalEntry, [internalSmb]), true)
  assert.equal(isSensorInstalled(smbExternalEntry, [internalSmb]), false)
  assert.equal(isSensorInstalled(openCanaryEntry, [internalSmb]), false)
})

test("opencanary nodes only match the deception-network entry", () => {
  assert.equal(isSensorInstalled(openCanaryEntry, [openCanary]), true)
  assert.equal(isSensorInstalled(smbInternalEntry, [openCanary]), false)
})
