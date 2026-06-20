// Botnet family names, descriptions, and categories shown in threat-intel-card
// and threat-graph. Part of the namespaced dictionary; combined in ../dictionaries.ts.

import type { TranslationKey } from "../dictionaries"

export const en = {
  // ── Botnet family names ────────────────────────────────────────────────────
  "threatIntel.family.outlaw.name": "Outlaw / mdrfckr",
  "threatIntel.family.ssh_key_persistence.name": "SSH key persistence kit",
  "threatIntel.family.xmrig_miner.name": "XMRig cryptominer",

  // ── Botnet family descriptions ─────────────────────────────────────────────
  "threatIntel.family.outlaw.description":
    "Perl/Shellbot-based Monero cryptomining botnet. Wipes ~/.ssh, plants its own public key (tag «mdrfckr») for persistence, fingerprints CPU/RAM and downloads an XMRig miner.",
  "threatIntel.family.ssh_key_persistence.description":
    "Generic kit that installs an attacker SSH key in authorized_keys to keep access even if the password changes. Not attributed to a specific family.",
  "threatIntel.family.xmrig_miner.description":
    "Direct deployment of an XMRig miner pointing at a (stratum) mining pool. Indicates monetization via cryptomining.",

  // ── Botnet categories ──────────────────────────────────────────────────────
  "threatIntel.category.cryptominer": "Cryptominer",
  "threatIntel.category.ddos": "DDoS",
  "threatIntel.category.worm": "Worm",
  "threatIntel.category.backdoor": "Backdoor",
  "threatIntel.category.unknown": "Unknown",

  // ── Graph node labels ──────────────────────────────────────────────────────
  "threatIntel.graph.reputation": "Reputation",

  // ── threat-intel-card UI strings ───────────────────────────────────────────
  "threatIntel.card.title": "Threat Intelligence",
  "threatIntel.card.recognizedFamily": "Recognized family",
  "threatIntel.card.patterns": "Patterns detected: {count} · confidence {pct}%",
  "threatIntel.card.reference": "Threat-intel reference",
  "threatIntel.card.c2": "Command & Control",
  "threatIntel.card.sshKeys": "Planted SSH keys",
  "threatIntel.card.malwareHashes": "Malware hashes (SHA-256)",
  "threatIntel.card.directConn": "Direct connection",
  "threatIntel.card.copyLabel": "Copy",
  "threatIntel.card.externalRef": "Open external reference",
} as const

export const es: Record<keyof typeof en, string> = {
  "threatIntel.family.outlaw.name": "Outlaw / mdrfckr",
  "threatIntel.family.ssh_key_persistence.name": "Kit de persistencia SSH",
  "threatIntel.family.xmrig_miner.name": "Criptominero XMRig",

  "threatIntel.family.outlaw.description":
    "Botnet de criptominería Monero basada en Perl/Shellbot. Borra ~/.ssh, planta su propia clave pública (etiqueta «mdrfckr») para persistencia, obtiene info de CPU/RAM y descarga un minero XMRig.",
  "threatIntel.family.ssh_key_persistence.description":
    "Kit genérico que instala una clave SSH del atacante en authorized_keys para mantener acceso aunque cambie la contraseña. No atribuido a una familia específica.",
  "threatIntel.family.xmrig_miner.description":
    "Despliegue directo de un minero XMRig apuntando a un pool de minería (stratum). Indica monetización mediante criptominería.",

  "threatIntel.category.cryptominer": "Criptominero",
  "threatIntel.category.ddos": "DDoS",
  "threatIntel.category.worm": "Gusano",
  "threatIntel.category.backdoor": "Backdoor",
  "threatIntel.category.unknown": "Desconocido",

  "threatIntel.graph.reputation": "Reputación",

  "threatIntel.card.title": "Inteligencia de amenazas",
  "threatIntel.card.recognizedFamily": "Familia reconocida",
  "threatIntel.card.patterns": "Patrones detectados: {count} · confianza {pct}%",
  "threatIntel.card.reference": "Referencia threat-intel",
  "threatIntel.card.c2": "Comando y Control",
  "threatIntel.card.sshKeys": "Claves SSH plantadas",
  "threatIntel.card.malwareHashes": "Hashes de malware (SHA-256)",
  "threatIntel.card.directConn": "Conexión directa",
  "threatIntel.card.copyLabel": "Copiar",
  "threatIntel.card.externalRef": "Abrir referencia externa",
}

// Compile-time check that all keys are valid TranslationKeys once merged.
void (0 as unknown as keyof typeof en extends TranslationKey ? true : never)
