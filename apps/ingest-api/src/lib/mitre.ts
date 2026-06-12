/**
 * Pure MITRE ATT&CK mapping. Translates fields the honeypots already capture
 * (web attackType, protocol/eventType, SSH eventType/command) into ATT&CK
 * technique ids. Classification happens at query time over already-stored data,
 * so there is no schema change and it applies retroactively to all history.
 *
 * Coverage is pragmatic: only techniques we can infer with confidence from the
 * existing fields. Expand as new signals become available.
 */

export type Tactic =
  | 'Reconnaissance'
  | 'Initial Access'
  | 'Execution'
  | 'Discovery'
  | 'Credential Access'
  | 'Command and Control'

export interface TechniqueMeta {
  name: string
  tactic: Tactic
}

// Single source of truth for id -> {name, tactic}. The frontend reads this off
// the API response so it never hardcodes ATT&CK labels.
export const TECHNIQUE_META: Record<string, TechniqueMeta> = {
  T1595: { name: 'Active Scanning', tactic: 'Reconnaissance' },
  T1046: { name: 'Network Service Discovery', tactic: 'Discovery' },
  T1083: { name: 'File and Directory Discovery', tactic: 'Discovery' },
  T1190: { name: 'Exploit Public-Facing Application', tactic: 'Initial Access' },
  T1110: { name: 'Brute Force', tactic: 'Credential Access' },
  T1059: { name: 'Command and Scripting Interpreter', tactic: 'Execution' },
  T1105: { name: 'Ingress Tool Transfer', tactic: 'Command and Control' },
}

// Display order for the matrix columns (kill-chain left to right).
export const TACTIC_ORDER: Tactic[] = [
  'Reconnaissance',
  'Initial Access',
  'Execution',
  'Discovery',
  'Credential Access',
  'Command and Control',
]

/** web_hits.attackType -> technique. `injectionPattern` is the sql/xss/traversal/template sub-kind when known. */
export function mapWebAttack(attackType: string, injectionPattern?: string): string | null {
  switch (attackType) {
    case 'scanner':
      return 'T1595'
    case 'path_probe':
      return 'T1083'
    case 'brute_force':
      return 'T1110'
    case 'injection':
      // Traversal is directory discovery; the rest is app exploitation.
      return injectionPattern === 'traversal' ? 'T1083' : 'T1190'
    default:
      return null
  }
}

/** protocol_hits (protocol + eventType) -> technique. */
export function mapProtocolHit(protocol: string, eventType: string): string | null {
  if (protocol === 'port-scan' || eventType === 'connect') return 'T1046'
  if (eventType === 'auth') return 'T1110'
  return null
}

/** SSH events (eventType + optional command text) -> technique. */
export function mapSshEvent(eventType: string, command?: string | null): string | null {
  if (eventType === 'auth.success' || eventType === 'auth.failed') return 'T1110'
  if (eventType === 'command.input' || eventType === 'command.failed') {
    if (command && /\b(wget|curl|tftp|scp)\b/i.test(command)) return 'T1105'
    return 'T1059'
  }
  return null
}

/** suricata category -> technique, best-effort. */
export function mapSuricataCategory(category: string): string | null {
  const c = category.toLowerCase()
  if (c.includes('scan')) return 'T1595'
  if (c.includes('brute') || c.includes('credential')) return 'T1110'
  if (c.includes('web application') || c.includes('sql') || c.includes('injection')) return 'T1190'
  if (c.includes('trojan') || c.includes('download')) return 'T1105'
  return null
}
