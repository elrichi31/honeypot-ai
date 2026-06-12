// Dashboard (home) — i18n strings (en + es).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
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
  "dash.error.mitre": "Could not load the ATT&CK matrix",

  // Suspense loading labels
  "dash.loading.metrics": "Loading metrics…",
  "dash.loading.activity": "Loading activity…",
  "dash.loading.map": "Loading map…",
  "dash.loading.sshAnalysis": "Loading SSH analysis…",
  "dash.loading.mitre": "Loading ATT&CK matrix…",

  // MITRE ATT&CK matrix
  "dash.mitre.title": "MITRE ATT&CK coverage",
  "dash.mitre.subtitle": "Observed techniques mapped from honeypot activity",
  "dash.mitre.empty": "No mappable activity in the window",

  // KPI cards
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

  // Section errors / loading — threat intel trio
  "dash.error.novelty": "Could not load novelty stats",
  "dash.error.attackerIntel": "Could not load attacker intel",
  "dash.error.botRatio": "Could not load bot/human ratio",
  "dash.loading.novelty": "Loading novelty stats…",
  "dash.loading.attackerIntel": "Loading attacker intel…",
  "dash.loading.botRatio": "Loading bot/human ratio…",
} as const

export const es: Record<keyof typeof en, string> = {
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
  "dash.error.mitre": "No se pudo cargar la matriz ATT&CK",

  // Suspense loading labels
  "dash.loading.metrics": "Cargando métricas…",
  "dash.loading.activity": "Cargando actividad…",
  "dash.loading.map": "Cargando mapa…",
  "dash.loading.sshAnalysis": "Cargando análisis SSH…",
  "dash.loading.mitre": "Cargando matriz ATT&CK…",

  // MITRE ATT&CK matrix
  "dash.mitre.title": "Cobertura MITRE ATT&CK",
  "dash.mitre.subtitle": "Técnicas observadas mapeadas desde la actividad del honeypot",
  "dash.mitre.empty": "Sin actividad mapeable en el período",

  // KPI cards
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

  // Section errors / loading — threat intel trio
  "dash.error.novelty": "No se pudieron cargar las métricas de novedad",
  "dash.error.attackerIntel": "No se pudo cargar la inteligencia del atacante",
  "dash.error.botRatio": "No se pudo cargar la relación bot/humano",
  "dash.loading.novelty": "Cargando métricas de novedad…",
  "dash.loading.attackerIntel": "Cargando inteligencia del atacante…",
  "dash.loading.botRatio": "Cargando relación bot/humano…",
}
