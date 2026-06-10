// Lightweight i18n dictionaries. Keys are namespaced by dot (e.g.
// "sidebar.section.intelligence"). `en` is the source of truth: its key set
// defines the `TranslationKey` type, so every other locale must provide the same
// keys (enforced by the `Record<TranslationKey, string>` annotation below).
//
// This is intentionally a plain object + a tiny t() rather than a full i18n
// library: no routing per locale, no ICU plurals needed yet, zero new deps. If we
// later need pluralization or interpolation beyond {var}, revisit.

export const LOCALES = ["en", "es"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
}

const en = {
  // ── Sidebar ──────────────────────────────────────────────────────────────
  "sidebar.tagline": "SOC view for the honeypot",
  "sidebar.collapse": "Collapse",
  "sidebar.expand": "Expand",
  "sidebar.status": "Ingest API status",
  "sidebar.status.connecting": "Connecting...",
  "sidebar.status.online": "Ingest API online",
  "sidebar.status.offline": "Ingest API offline",
  "sidebar.status.noConnection": "No connection to backend",
  "sidebar.status.noEvents": "No events yet",
  "sidebar.status.lastEvent": "Last event {time}",

  // Sections
  "sidebar.section.inicio": "Home",
  "sidebar.section.ssh": "SSH Honeypot",
  "sidebar.section.web": "Web Honeypot",
  "sidebar.section.network": "Network Honeypots",
  "sidebar.section.intelligence": "Intelligence",
  "sidebar.section.infrastructure": "Infrastructure",
  "sidebar.section.administration": "Administration",

  // Items
  "sidebar.item.dashboard": "Dashboard",
  "sidebar.item.sessions": "Sessions",
  "sidebar.item.commands": "Commands",
  "sidebar.item.credentials": "Credentials",
  "sidebar.item.campaigns": "Campaigns",
  "sidebar.item.webAttacks": "Web Attacks",
  "sidebar.item.overview": "Overview",
  "sidebar.item.deception": "Deception",
  "sidebar.item.ftp": "FTP",
  "sidebar.item.mysql": "MySQL",
  "sidebar.item.portScan": "Port Scan",
  "sidebar.item.alerts": "Alerts",
  "sidebar.item.threats": "Threats",
  "sidebar.item.malware": "Malware",
  "sidebar.item.networkIds": "Network IDS",
  "sidebar.item.apiDefense": "API Defense",
  "sidebar.item.clients": "Clients",
  "sidebar.item.sensors": "Sensors",
  "sidebar.item.installGuide": "Install Guide",
  "sidebar.item.storage": "Storage",
  "sidebar.item.monitoring": "Monitoring",
  "sidebar.item.settings": "Settings",
  "sidebar.item.users": "Users",
  "sidebar.item.adminSessions": "Sessions",
  "sidebar.item.auditLog": "Audit Log",

  // ── User menu ────────────────────────────────────────────────────────────
  "user.account": "Account",
  "user.profile": "Profile",
  "user.settings": "Settings",
  "user.logout": "Log out",

  // ── Settings: language ───────────────────────────────────────────────────
  "settings.language.title": "Language",
  "settings.language.description": "Choose the interface language. Applies immediately and is remembered on this device.",
  "settings.language.label": "Interface language",

  // ── Common ───────────────────────────────────────────────────────────────
  "common.save": "Save",
  "common.cancel": "Cancel",

  // ── Settings: shared (forms reuse these) ───────────────────────────────────
  "set.common.save": "Save",
  "set.common.saving": "Saving",
  "set.common.saved": "Saved",
  "set.common.savingEllipsis": "Saving...",
  "set.common.loading": "Loading...",
  "set.common.clear": "Clear",
  "set.common.generate": "Generate",
  "set.common.configured": "Configured",
  "set.common.savedOk": "Saved successfully.",
  "set.common.couldNotSave": "Could not save.",
  "set.common.couldNotSaveServer": "Could not save. Is the server running?",
  "set.common.reDetect": "Re-detect",
  "set.common.howItWorks": "How it works",

  // ── Settings: page ─────────────────────────────────────────────────────────
  "set.page.title": "Settings",
  "set.page.subtitle": "Configure your honeypot monitoring preferences",

  // ── Settings: session duration ─────────────────────────────────────────────
  "set.session.title": "Session duration",
  "set.session.description": "How long a login session stays valid in the dashboard.",
  "set.session.hoursLabel": "Hours (1 – 720)",
  "set.session.note": "The change applies to new sessions after restarting the dashboard. Existing sessions keep their expiration; you can force them from Administration → Sessions.",

  // ── Settings: infrastructure ───────────────────────────────────────────────
  "set.infra.title": "Infrastructure",
  "set.infra.description": "Honeypot IP, ports and ingest URL",
  "set.infra.ipLabel": "Honeypot IP",
  "set.infra.ipPlaceholder": "e.g. 192.168.1.100",
  "set.infra.ipHint": "Public IP of the machine running the SSH honeypot.",
  "set.infra.sshPort": "SSH Port",
  "set.infra.ingestPort": "Ingest Port",
  "set.infra.defaultsTo": "Defaults to",
  "set.infra.timezone": "Timezone",
  "set.infra.selectTimezone": "Select a timezone",
  "set.infra.ingestUrlLabel": "Ingest API URL",
  "set.infra.autoDetect": "Auto-detect",
  "set.infra.manual": "Manual",
  "set.infra.detectingIp": "Detecting public IP…",
  "set.infra.detectError": "Could not detect the public IP",
  "set.infra.autoErrorSuffix": "you can use Manual mode or set SENSOR_INGEST_URL in your .env",
  "set.infra.rowIngestUrl": "Ingest URL",
  "set.infra.rowPublicIp": "Public IP",
  "set.infra.rowPort": "Port",
  "set.infra.rowSource": "Source",
  "set.infra.manualPlaceholder": "http://173.249.48.182:3000",
  "set.infra.manualHint": "Public URL that remote sensors use to connect to the ingest API.",
  "set.infra.summaryIngest": "Ingest API",
  "set.infra.srcSettings": "URL configured in Settings",
  "set.infra.srcSensorVar": "SENSOR_INGEST_URL variable",
  "set.infra.srcPublicVar": "NEXT_PUBLIC_API_URL variable",
  "set.infra.srcAuto": "Auto-detected public IP",

  // ── Settings: ingest API card ──────────────────────────────────────────────
  "set.ingestApi.title": "Ingest API",
  "set.ingestApi.description": "Automatically detected public URL — the one sensors use to connect",
  "set.ingestApi.detecting": "Detecting the server's public IP…",
  "set.ingestApi.fetchError": "Could not fetch the configuration",
  "set.ingestApi.forceHint": "You can force a value with SENSOR_INGEST_URL=http://<ip>:3000 in your .env",
  "set.ingestApi.firewallNote": "must be open in the server firewall so the sensor can connect. Run:",

  // ── Settings: ingest secret ────────────────────────────────────────────────
  "set.ingestSecret.title": "Ingest secret",
  "set.ingestSecret.description": "Shared key that sensors use to authenticate to the ingest. It's embedded automatically in every installer.",
  "set.ingestSecret.placeholder": "generate or paste a long secret",
  "set.ingestSecret.importantTitle": "Important",
  "set.ingestSecret.importantBody": "If you change this secret, already-deployed sensors will stop reporting (HTTP 401) until you reinstall them with a new installer. The server's ingest-api must use the same value (INGEST_SHARED_SECRET variable).",

  // ── Settings: Discord ──────────────────────────────────────────────────────
  "set.discord.title": "Discord alerts",
  "set.discord.description": "Real-time notifications of critical honeypot events",
  "set.discord.webhookLabel": "Webhook URL",
  "set.discord.placeholderHas": "Paste a new URL to replace the current webhook",
  "set.discord.placeholderEmpty": "https://discord.com/api/webhooks/...",
  "set.discord.breadcrumb": "Discord → channel → Edit → Integrations → Webhooks → New Webhook → Copy URL",
  "set.discord.sending": "Sending...",
  "set.discord.sendTest": "Send test message",
  "set.discord.testAdmin": "Admin role is required to send the test.",
  "set.discord.testFailed": "Failed to send the test.",
  "set.discord.testConnect": "Could not connect.",
  "set.discord.whenTitle": "When you'll receive alerts",
  "set.discord.whenLogin": "Successful SSH login — an attacker authenticated successfully",
  "set.discord.whenAbuse": "IP with abuse score ≥ 80% — detected when querying enrichment",

  // ── Settings: alerts ───────────────────────────────────────────────────────
  "set.alerts.title": "Alert configuration",
  "set.alerts.description": "Control which events trigger notifications and how often",
  "set.alerts.minLevel": "Minimum alert level",
  "set.alerts.criticalOnly": "CRITICAL only",
  "set.alerts.highAndCritical": "HIGH and CRITICAL",
  "set.alerts.levelHint": "CRITICAL = score ≥ 80. HIGH = score ≥ 60. Recommended: CRITICAL only for less noise.",
  "set.alerts.activeTypes": "Active alert types",
  "set.alerts.cooldownLabel": "Cooldown per IP (minutes)",
  "set.alerts.cooldownHint": "Once an IP has been alerted, it won't be notified again until this time has elapsed.",
  "set.alerts.reportLabel": "Automatic report to Discord",
  "set.alerts.reportHint": "Activity summary sent to Discord. If there was no activity in the period, nothing is sent.",
  "set.alerts.typeThreatScore": "Critical threat",
  "set.alerts.typeThreatScoreDesc": "Risk score ≥ 80/100",
  "set.alerts.typeMultiService": "Multi-service",
  "set.alerts.typeMultiServiceDesc": "3+ distinct protocols in 10 min",
  "set.alerts.typeAuthBurst": "Authentication burst",
  "set.alerts.typeAuthBurstDesc": "12+ attempts in 5 min",
  "set.alerts.typePostAuth": "Successful login + commands",
  "set.alerts.typePostAuthDesc": "Authenticated and ran suspicious commands",
  "set.alerts.typeAttackChain": "Attack chain",
  "set.alerts.typeAttackChainDesc": "Scan → exploit → auth in sequence",
  "set.alerts.typeSensorOffline": "Sensor offline",
  "set.alerts.typeSensorOfflineDesc": "Sensor with no heartbeat for over 2 min",
  "set.alerts.reportDisabled": "Disabled",
  "set.alerts.report4h": "Every 4 hours",
  "set.alerts.report8h": "Every 8 hours",
  "set.alerts.report12h": "Every 12 hours",
  "set.alerts.report24h": "Once a day",

  // ── Settings: enrichment ───────────────────────────────────────────────────
  "set.enrichment.title": "IP Enrichment",
  "set.enrichment.description": "Enrich attacker IPs with external threat intelligence feeds",
  "set.enrichment.abuseLabel": "AbuseIPDB API Key",
  "set.enrichment.abusePlaceholder": "your-abuseipdb-key",
  "set.enrichment.abuseHint": "Free: 1,000 checks/day · abuseipdb.com/account/api",
  "set.enrichment.ipinfoLabel": "ipinfo.io API Key",
  "set.enrichment.ipinfoPlaceholder": "your-ipinfo-token",
  "set.enrichment.ipinfoHint": "Free: 50,000 requests/month (works without a key, the key only raises the limit) · ipinfo.io/signup",
  "set.enrichment.howBody": "When you open a threat or session detail, these APIs are queried. The result is cached for 7 days (AbuseIPDB) and 30 days (ipinfo) to avoid wasting quota. ipinfo works without a key.",

  // ── Settings: OpenAI ───────────────────────────────────────────────────────
  "set.openai.title": "AI Analysis",
  "set.openai.description": "OpenAI key for session threat analysis",
  "set.openai.keyLabel": "OpenAI API Key",
  "set.openai.keyHint": "Get your key at platform.openai.com/api-keys. Stored locally, never exposed in plain text.",
  "set.openai.howBody": "Open any session and click Analyze session. The dashboard sends session data to GPT-4o mini and returns a threat assessment.",

  // ── Credentials ────────────────────────────────────────────────────────────
  "cred.title": "Credentials",
  "cred.subtitle": "Login attempts, repeated credentials, and attacker auth patterns",
  "cred.filterLabel": "Filter:",

  // Tabs
  "cred.tab.rankings": "Common Credentials",
  "cred.tab.patterns": "Deep Analysis",
  "cred.tab.recent": "Recent Attempts",

  // Summary stats
  "cred.summary.successful": "Successful",
  "cred.summary.successRate": "{rate} success rate",
  "cred.summary.failed": "Failed",
  "cred.summary.totalAttempts": "{count} total attempts",
  "cred.summary.credentialPairs": "Credential Pairs",
  "cred.summary.repeatedPairs": "{count} repeated pairs",
  "cred.summary.spraySignals": "Spray Signals",
  "cred.summary.sprayHint": "passwords reused across many accounts",
  "cred.summary.targetedUsers": "Targeted Users",
  "cred.summary.targetedHint": "usernames with many password guesses",

  // Filter bar
  "cred.filter.searchPlaceholder": "Search username, password, or attacker IP...",
  "cred.filter.search": "Search",
  "cred.filter.clear": "Clear",
  "cred.filter.frequency": "Frequency",
  "cred.filter.allPairs": "All pairs",
  "cred.filter.repeatedOnly": "Repeated only",
  "cred.filter.oneOffOnly": "One-off only",
  "cred.filter.rankingType": "Ranking type",
  "cred.filter.credentialPairs": "Credential pairs",
  "cred.filter.passwords": "Passwords",
  "cred.filter.usernames": "Usernames",
  "cred.filter.visibleRows": "{count} visible rows",
  "cred.outcome.all": "All",
  "cred.outcome.success": "Success",
  "cred.outcome.failed": "Failed",

  // Table headers
  "cred.col.credentialPair": "Credential Pair",
  "cred.col.attempts": "Attempts",
  "cred.col.success": "Success",
  "cred.col.failed": "Failed",
  "cred.col.uniqueIps": "Unique IPs",
  "cred.col.lastSeen": "Last Seen",
  "cred.col.password": "Password",
  "cred.col.usernames": "Usernames",
  "cred.col.username": "Username",
  "cred.col.passwords": "Passwords",
  "cred.col.status": "Status",
  "cred.col.sourceIp": "Source IP",
  "cred.col.when": "When",

  // Table cells
  "cred.firstSeen": "First seen",
  "cred.unknown": "unknown",

  // Empty states
  "cred.empty.pairs": "No credential pairs match the current filters.",
  "cred.empty.passwords": "No passwords match the current filters.",
  "cred.empty.usernames": "No usernames match the current filters.",
  "cred.empty.recent": "No auth attempts match the current filters.",

  // Status badges
  "cred.status.success": "Success",
  "cred.status.failed": "Failed",

  // Patterns tab
  "cred.pattern.sprayTitle": "Password Spray Candidates",
  "cred.pattern.spraySubtitle": "Same password tested across many usernames",
  "cred.pattern.sprayEmpty": "No spray candidates found with the current data.",
  "cred.pattern.targetsTitle": "Targeted Usernames",
  "cred.pattern.targetsSubtitle": "Accounts hit with many password variations",
  "cred.pattern.targetsEmpty": "No heavily targeted usernames found.",
  "cred.pattern.attackersTitle": "Diversified Attackers",
  "cred.pattern.attackersSubtitle": "IPs rotating many distinct credentials",
  "cred.pattern.attackersEmpty": "No diversified attacker IPs found.",
  "cred.pattern.metaSpray": "{users} usernames - {ips} IPs",
  "cred.pattern.metaTargets": "{passwords} passwords - {ips} IPs",
  "cred.pattern.metaAttackers": "{pairs} credential pairs - {users} users",
  "cred.pattern.tries": "{count} tries",

  // ── Dashboard (home) ───────────────────────────────────────────────────────
  "dash.header.title": "Dashboard",
  "dash.header.subtitle": "Honeypot activity across all sensors",
  "dash.header.liveMap": "Live Map",
  "dash.section.sshAnalysis": "SSH Analysis",

  // Section errors
  "dash.error.metrics": "Could not load metrics",
  "dash.error.crossSensor": "Could not load cross-sensor activity",
  "dash.error.map": "Could not load the attack map",
  "dash.error.sshAnalysis": "Could not load SSH analysis",

  // Suspense loading labels
  "dash.loading.metrics": "Loading metrics…",
  "dash.loading.activity": "Loading activity…",
  "dash.loading.map": "Loading map…",
  "dash.loading.sshAnalysis": "Loading SSH analysis…",

  // KPI cards
  "dash.kpi.totalEvents": "Total events",
  "dash.kpi.sensorsReporting": "{n} sensors reporting",
  "dash.kpi.sshSessions": "SSH sessions",
  "dash.kpi.sshDetail": "{ips} IPs · {n} compromised",
  "dash.kpi.webAttacks": "Web attacks",
  "dash.kpi.webIps": "{ips} IPs",
  "dash.kpi.webTopSuffix": " · top: {type}",
  "dash.kpi.activeSources": "Active sources",
  "dash.kpi.sensorsInWindow": "Sensors reporting in the window",

  // Sensor activity grid
  "dash.sensors.activityBySensor": "Activity by sensor",
  "dash.sensors.compromised": "{n} compromised",
  "dash.sensors.topType": "top: {type}",
  "dash.sensors.authAttempts": "{n} auth attempts",
  "dash.sensors.uniqueIps": "{n} unique IPs",

  // Cross-sensor activity chart
  "dash.activity.title": "Activity over time",
  "dash.activity.subtitleHour": "Events per hour - all sensors",
  "dash.activity.subtitleDay": "Events per day - all sensors",

  // Attack heatmap
  "dash.heatmap.title": "Attack Heatmap",
  "dash.heatmap.loading": "Loading heatmap…",
  "dash.heatmap.lastDays": "last {n} days",
  "dash.heatmap.peak": "Peak:",
  "dash.heatmap.mostActiveDay": "Most active day:",
  "dash.heatmap.perHour": "attacks per hour of day (total)",
  "dash.heatmap.less": "Less",
  "dash.heatmap.more": "More",
  "dash.heatmap.sessions": "{n} sessions",

  // Country success chart
  "dash.country.title": "Success Rate by Country",
  "dash.country.subtitle": "Filtered to countries with at least 20 sessions and 2 distinct IPs",
  "dash.country.top3": "Top 3",
  "dash.country.midTier": "Mid tier",
  "dash.country.rest": "Rest",
  "dash.country.sessionsIps": "{sessions} sessions · {ips} IPs",
  "dash.country.success": "{rate}% success",
  "dash.country.successRate": "Success Rate",

  // Credential campaigns
  "dash.campaigns.title": "Credential Campaigns",
  "dash.campaigns.subtitle": "6-hour windows where the same credential pair appears across multiple IPs",
  "dash.campaigns.colCredential": "Credential",
  "dash.campaigns.colWindow": "Window",
  "dash.campaigns.colSpread": "Spread",
  "dash.campaigns.colAttempts": "Attempts",
  "dash.campaigns.successWithinWindow": "{rate}% success within window",
  "dash.campaigns.spread": "{ips} IPs · {countries} countries",
  "dash.campaigns.noPublicGeo": "No public geo",
  "dash.campaigns.successful": "{n} successful",
  "dash.campaigns.empty": "No coordinated credential windows crossed the current threshold.",

  // Attack funnel
  "dash.funnel.title": "Attack Depth Funnel",
  "dash.funnel.subtitle": "Shows how much raw noise actually becomes meaningful intrusion activity",
  "dash.funnel.explore": "Explore sessions",
  "dash.funnel.connections": "Connections",
  "dash.funnel.triedAuth": "Tried auth",
  "dash.funnel.successfulLogin": "Successful login",
  "dash.funnel.executedCommands": "Executed commands",
  "dash.funnel.highSignal": "High-signal compromise",
  "dash.funnel.baseline": "baseline",
  "dash.funnel.fromPrevious": "{pct}% from previous stage",

  // Recurring IPs
  "dash.recurring.title": "Recurring IPs",
  "dash.recurring.subtitle": "Persistent sources that return after failure and rotate credentials aggressively",
  "dash.recurring.unknownClient": "Unknown client",
  "dash.recurring.firstSeen": "first seen {date}",
  "dash.recurring.sessions": "{n} sessions",
  "dash.recurring.failures": "Failures",
  "dash.recurring.successes": "Successes",
  "dash.recurring.credentialPairs": "Credential pairs",
  "dash.recurring.returnDelay": "Return delay",
  "dash.recurring.minutes": "{n} min",

  // Command paths
  "dash.commands.title": "Post-Login Command Paths",
  "dash.commands.subtitle": "Most frequent command sequences in successful sessions",
  "dash.commands.pattern": "Pattern #{n}",
  "dash.commands.sourceIps": "{n} source IPs",

  // Session depth chart
  "dash.depth.title": "Successful Session Depth",
  "dash.depth.subtitle": "Most successful logins stay extremely shallow, which is useful signal on its own",
  "dash.depth.sessions": "Sessions",
  "dash.depth.averageCommands": "Average commands",
  "dash.depth.maximumDepth": "Maximum depth",
  "dash.depth.twentyPlus": "20+ commands",
} as const

