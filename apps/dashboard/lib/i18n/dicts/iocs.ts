// IoCs page — i18n strings (en + es).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  "iocs.title": "Indicators of Compromise",
  "iocs.subtitle": "{ips} malicious IPs · {hashes} malware hashes — copy or export to your firewall / SIEM",
  "iocs.section.ips": "Malicious IPs",
  "iocs.section.hashes": "Malware hashes",
} as const

export const es: Record<keyof typeof en, string> = {
  "iocs.title": "Indicadores de Compromiso",
  "iocs.subtitle": "{ips} IPs maliciosas · {hashes} hashes de malware — copia o exporta a tu firewall / SIEM",
  "iocs.section.ips": "IPs maliciosas",
  "iocs.section.hashes": "Hashes de malware",
}
