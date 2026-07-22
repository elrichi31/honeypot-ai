// Dashboard — header, errors/loading, MITRE matrix, KPI cards, sensor grid, activity chart, heatmap.
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  // ── Header ─────────────────────────────────────────────────────────────────
  "dash.header.title": "Dashboard",
  "dash.header.subtitle": "Honeypot activity across all sensors",
  "dash.header.liveMap": "Live Map",
  "dash.section.sshAnalysis": "SSH Analysis",

  // ── Section errors ─────────────────────────────────────────────────────────
  "dash.error.metrics": "Could not load metrics",
  "dash.error.crossSensor": "Could not load cross-sensor activity",
  "dash.error.map": "Could not load the attack map",
  "dash.error.sshAnalysis": "Could not load SSH analysis",
  "dash.error.mitre": "Could not load the ATT&CK matrix",
  "dash.error.novelty": "Could not load novelty stats",
  "dash.error.attackerIntel": "Could not load attacker intel",
  "dash.error.botRatio": "Could not load bot/human ratio",
  "dash.error.heatmap": "Could not load the attack heatmap",
  "dash.error.services": "Could not load service activity",

  // ── Suspense loading ───────────────────────────────────────────────────────
  "dash.loading.metrics": "Loading metrics…",
  "dash.loading.activity": "Loading activity…",
  "dash.loading.map": "Loading map…",
  "dash.loading.sshAnalysis": "Loading SSH analysis…",
  "dash.loading.mitre": "Loading ATT&CK matrix…",
  "dash.loading.novelty": "Loading novelty stats…",
  "dash.loading.attackerIntel": "Loading attacker intel…",
  "dash.loading.botRatio": "Loading bot/human ratio…",
  "dash.loading.services": "Loading service activity…",

  // ── Service activity (non-SSH honeypot highlights) ─────────────────────────
  "dash.services.title": "Service activity",
  "dash.services.subtitle": "Highlights from your other honeypots",
  "dash.services.facet.credentials": "Top credentials",
  "dash.services.facet.usernames": "Top usernames",
  "dash.services.facet.commands": "Top commands",
  "dash.services.facet.databases": "Databases",
  "dash.services.facet.shares": "Shares",
  "dash.services.facet.services": "Services",
  "dash.services.facet.ports": "Target ports",

  // ── MITRE ATT&CK ──────────────────────────────────────────────────────────
  "dash.mitre.title": "MITRE ATT&CK coverage",
  "dash.mitre.subtitle": "Observed techniques mapped from honeypot activity",
  "dash.mitre.empty": "No mappable activity in the window",

  // ── KPI cards ──────────────────────────────────────────────────────────────
  "dash.kpi.vsPrev24h": "vs previous 24h",
  "dash.kpi.totalEvents": "Total events",
  "dash.kpi.sensorsReporting": "{n} sensors reporting",
  "dash.kpi.sshSessions": "SSH sessions",
  "dash.kpi.sshDetail": "{ips} IPs · {n} compromised",
  "dash.kpi.webAttacks": "Web attacks",
  "dash.kpi.webIps": "{ips} IPs",
  "dash.kpi.webTopSuffix": " · top: {type}",
  "dash.kpi.activeSources": "Active sources",
  "dash.kpi.sensorsInWindow": "Sensors reporting in the window",

  // ── Sensor activity grid ───────────────────────────────────────────────────
  "dash.sensors.activityBySensor": "Activity by sensor",
  "dash.sensors.compromised": "{n} compromised",
  "dash.sensors.topType": "top: {type}",
  "dash.sensors.authAttempts": "{n} auth attempts",
  "dash.sensors.uniqueIps": "{n} unique IPs",

  // ── Cross-sensor activity chart ────────────────────────────────────────────
  "dash.activity.title": "Activity over time",
  "dash.activity.subtitleHour": "Events per hour - all sensors",
  "dash.activity.subtitleDay": "Events per day - all sensors",

  // ── Attack heatmap ─────────────────────────────────────────────────────────
  "dash.heatmap.title": "Attack Heatmap",
  "dash.heatmap.loading": "Loading heatmap…",
  "dash.heatmap.lastDays": "last {n} days",
  "dash.heatmap.peak": "Peak:",
  "dash.heatmap.mostActiveDay": "Most active day:",
  "dash.heatmap.perHour": "attacks per hour of day (total)",
  "dash.heatmap.less": "Less",
  "dash.heatmap.more": "More",
  "dash.heatmap.sessions": "{n} sessions",
} as const

