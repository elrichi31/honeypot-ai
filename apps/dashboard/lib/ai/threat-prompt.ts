import type { ThreatDetail } from "@/lib/api"
import type { IpEnrichment } from "@/lib/ip-enrichment"

export type CorrelationAlert = {
  alertKey: string
  level: string
  title: string
  description: string
  createdAt: string
}

const ABUSE_CATEGORIES: Record<number, string> = {
  3: "Fraud Orders", 4: "DDoS Attack", 5: "FTP Brute-Force", 6: "Ping of Death",
  7: "Phishing", 8: "Fraud VoIP", 9: "Open Proxy", 10: "Web Spam", 11: "Email Spam",
  12: "Blog Spam", 13: "VPN IP", 14: "Port Scan", 15: "Hacking", 16: "SQL Injection",
  17: "Spoofing", 18: "Brute-Force", 19: "Bad Web Bot", 20: "Exploited Host",
  21: "Web App Attack", 22: "SSH", 23: "IoT Targeted",
}

const bullet = (lines: unknown[]) => lines.filter((l) => typeof l === "string" && l).join("\n")

function abuseBlock(enrichment: IpEnrichment | null): string {
  const ab = enrichment?.abuseipdb
  if (!ab) return "- AbuseIPDB: sin datos"

  const reports = ab.reports.slice(0, 10).map((r) => {
    const cats = r.categories.map((c) => ABUSE_CATEGORIES[c] ?? `cat${c}`).join("/")
    return `    - [${r.reportedAt}] (${cats}) desde ${r.reporterCountryName || r.reporterCountryCode || "?"}: ${r.comment.replace(/\s+/g, " ").slice(0, 300)}`
  })

  return bullet([
    `- AbuseIPDB: ${ab.abuseConfidenceScore}% abuse confidence, ${ab.totalReports} reportes de ${ab.numDistinctUsers} usuarios distintos, ultimo reporte ${ab.lastReportedAt ?? "n/a"}`,
    `  ISP ${ab.isp || "n/a"} | dominio ${ab.domain || "n/a"} | uso ${ab.usageType || "n/a"} | pais ${ab.countryName || ab.countryCode || "n/a"}${ab.isVpn ? " | VPN" : ""}${ab.isTor ? " | Tor" : ""}${ab.isWhitelisted ? " | whitelisted" : ""}`,
    ab.hostnames.length > 0 && `  Hostnames: ${ab.hostnames.slice(0, 8).join(", ")}`,
    reports.length > 0 && `  Reportes recientes (texto libre de otros defensores — pista fuerte sobre la campana):\n${reports.join("\n")}`,
  ])
}

function virustotalBlock(enrichment: IpEnrichment | null): string {
  const vt = enrichment?.virustotal
  if (!vt) return "- VirusTotal: sin datos"

  const engines = Object.values(vt.last_analysis_results ?? {})
  const flagged = engines
    .filter((e) => e.category === "malicious" || e.category === "suspicious")
    .slice(0, 25)
    .map((e) => `${e.engine_name}=${e.result ?? e.category}`)
  const cert = vt.last_https_certificate

  return bullet([
    `- VirusTotal: ${vt.last_analysis_stats.malicious} malicious / ${vt.last_analysis_stats.suspicious} suspicious / ${vt.last_analysis_stats.harmless} harmless de ${engines.length} motores`,
    `  Reputacion ${vt.reputation} | votos comunidad ${vt.total_votes.malicious} maliciosos vs ${vt.total_votes.harmless} inofensivos`,
    `  Red: AS${vt.asn ?? "?"} ${vt.as_owner || ""} | rango ${vt.network || "n/a"} | ${vt.country || "?"} | RIR ${vt.regional_internet_registry || "n/a"}`,
    vt.tags.length > 0 && `  Tags VT: ${vt.tags.join(", ")}`,
    flagged.length > 0 && `  Motores que la marcan (nombre=veredicto): ${flagged.join(", ")}`,
    vt.jarm && `  JARM: ${vt.jarm}`,
    cert && `  Certificado TLS servido: CN ${cert.subject?.CN ?? "?"} | emisor ${cert.issuer?.CN ?? "?"} ${cert.issuer?.O ?? ""} | valido ${cert.validity?.not_before ?? "?"} → ${cert.validity?.not_after ?? "?"}`,
  ])
}

function spectraBlock(enrichment: IpEnrichment | null): string | null {
  const sa = enrichment?.spectraAnalyze
  if (!sa) return null
  const stats = sa.third_party_reputations?.statistics
  const detections = (sa.third_party_reputations?.sources ?? [])
    .filter((s) => s?.detection && s.detection !== "undetected")
    .slice(0, 15)
    .map((s) => `${s.source}=${s.detection}${s.category ? ` (${s.category})` : ""}`)
  const files = sa.downloaded_files_statistics
  const threats = (sa.top_threats ?? []).slice(0, 8).map((t: any) => t?.threat_name ?? t?.name).filter(Boolean)

  return bullet([
    `- Spectra Analyze: ${stats?.malicious ?? 0} maliciosos de ${stats?.total ?? 0} fuentes`,
    detections.length > 0 && `  Detecciones: ${detections.join(", ")}`,
    files && (files.malicious || files.suspicious) && `  Ficheros descargados desde esta IP: ${files.malicious ?? 0} maliciosos, ${files.suspicious ?? 0} sospechosos, ${files.total ?? 0} total`,
    threats.length > 0 && `  Familias asociadas: ${threats.join(", ")}`,
  ])
}