export type TranslationKey = keyof typeof en

const es: Record<TranslationKey, string> = {
  // ── Sidebar ──────────────────────────────────────────────────────────────
  "sidebar.tagline": "Vista SOC del honeypot",
  "sidebar.collapse": "Colapsar",
  "sidebar.expand": "Expandir",
  "sidebar.status": "Estado de Ingest API",
  "sidebar.status.connecting": "Conectando...",
  "sidebar.status.online": "Ingest API en línea",
  "sidebar.status.offline": "Ingest API desconectada",
  "sidebar.status.noConnection": "Sin conexión con el backend",
  "sidebar.status.noEvents": "Aún no hay eventos",
  "sidebar.status.lastEvent": "Último evento {time}",

  // Sections
  "sidebar.section.inicio": "Inicio",
  "sidebar.section.ssh": "Honeypot SSH",
  "sidebar.section.web": "Honeypot Web",
  "sidebar.section.network": "Honeypots de Red",
  "sidebar.section.intelligence": "Inteligencia",
  "sidebar.section.infrastructure": "Infraestructura",
  "sidebar.section.administration": "Administración",

  // Items
  "sidebar.item.dashboard": "Panel",
  "sidebar.item.sessions": "Sesiones",
  "sidebar.item.commands": "Comandos",
  "sidebar.item.credentials": "Credenciales",
  "sidebar.item.campaigns": "Campañas",
  "sidebar.item.webAttacks": "Ataques Web",
  "sidebar.item.overview": "Resumen",
  "sidebar.item.deception": "Deception",
  "sidebar.item.ftp": "FTP",
  "sidebar.item.mysql": "MySQL",
  "sidebar.item.portScan": "Escaneo de Puertos",
  "sidebar.item.alerts": "Alertas",
  "sidebar.item.threats": "Amenazas",
  "sidebar.item.malware": "Malware",
  "sidebar.item.networkIds": "IDS de Red",
  "sidebar.item.apiDefense": "Defensa de API",
  "sidebar.item.clients": "Clientes",
  "sidebar.item.sensors": "Sensores",
  "sidebar.item.installGuide": "Guía de Instalación",
  "sidebar.item.storage": "Almacenamiento",
  "sidebar.item.monitoring": "Monitoreo",
  "sidebar.item.settings": "Ajustes",
  "sidebar.item.users": "Usuarios",
  "sidebar.item.adminSessions": "Sesiones",
  "sidebar.item.auditLog": "Registro de Auditoría",

  // ── User menu ────────────────────────────────────────────────────────────
  "user.account": "Cuenta",
  "user.profile": "Perfil",
  "user.settings": "Ajustes",
  "user.logout": "Cerrar sesión",

  // ── Settings: language ───────────────────────────────────────────────────
  "settings.language.title": "Idioma",
  "settings.language.description": "Elige el idioma de la interfaz. Se aplica de inmediato y se recuerda en este dispositivo.",
  "settings.language.label": "Idioma de la interfaz",

  // ── Common ───────────────────────────────────────────────────────────────
  "common.save": "Guardar",
  "common.cancel": "Cancelar",

  // ── Settings: shared ───────────────────────────────────────────────────────
  "set.common.save": "Guardar",
  "set.common.saving": "Guardando",
  "set.common.saved": "Guardado",
  "set.common.savingEllipsis": "Guardando...",
  "set.common.loading": "Cargando...",
  "set.common.clear": "Borrar",
  "set.common.generate": "Generar",
  "set.common.configured": "Configurado",
  "set.common.savedOk": "Guardado correctamente.",
  "set.common.couldNotSave": "No se pudo guardar.",
  "set.common.couldNotSaveServer": "No se pudo guardar. ¿Está corriendo el servidor?",
  "set.common.reDetect": "Volver a detectar",
  "set.common.howItWorks": "Cómo funciona",

  // ── Settings: page ─────────────────────────────────────────────────────────
  "set.page.title": "Ajustes",
  "set.page.subtitle": "Configura tus preferencias de monitoreo del honeypot",

  // ── Settings: session duration ─────────────────────────────────────────────
  "set.session.title": "Duración de sesión",
  "set.session.description": "Cuánto tiempo permanece válida una sesión de inicio de sesión en el dashboard.",
  "set.session.hoursLabel": "Horas (1 – 720)",
  "set.session.note": "El cambio aplica a las sesiones nuevas tras reiniciar el dashboard. Las sesiones existentes mantienen su expiración; puedes forzarlas desde Administración → Sesiones.",

  // ── Settings: infrastructure ───────────────────────────────────────────────
  "set.infra.title": "Infraestructura",
  "set.infra.description": "IP, puertos y URL de ingest del honeypot",
  "set.infra.ipLabel": "IP del Honeypot",
  "set.infra.ipPlaceholder": "ej. 192.168.1.100",
  "set.infra.ipHint": "IP pública de la máquina donde corre el honeypot SSH.",
  "set.infra.sshPort": "Puerto SSH",
  "set.infra.ingestPort": "Puerto de Ingest",
  "set.infra.defaultsTo": "Por defecto",
  "set.infra.timezone": "Zona horaria",
  "set.infra.selectTimezone": "Selecciona una zona horaria",
  "set.infra.ingestUrlLabel": "URL de la Ingest API",
  "set.infra.autoDetect": "Auto-detectar",
  "set.infra.manual": "Manual",
  "set.infra.detectingIp": "Detectando IP pública…",
  "set.infra.detectError": "No se pudo detectar la IP pública",
  "set.infra.autoErrorSuffix": "puedes usar el modo Manual o definir SENSOR_INGEST_URL en tu .env",
  "set.infra.rowIngestUrl": "URL de Ingest",
  "set.infra.rowPublicIp": "IP pública",
  "set.infra.rowPort": "Puerto",
  "set.infra.rowSource": "Origen",
  "set.infra.manualPlaceholder": "http://173.249.48.182:3000",
  "set.infra.manualHint": "URL pública que los sensores remotos usan para conectarse a la ingest API.",
  "set.infra.summaryIngest": "Ingest API",
  "set.infra.srcSettings": "URL configurada en Ajustes",
  "set.infra.srcSensorVar": "Variable SENSOR_INGEST_URL",
  "set.infra.srcPublicVar": "Variable NEXT_PUBLIC_API_URL",
  "set.infra.srcAuto": "IP pública auto-detectada",

  // ── Settings: ingest API card ──────────────────────────────────────────────
  "set.ingestApi.title": "Ingest API",
  "set.ingestApi.description": "URL pública detectada automáticamente — la que usan los sensores para conectarse",
  "set.ingestApi.detecting": "Detectando la IP pública del servidor…",
  "set.ingestApi.fetchError": "No se pudo obtener la configuración",
  "set.ingestApi.forceHint": "Puedes forzar un valor con SENSOR_INGEST_URL=http://<ip>:3000 en tu .env",
  "set.ingestApi.firewallNote": "debe estar abierto en el firewall del servidor para que el sensor pueda conectarse. Ejecuta:",

  // ── Settings: ingest secret ────────────────────────────────────────────────
  "set.ingestSecret.title": "Secreto de Ingest",
  "set.ingestSecret.description": "Clave compartida que los sensores usan para autenticarse con la ingest. Se incrusta automáticamente en cada instalador.",
  "set.ingestSecret.placeholder": "genera o pega un secreto largo",
  "set.ingestSecret.importantTitle": "Importante",
  "set.ingestSecret.importantBody": "Si cambias este secreto, los sensores ya desplegados dejarán de reportar (HTTP 401) hasta que los reinstales con un nuevo instalador. La ingest-api del servidor debe usar el mismo valor (variable INGEST_SHARED_SECRET).",

  // ── Settings: Discord ──────────────────────────────────────────────────────
  "set.discord.title": "Alertas de Discord",
  "set.discord.description": "Notificaciones en tiempo real de eventos críticos del honeypot",
  "set.discord.webhookLabel": "URL del Webhook",
  "set.discord.placeholderHas": "Pega una nueva URL para reemplazar el webhook actual",
  "set.discord.placeholderEmpty": "https://discord.com/api/webhooks/...",
  "set.discord.breadcrumb": "Discord → canal → Editar → Integraciones → Webhooks → Nuevo Webhook → Copiar URL",
  "set.discord.sending": "Enviando...",
  "set.discord.sendTest": "Enviar mensaje de prueba",
  "set.discord.testAdmin": "Se requiere rol de administrador para enviar la prueba.",
  "set.discord.testFailed": "No se pudo enviar la prueba.",
  "set.discord.testConnect": "No se pudo conectar.",
  "set.discord.whenTitle": "Cuándo recibirás alertas",
  "set.discord.whenLogin": "Login SSH exitoso — un atacante se autenticó correctamente",
  "set.discord.whenAbuse": "IP con score de abuso ≥ 80% — detectado al consultar el enriquecimiento",

  // ── Settings: alerts ───────────────────────────────────────────────────────
  "set.alerts.title": "Configuración de alertas",
  "set.alerts.description": "Controla qué eventos disparan notificaciones y con qué frecuencia",
  "set.alerts.minLevel": "Nivel mínimo de alerta",
  "set.alerts.criticalOnly": "Solo CRITICAL",
  "set.alerts.highAndCritical": "HIGH y CRITICAL",
  "set.alerts.levelHint": "CRITICAL = score ≥ 80. HIGH = score ≥ 60. Recomendado: solo CRITICAL para menos ruido.",
  "set.alerts.activeTypes": "Tipos de alerta activos",
  "set.alerts.cooldownLabel": "Cooldown por IP (minutos)",
  "set.alerts.cooldownHint": "Una vez alertada una IP, no se vuelve a notificar hasta que pase este tiempo.",
  "set.alerts.reportLabel": "Reporte automático a Discord",
  "set.alerts.reportHint": "Resumen de actividad enviado a Discord. Si no hubo actividad en el periodo, no se envía nada.",
  "set.alerts.typeThreatScore": "Amenaza crítica",
  "set.alerts.typeThreatScoreDesc": "Score de riesgo ≥ 80/100",
  "set.alerts.typeMultiService": "Multi-servicio",
  "set.alerts.typeMultiServiceDesc": "3+ protocolos distintos en 10 min",
  "set.alerts.typeAuthBurst": "Ráfaga de autenticación",
  "set.alerts.typeAuthBurstDesc": "12+ intentos en 5 min",
  "set.alerts.typePostAuth": "Login exitoso + comandos",
  "set.alerts.typePostAuthDesc": "Se autenticó y ejecutó comandos sospechosos",
  "set.alerts.typeAttackChain": "Cadena de ataque",
  "set.alerts.typeAttackChainDesc": "Escaneo → exploit → auth en secuencia",
  "set.alerts.typeSensorOffline": "Sensor desconectado",
  "set.alerts.typeSensorOfflineDesc": "Sensor sin heartbeat por más de 2 min",
  "set.alerts.reportDisabled": "Desactivado",
  "set.alerts.report4h": "Cada 4 horas",
  "set.alerts.report8h": "Cada 8 horas",
  "set.alerts.report12h": "Cada 12 horas",
  "set.alerts.report24h": "Una vez al día",

  // ── Settings: enrichment ───────────────────────────────────────────────────
  "set.enrichment.title": "Enriquecimiento de IP",
  "set.enrichment.description": "Enriquece las IPs de atacantes con feeds externos de inteligencia de amenazas",
  "set.enrichment.abuseLabel": "API Key de AbuseIPDB",
  "set.enrichment.abusePlaceholder": "tu-clave-abuseipdb",
  "set.enrichment.abuseHint": "Gratis: 1,000 consultas/día · abuseipdb.com/account/api",
  "set.enrichment.ipinfoLabel": "API Key de ipinfo.io",
  "set.enrichment.ipinfoPlaceholder": "tu-token-ipinfo",
  "set.enrichment.ipinfoHint": "Gratis: 50,000 peticiones/mes (funciona sin clave, la clave solo sube el límite) · ipinfo.io/signup",
  "set.enrichment.howBody": "Cuando abres el detalle de una amenaza o sesión, se consultan estas APIs. El resultado se cachea por 7 días (AbuseIPDB) y 30 días (ipinfo) para no gastar cuota. ipinfo funciona sin clave.",

  // ── Settings: OpenAI ───────────────────────────────────────────────────────
  "set.openai.title": "Análisis con IA",
  "set.openai.description": "Clave de OpenAI para el análisis de amenazas de sesiones",
  "set.openai.keyLabel": "API Key de OpenAI",
  "set.openai.keyHint": "Obtén tu clave en platform.openai.com/api-keys. Se guarda localmente, nunca se expone en texto plano.",
  "set.openai.howBody": "Abre cualquier sesión y haz clic en Analizar sesión. El dashboard envía los datos de la sesión a GPT-4o mini y devuelve una evaluación de amenaza.",

  // ── Credentials ────────────────────────────────────────────────────────────
  "cred.title": "Credenciales",
  "cred.subtitle": "Intentos de inicio de sesión, credenciales repetidas y patrones de autenticación de atacantes",
  "cred.filterLabel": "Filtro:",

  // Tabs
  "cred.tab.rankings": "Credenciales comunes",
  "cred.tab.patterns": "Análisis profundo",
  "cred.tab.recent": "Intentos recientes",

  // Summary stats
  "cred.summary.successful": "Exitosos",
  "cred.summary.successRate": "{rate} tasa de éxito",
  "cred.summary.failed": "Fallidos",
  "cred.summary.totalAttempts": "{count} intentos totales",
  "cred.summary.credentialPairs": "Pares de credenciales",
  "cred.summary.repeatedPairs": "{count} pares repetidos",
  "cred.summary.spraySignals": "Señales de spray",
  "cred.summary.sprayHint": "contraseñas reutilizadas en muchas cuentas",
  "cred.summary.targetedUsers": "Usuarios objetivo",
  "cred.summary.targetedHint": "usuarios con muchos intentos de contraseña",

  // Filter bar
  "cred.filter.searchPlaceholder": "Buscar usuario, contraseña o IP del atacante...",
  "cred.filter.search": "Buscar",
  "cred.filter.clear": "Limpiar",
  "cred.filter.frequency": "Frecuencia",
  "cred.filter.allPairs": "Todos los pares",
  "cred.filter.repeatedOnly": "Solo repetidos",
  "cred.filter.oneOffOnly": "Solo únicos",
  "cred.filter.rankingType": "Tipo de ranking",
  "cred.filter.credentialPairs": "Pares de credenciales",
  "cred.filter.passwords": "Contraseñas",
  "cred.filter.usernames": "Usuarios",
  "cred.filter.visibleRows": "{count} filas visibles",
  "cred.outcome.all": "Todos",
  "cred.outcome.success": "Exitosos",
  "cred.outcome.failed": "Fallidos",

  // Table headers
  "cred.col.credentialPair": "Par de credenciales",
  "cred.col.attempts": "Intentos",
  "cred.col.success": "Éxitos",
  "cred.col.failed": "Fallidos",
  "cred.col.uniqueIps": "IPs únicas",
  "cred.col.lastSeen": "Visto por última vez",
  "cred.col.password": "Contraseña",
  "cred.col.usernames": "Usuarios",
  "cred.col.username": "Usuario",
  "cred.col.passwords": "Contraseñas",
  "cred.col.status": "Estado",
  "cred.col.sourceIp": "IP de origen",
  "cred.col.when": "Cuándo",

  // Table cells
  "cred.firstSeen": "Visto por primera vez",
  "cred.unknown": "desconocido",

  // Empty states
  "cred.empty.pairs": "Ningún par de credenciales coincide con los filtros actuales.",
  "cred.empty.passwords": "Ninguna contraseña coincide con los filtros actuales.",
  "cred.empty.usernames": "Ningún usuario coincide con los filtros actuales.",
  "cred.empty.recent": "Ningún intento de autenticación coincide con los filtros actuales.",

  // Status badges
  "cred.status.success": "Exitoso",
  "cred.status.failed": "Fallido",

  // Patterns tab
  "cred.pattern.sprayTitle": "Candidatos a password spray",
  "cred.pattern.spraySubtitle": "Misma contraseña probada en muchos usuarios",
  "cred.pattern.sprayEmpty": "No se encontraron candidatos a spray con los datos actuales.",
  "cred.pattern.targetsTitle": "Usuarios objetivo",
  "cred.pattern.targetsSubtitle": "Cuentas atacadas con muchas variaciones de contraseña",
  "cred.pattern.targetsEmpty": "No se encontraron usuarios fuertemente atacados.",
  "cred.pattern.attackersTitle": "Atacantes diversificados",
  "cred.pattern.attackersSubtitle": "IPs que rotan muchas credenciales distintas",
  "cred.pattern.attackersEmpty": "No se encontraron IPs de atacantes diversificados.",
  "cred.pattern.metaSpray": "{users} usuarios - {ips} IPs",
  "cred.pattern.metaTargets": "{passwords} contraseñas - {ips} IPs",
  "cred.pattern.metaAttackers": "{pairs} pares de credenciales - {users} usuarios",
  "cred.pattern.tries": "{count} intentos",

  // ── Dashboard (home) ───────────────────────────────────────────────────────
  "dash.header.title": "Panel",
  "dash.header.subtitle": "Actividad del honeypot en todos los sensores",
  "dash.header.liveMap": "Mapa en vivo",
  "dash.section.sshAnalysis": "Análisis SSH",

  // Section errors
  "dash.error.metrics": "No se pudieron cargar las métricas",
  "dash.error.crossSensor": "No se pudo cargar la actividad entre sensores",
  "dash.error.map": "No se pudo cargar el mapa de ataques",
  "dash.error.sshAnalysis": "No se pudo cargar el análisis SSH",

  // Suspense loading labels
  "dash.loading.metrics": "Cargando métricas…",
  "dash.loading.activity": "Cargando actividad…",
  "dash.loading.map": "Cargando mapa…",
  "dash.loading.sshAnalysis": "Cargando análisis SSH…",

  // KPI cards
  "dash.kpi.totalEvents": "Eventos totales",
  "dash.kpi.sensorsReporting": "{n} sensores reportando",
  "dash.kpi.sshSessions": "Sesiones SSH",
  "dash.kpi.sshDetail": "{ips} IPs · {n} comprometidas",
  "dash.kpi.webAttacks": "Ataques web",
  "dash.kpi.webIps": "{ips} IPs",
  "dash.kpi.webTopSuffix": " · top: {type}",
  "dash.kpi.activeSources": "Fuentes activas",
  "dash.kpi.sensorsInWindow": "Sensores reportando en la ventana",

  // Sensor activity grid
  "dash.sensors.activityBySensor": "Actividad por sensor",
  "dash.sensors.compromised": "{n} comprometidas",
  "dash.sensors.topType": "top: {type}",
  "dash.sensors.authAttempts": "{n} intentos de autenticación",
  "dash.sensors.uniqueIps": "{n} IPs únicas",

  // Cross-sensor activity chart
  "dash.activity.title": "Actividad a lo largo del tiempo",
  "dash.activity.subtitleHour": "Eventos por hora - todos los sensores",
  "dash.activity.subtitleDay": "Eventos por día - todos los sensores",

  // Attack heatmap
  "dash.heatmap.title": "Mapa de calor de ataques",
  "dash.heatmap.loading": "Cargando mapa de calor…",
  "dash.heatmap.lastDays": "últimos {n} días",
  "dash.heatmap.peak": "Pico:",
  "dash.heatmap.mostActiveDay": "Día más activo:",
  "dash.heatmap.perHour": "ataques por hora del día (total)",
  "dash.heatmap.less": "Menos",
  "dash.heatmap.more": "Más",
  "dash.heatmap.sessions": "{n} sesiones",

  // Country success chart
  "dash.country.title": "Tasa de éxito por país",
  "dash.country.subtitle": "Filtrado a países con al menos 20 sesiones y 2 IPs distintas",
  "dash.country.top3": "Top 3",
  "dash.country.midTier": "Nivel medio",
  "dash.country.rest": "Resto",
  "dash.country.sessionsIps": "{sessions} sesiones · {ips} IPs",
  "dash.country.success": "{rate}% de éxito",
  "dash.country.successRate": "Tasa de éxito",

  // Credential campaigns
  "dash.campaigns.title": "Campañas de credenciales",
  "dash.campaigns.subtitle": "Ventanas de 6 horas donde el mismo par de credenciales aparece en varias IPs",
  "dash.campaigns.colCredential": "Credencial",
  "dash.campaigns.colWindow": "Ventana",
  "dash.campaigns.colSpread": "Alcance",
  "dash.campaigns.colAttempts": "Intentos",
  "dash.campaigns.successWithinWindow": "{rate}% de éxito en la ventana",
  "dash.campaigns.spread": "{ips} IPs · {countries} países",
  "dash.campaigns.noPublicGeo": "Sin geo pública",
  "dash.campaigns.successful": "{n} exitosos",
  "dash.campaigns.empty": "Ninguna ventana coordinada de credenciales superó el umbral actual.",

  // Attack funnel
  "dash.funnel.title": "Embudo de profundidad de ataque",
  "dash.funnel.subtitle": "Muestra cuánto del ruido bruto se convierte realmente en actividad de intrusión significativa",
  "dash.funnel.explore": "Explorar sesiones",
  "dash.funnel.connections": "Conexiones",
  "dash.funnel.triedAuth": "Intentaron autenticarse",
  "dash.funnel.successfulLogin": "Login exitoso",
  "dash.funnel.executedCommands": "Ejecutaron comandos",
  "dash.funnel.highSignal": "Compromiso de alta señal",
  "dash.funnel.baseline": "base",
  "dash.funnel.fromPrevious": "{pct}% desde la etapa anterior",

  // Recurring IPs
  "dash.recurring.title": "IPs recurrentes",
  "dash.recurring.subtitle": "Fuentes persistentes que regresan tras fallar y rotan credenciales agresivamente",
  "dash.recurring.unknownClient": "Cliente desconocido",
  "dash.recurring.firstSeen": "visto por primera vez {date}",
  "dash.recurring.sessions": "{n} sesiones",
  "dash.recurring.failures": "Fallos",
  "dash.recurring.successes": "Éxitos",
  "dash.recurring.credentialPairs": "Pares de credenciales",
  "dash.recurring.returnDelay": "Tiempo de retorno",
  "dash.recurring.minutes": "{n} min",

  // Command paths
  "dash.commands.title": "Rutas de comandos post-login",
  "dash.commands.subtitle": "Secuencias de comandos más frecuentes en sesiones exitosas",
  "dash.commands.pattern": "Patrón #{n}",
  "dash.commands.sourceIps": "{n} IPs de origen",

  // Session depth chart
  "dash.depth.title": "Profundidad de sesiones exitosas",
  "dash.depth.subtitle": "La mayoría de los logins exitosos se quedan muy superficiales, lo cual es una señal útil en sí misma",
  "dash.depth.sessions": "Sesiones",
  "dash.depth.averageCommands": "Comandos promedio",
  "dash.depth.maximumDepth": "Profundidad máxima",
  "dash.depth.twentyPlus": "20+ comandos",
}

export const dictionaries: Record<Locale, Record<TranslationKey, string>> = { en, es }

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

/**
 * Resolve a key for a locale, interpolating {var} placeholders. Falls back to the
 * English string, then to the raw key, so a missing translation degrades visibly
 * but never throws.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const template = dictionaries[locale]?.[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`))
}
