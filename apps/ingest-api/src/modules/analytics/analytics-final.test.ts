import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The lake tables are ReplacingMergeTree and Kafka delivery is at-least-once,
// so a read without FINAL counts duplicates that have not been merged yet.
// That is not a theoretical risk: it shipped, and a client report showed
// PORT-SCAN at 2,473,002 against the dashboard's 1,000,580 — a 2.5x
// overstatement that matched the table's duplicate ratio exactly.
//
// This guards the whole module rather than one query, because the failure is
// silent: the number looks plausible, just wrong.
const LAKE_TABLES = ['cowrie_events', 'web_events', 'protocol_events', 'suricata_alerts']

const moduleDir = dirname(fileURLToPath(import.meta.url))

describe('lake reads', () => {
  const repositories = readdirSync(moduleDir).filter((f) => f.endsWith('.repository.ts'))

  it('has repositories to check', () => {
    expect(repositories.length).toBeGreaterThan(0)
  })

  for (const file of repositories) {
    it(`${file} reads every lake table with FINAL`, () => {
      const sql = readFileSync(join(moduleDir, file), 'utf-8')
      for (const table of LAKE_TABLES) {
        const reads = sql.match(new RegExp(`FROM\\s+${table}\\b[^\\n]*`, 'g')) ?? []
        for (const read of reads) {
          expect(read, `${file}: "${read.trim()}" must use FINAL`).toMatch(
            new RegExp(`FROM\\s+${table}\\s+FINAL\\b`),
          )
        }
      }
    })
  }
})