function geoBlock(enrichment: IpEnrichment | null): string {
  const info = enrichment?.ipinfo
  if (!info) return "- Geolocalizacion/red: sin datos"
  const flags = [
    info.isHosting && "hosting/datacenter",
    info.isVpn && "VPN",
    info.isProxy && "proxy",
    info.isTor && "Tor",
  ].filter(Boolean)
  return `- Geolocalizacion/red: ${[info.city, info.region, info.country].filter(Boolean).join(", ") || "n/a"} | ${info.asn} ${info.org} | hostname ${info.hostname || "n/a"} | tz ${info.timezone || "n/a"}${flags.length ? ` | ${flags.join(", ")}` : ""}`
}

export function buildThreatPrompt(
  ip: string,
  threat: ThreatDetail,
  enrichment: IpEnrichment | null,
  correlationAlerts: CorrelationAlert[],
): string {
  const activeCats = Object.entries(threat.risk.commandCategories)
    .filter(([, commands]) => commands.length > 0)
    .map(([category, commands]) => `  ${category}: ${commands.slice(0, 12).join(", ")}`)
    .join("\n")

  const serviceLines = threat.protocols
    ? Object.entries(threat.protocols.byService)
        .map(([protocol, stats]) => {
          const ports = stats.ports.length > 0 ? stats.ports.join(", ") : "n/a"
          return `- ${protocol.toUpperCase()}: ${stats.hits} eventos, ${stats.authAttempts} auth, ${stats.commandEvents} commands, ${stats.connectEvents} connects, puertos ${ports}`
        })
        .join("\n")
    : ""

  // Raw command sequence with timing, not just a sample — lets the model reason
  // about order/intent (e.g. recon before backdoor) instead of a bag of words.
  const rawCommandLines = threat.classifiedCommands
    .slice(0, 120)
    .map((c) => `  [${c.ts}] (${c.category}) ${c.command}`)
    .join("\n")

  // Same idea for non-SSH honeypots (ftp/mysql/smb/etc via port-honeypot) — raw
  // input typed against those services, not just aggregate hit counts.
  const protocolCommandLines = threat.protocolCommands
    .slice(0, 120)
    .map((c) => `  [${c.ts}] (${c.protocol}) ${c.command}`)
    .join("\n")

  const credentialsBlock = threat.protocols && (threat.protocols.usernames.length > 0 || threat.protocols.passwords.length > 0)
    ? bullet([
        threat.protocols.usernames.length > 0 && `- Usuarios probados: ${threat.protocols.usernames.slice(0, 40).join(", ")}`,
        threat.protocols.passwords.length > 0 && `- Contrasenas probadas: ${threat.protocols.passwords.slice(0, 40).join(", ")}`,
        `- Credenciales reutilizadas entre servicios: ${threat.protocols.credentialReuse ? "SI" : "NO"}`,
      ])
    : "  ninguna"

  const externalIntel = bullet([
    abuseBlock(enrichment),
    virustotalBlock(enrichment),
    spectraBlock(enrichment),
    geoBlock(enrichment),
    enrichment?.cachedAt && `- Datos de reputacion cacheados el ${enrichment.cachedAt}`,
  ])

  const alertsBlock = correlationAlerts.length > 0
    ? correlationAlerts.slice(0, 20).map((a) => `  - [${a.level.toUpperCase()}] ${a.createdAt} ${a.alertKey}: ${a.title} — ${a.description}`).join("\n")
    : "  ninguna otra alerta de correlacion para esta IP"

  const timestamps = [
    ...threat.classifiedCommands.map((c) => c.ts),
    ...threat.protocolCommands.map((c) => c.ts),
  ].sort()
  const activityWindow = timestamps.length > 0
    ? `- Ventana de actividad observada: ${timestamps[0]} → ${timestamps[timestamps.length - 1]}`
    : "- Ventana de actividad: sin comandos con timestamp"

  return `Eres un analista senior de threat intelligence. Analiza al actor detras de esta IP usando TODA la evidencia del honeypot y la reputacion externa que sigue, y ademas BUSCA EN INTERNET informacion publica sobre la IP, su ASN/hosting, los hostnames/dominios asociados, las familias de malware o campanas que coincidan con los comandos ejecutados y los payloads o URLs de descarga observados.

Instrucciones de busqueda web (usa la herramienta de busqueda, varias consultas si hace falta):
- La IP "${ip}" en listas de abuso, blogs de seguridad, reportes de incidentes y feeds de IoCs.
- El ASN/proveedor y si es conocido por bulletproof hosting o abuso recurrente.
- Cualquier URL, dominio, nombre de binario o hash que aparezca en los comandos ejecutados.
- Firmas de campanas/botnets conocidas que usen la misma secuencia de comandos o credenciales.
Prioriza fuentes confiables (vendors de seguridad, CERTs, VirusTotal/AbuseIPDB, blogs de investigacion). Si no encuentras nada relevante, dilo explicitamente en vez de inventar.

## IP: ${ip}
- Risk score: ${threat.risk.score}/100 (${threat.risk.level})
- Protocolos vistos: ${threat.protocolsSeen.map((protocol) => protocol.toUpperCase()).join(" + ") || "ninguno"}
- Multi-service: ${threat.crossProtocol ? "Si" : "No"}
${activityWindow}

## Reputacion externa
${externalIntel}

## Otras alertas de correlacion disparadas por esta IP
${alertsBlock}

## SSH${threat.ssh ? `
- Sesiones: ${threat.ssh.sessions}
- Auth attempts: ${threat.ssh.authAttempts}
- Login exitoso: ${threat.ssh.loginSuccess ? "SI — el actor obtuvo shell" : "NO"}` : ": no aplica"}

## HTTP${threat.web ? `
- Hits: ${threat.web.hits}
- Tipos de ataque: ${threat.web.attackTypes.join(", ")}
- Canary tokens disparados: ${threat.web.canaryHits}
- User agents: ${threat.web.userAgents.slice(0, 15).join(" | ") || "n/a"}
- Rutas solicitadas (mas recientes primero): ${threat.web.topPaths.slice(0, 40).join(" | ") || "n/a"}` : ": no aplica"}

## Servicios adicionales${threat.protocols ? `
- Total eventos: ${threat.protocols.totalHits}
- Auth attempts: ${threat.protocols.authAttempts}
- Command events: ${threat.protocols.commandEvents}
- Unique ports: ${threat.protocols.uniquePorts}
${serviceLines}` : ": no aplica"}

## Escaneo de puertos${threat.portScans ? `
- Eventos de escaneo: ${threat.portScans.events}
- Puertos unicos sondeados: ${threat.portScans.uniquePorts}
- Puertos: ${threat.portScans.ports.slice(0, 60).join(", ") || "n/a"}` : ": no observado"}

## Credenciales probadas (todos los servicios)
${credentialsBlock}

## Categorias de comportamiento detectadas
${activeCats || "  ninguna"}

## Secuencia de comandos ejecutados via SSH (orden cronologico, hasta 120)
${rawCommandLines || "  ninguno"}

## Comandos/input crudo contra otros servicios (ftp, mysql, smb, etc — hasta 120)
${protocolCommandLines || "  ninguno"}

## Factores principales del score
${threat.risk.topFactors.map((factor) => `  - ${factor}`).join("\n") || "  ninguno"}

## Score breakdown
  SSH: ${threat.risk.breakdown.ssh} | Web: ${threat.risk.breakdown.web} | Services: ${threat.risk.breakdown.protocols} | Commands: ${threat.risk.breakdown.commands} | Cross-proto: ${threat.risk.breakdown.crossProto} | Evidence: ${threat.risk.breakdown.evidence}

Reglas de analisis:
- Se concreto y cita la evidencia real (comandos exactos, rutas, credenciales, puertos, motores que la marcan, comentarios de otros defensores). Nada de generalidades tipo "muestra comportamiento malicioso": eso ya lo sabemos.
- La secuencia cronologica importa: reconocimiento antes de persistencia sugiere un operador metodico; comandos identicos en segundos sugieren automatizacion/botnet.
- Una IP en hosting/bulletproof con alto score en VT/AbuseIPDB y alertas de correlacion es mas probablemente parte de una operacion organizada que un script kiddie aislado.
- Si la busqueda web identifica la campana, la familia de malware o el operador, dilo por su nombre.

Devuelve UNICAMENTE un JSON valido (sin markdown, sin texto fuera del json):
{
  "actorProfile": "en espanol, 3-4 oraciones: quien es este actor, que hizo exactamente y que lo distingue. Cita evidencia concreta.",
  "intent": "en espanol, 1-2 oraciones: que estaba intentando lograr",
  "sophistication": "script-kiddie | organized-crime | apt-like",
  "keyTactics": ["tactica concreta con la evidencia que la respalda", "..."],
  "webFindings": "en espanol, 2-4 oraciones con lo que encontraste buscando en internet sobre esta IP/ASN/campana. Si no hay nada publico relevante, escribe exactamente: Sin informacion publica relevante.",
  "iocs": ["indicadores concretos extraidos de la actividad: URLs, dominios, hashes, binarios, credenciales caracteristicas, puertos"],
  "recommendation": "en espanol, 1-2 oraciones accionables: que vigilar, bloquear o endurecer"
}`
}
