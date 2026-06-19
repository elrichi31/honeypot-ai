// Session classification labels + summaries (en + es), keyed by the stable
// ClassificationKey from lib/session-classify-v2.ts. Rendered by session-row,
// ip-session-group and scan-group-row. Also holds a few badge/empty strings that
// had leaked as hardcoded Spanish in those components.
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  // ── Classification labels ────────────────────────────────────────────────
  "sessions.class.sshBackdoor.label": "SSH Backdoor",
  "sessions.class.honeypotEvasion.label": "Honeypot Evasion",
  "sessions.class.containerEscape.label": "Container Escape",
  "sessions.class.cryptoMiner.label": "Crypto Miner",
  "sessions.class.dataExfil.label": "Data Exfil",
  "sessions.class.targetedCrypto.label": "Targeted Crypto",
  "sessions.class.portProbe.label": "Port probe",
  "sessions.class.burstBrute.label": "Burst brute-force",
  "sessions.class.slowBrute.label": "Slow brute-force",
  "sessions.class.credSpray.label": "Credential spray",
  "sessions.class.scanner.label": "Scanner",
  "sessions.class.malwareDropper.label": "Malware dropper",
  "sessions.class.interactive.label": "Interactive",
  "sessions.class.recon.label": "Recon",
  "sessions.class.botScript.label": "Bot Script",
  "sessions.class.loginOnly.label": "Login only",

  // ── Classification summaries ─────────────────────────────────────────────
  "sessions.class.sshBackdoor.summary": "Tried to plant a persistent SSH key with chattr +ai",
  "sessions.class.honeypotEvasion.summary": "Detected sandbox/honeypot · probed for Telegram/SIM data",
  "sessions.class.containerEscape.summary": "Tried to detect and escape the container environment",
  "sessions.class.cryptoMiner.summary": "Deployed a cryptocurrency miner",
  "sessions.class.dataExfil.summary": "Tried to exfiltrate system data",
  "sessions.class.targetedCrypto.summary": "Probed for Solana infrastructure (validator, Jito, Firedancer)",
  "sessions.class.portProbe.summary": "Opened and closed quickly without trying credentials",
  "sessions.class.burstBrute.summary": "{authAttempts} burst attempts · access denied",
  "sessions.class.slowBrute.summary": "{authAttempts} credentials over {min} min",
  "sessions.class.credSpray.summary": "{authAttempts} credentials tried · automated",
  "sessions.class.scanner.summary": "Brief recon · no successful authentication",
  "sessions.class.malwareDropper.summary": "Successful access · {commandCount} commands · extensive activity",
  "sessions.class.interactive.summary": "Successful access · {commandCount} commands executed",
  "sessions.class.recon.summary": "Successful access · basic reconnaissance",
  "sessions.class.botScript.summary": "Automated script · {commandCount} cmd in {duration}s",
  "sessions.class.loginOnly.summary": "Successful access · no post-login activity",

  // ── Badges / misc (previously leaked Spanish) ────────────────────────────
  "sessions.badge.compromised": "Compromised",
  "sessions.badge.bot": "Bot",
  "sessions.badge.human": "Human",
  "sessions.badge.sessions": "{n} sessions",
  "sessions.empty.noEvents": "No events recorded.",
} as const

export const es: Record<keyof typeof en, string> = {
  // ── Classification labels ────────────────────────────────────────────────
  "sessions.class.sshBackdoor.label": "Puerta trasera SSH",
  "sessions.class.honeypotEvasion.label": "Evasión de honeypot",
  "sessions.class.containerEscape.label": "Escape de contenedor",
  "sessions.class.cryptoMiner.label": "Minero de cripto",
  "sessions.class.dataExfil.label": "Exfiltración de datos",
  "sessions.class.targetedCrypto.label": "Cripto dirigido",
  "sessions.class.portProbe.label": "Sondeo de puerto",
  "sessions.class.burstBrute.label": "Fuerza bruta en ráfaga",
  "sessions.class.slowBrute.label": "Fuerza bruta lenta",
  "sessions.class.credSpray.label": "Rociado de credenciales",
  "sessions.class.scanner.label": "Escáner",
  "sessions.class.malwareDropper.label": "Dropper de malware",
  "sessions.class.interactive.label": "Interactivo",
  "sessions.class.recon.label": "Reconocimiento",
  "sessions.class.botScript.label": "Script de bot",
  "sessions.class.loginOnly.label": "Solo inicio de sesión",

  // ── Classification summaries ─────────────────────────────────────────────
  "sessions.class.sshBackdoor.summary": "Intentó instalar una clave SSH persistente con chattr +ai",
  "sessions.class.honeypotEvasion.summary": "Detectó sandbox/honeypot · sondeó datos de Telegram/SIM",
  "sessions.class.containerEscape.summary": "Intentó detectar y escapar del entorno del contenedor",
  "sessions.class.cryptoMiner.summary": "Desplegó un minero de criptomonedas",
  "sessions.class.dataExfil.summary": "Intentó exfiltrar datos del sistema",
  "sessions.class.targetedCrypto.summary": "Sondeó infraestructura de Solana (validador, Jito, Firedancer)",
  "sessions.class.portProbe.summary": "Se abrió y cerró rápido sin probar credenciales",
  "sessions.class.burstBrute.summary": "{authAttempts} intentos en ráfaga · acceso denegado",
  "sessions.class.slowBrute.summary": "{authAttempts} credenciales en {min} min",
  "sessions.class.credSpray.summary": "{authAttempts} credenciales probadas · automatizado",
  "sessions.class.scanner.summary": "Reconocimiento breve · sin autenticación exitosa",
  "sessions.class.malwareDropper.summary": "Acceso exitoso · {commandCount} comandos · actividad extensa",
  "sessions.class.interactive.summary": "Acceso exitoso · {commandCount} comandos ejecutados",
  "sessions.class.recon.summary": "Acceso exitoso · reconocimiento básico",
  "sessions.class.botScript.summary": "Script automatizado · {commandCount} cmd en {duration}s",
  "sessions.class.loginOnly.summary": "Acceso exitoso · sin actividad posterior",

  // ── Badges / misc (previously leaked Spanish) ────────────────────────────
  "sessions.badge.compromised": "Comprometido",
  "sessions.badge.bot": "Bot",
  "sessions.badge.human": "Humano",
  "sessions.badge.sessions": "{n} sesiones",
  "sessions.empty.noEvents": "Sin eventos registrados.",
}
