// IoCs page — i18n strings (en + es).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  "iocs.title": "Indicators of Compromise",
  "iocs.subtitle": "Malicious IPs, C2 endpoints, malware hashes and planted SSH keys — copy or export to your firewall / SIEM",
  "iocs.section.ips": "Malicious IPs",
  "iocs.section.hashes": "Malware hashes",
  "iocs.section.c2": "C2 endpoints",
  "iocs.section.sshkeys": "Planted SSH keys",
  "iocs.section.empty": "No indicators of this type.",
  "iocs.stat.ips": "Malicious IPs",
  "iocs.stat.hashes": "Malware hashes",
  "iocs.stat.c2": "C2 endpoints",
  "iocs.stat.sshkeys": "SSH keys",
  "iocs.copyAll": "Copy all",
  "iocs.filter": "Filter…",
  "iocs.showRest": "Show the remaining {n}",
  "iocs.export.bundle": "Export all",
} as const

export const es: Record<keyof typeof en, string> = {
  "iocs.title": "Indicadores de Compromiso",
  "iocs.subtitle": "IPs maliciosas, endpoints C2, hashes de malware y llaves SSH plantadas — copia o exporta a tu firewall / SIEM",
  "iocs.section.ips": "IPs maliciosas",
  "iocs.section.hashes": "Hashes de malware",
  "iocs.section.c2": "Endpoints C2",
  "iocs.section.sshkeys": "Llaves SSH plantadas",
  "iocs.section.empty": "Sin indicadores de este tipo.",
  "iocs.stat.ips": "IPs maliciosas",
  "iocs.stat.hashes": "Hashes de malware",
  "iocs.stat.c2": "Endpoints C2",
  "iocs.stat.sshkeys": "Llaves SSH",
  "iocs.copyAll": "Copiar todo",
  "iocs.filter": "Filtrar…",
  "iocs.showRest": "Ver los {n} restantes",
  "iocs.export.bundle": "Exportar todo",
}