export const es: Record<keyof typeof en, string> = {
  "dash.header.title": "Panel",
  "dash.header.subtitle": "Actividad del honeypot en todos los sensores",
  "dash.header.liveMap": "Mapa en vivo",
  "dash.section.sshAnalysis": "Análisis SSH",

  "dash.error.metrics": "No se pudieron cargar las métricas",
  "dash.error.crossSensor": "No se pudo cargar la actividad entre sensores",
  "dash.error.map": "No se pudo cargar el mapa de ataques",
  "dash.error.sshAnalysis": "No se pudo cargar el análisis SSH",
  "dash.error.mitre": "No se pudo cargar la matriz ATT&CK",
  "dash.error.novelty": "No se pudieron cargar las métricas de novedad",
  "dash.error.attackerIntel": "No se pudo cargar la inteligencia del atacante",
  "dash.error.botRatio": "No se pudo cargar la relación bot/humano",
  "dash.error.heatmap": "No se pudo cargar el mapa de calor de ataques",
  "dash.error.services": "No se pudo cargar la actividad de servicios",

  "dash.loading.metrics": "Cargando métricas…",
  "dash.loading.activity": "Cargando actividad…",
  "dash.loading.map": "Cargando mapa…",
  "dash.loading.sshAnalysis": "Cargando análisis SSH…",
  "dash.loading.mitre": "Cargando matriz ATT&CK…",
  "dash.loading.novelty": "Cargando métricas de novedad…",
  "dash.loading.attackerIntel": "Cargando inteligencia del atacante…",
  "dash.loading.botRatio": "Cargando relación bot/humano…",
  "dash.loading.services": "Cargando actividad de servicios…",

  "dash.services.title": "Actividad de servicios",
  "dash.services.subtitle": "Lo más relevante de tus otros honeypots",
  "dash.services.facet.credentials": "Top credenciales",
  "dash.services.facet.usernames": "Top usuarios",
  "dash.services.facet.commands": "Top comandos",
  "dash.services.facet.databases": "Bases de datos",
  "dash.services.facet.shares": "Recursos compartidos",
  "dash.services.facet.services": "Servicios",
  "dash.services.facet.ports": "Puertos objetivo",

  "dash.mitre.title": "Cobertura MITRE ATT&CK",
  "dash.mitre.subtitle": "Técnicas observadas mapeadas desde la actividad del honeypot",
  "dash.mitre.empty": "Sin actividad mapeable en el período",

  "dash.kpi.vsPrev24h": "vs 24h previas",
  "dash.kpi.totalEvents": "Eventos totales",
  "dash.kpi.sensorsReporting": "{n} sensores reportando",
  "dash.kpi.sshSessions": "Sesiones SSH",
  "dash.kpi.sshDetail": "{ips} IPs · {n} comprometidas",
  "dash.kpi.webAttacks": "Ataques web",
  "dash.kpi.webIps": "{ips} IPs",
  "dash.kpi.webTopSuffix": " · top: {type}",
  "dash.kpi.activeSources": "Fuentes activas",
  "dash.kpi.sensorsInWindow": "Sensores reportando en la ventana",

  "dash.sensors.activityBySensor": "Actividad por sensor",
  "dash.sensors.compromised": "{n} comprometidas",
  "dash.sensors.topType": "top: {type}",
  "dash.sensors.authAttempts": "{n} intentos de autenticación",
  "dash.sensors.uniqueIps": "{n} IPs únicas",

  "dash.activity.title": "Actividad a lo largo del tiempo",
  "dash.activity.subtitleHour": "Eventos por hora - todos los sensores",
  "dash.activity.subtitleDay": "Eventos por día - todos los sensores",

  "dash.heatmap.title": "Mapa de calor de ataques",
  "dash.heatmap.loading": "Cargando mapa de calor…",
  "dash.heatmap.lastDays": "últimos {n} días",
  "dash.heatmap.peak": "Pico:",
  "dash.heatmap.mostActiveDay": "Día más activo:",
  "dash.heatmap.perHour": "ataques por hora del día (total)",
  "dash.heatmap.less": "Menos",
  "dash.heatmap.more": "Más",
  "dash.heatmap.sessions": "{n} sesiones",
}
