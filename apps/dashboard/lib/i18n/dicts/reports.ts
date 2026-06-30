// Reports module — i18n strings (en source of truth + es). Kept under 150 lines.

export const en = {
  "reports.title": "Client Reports",
  "reports.description": "Generate a PDF security report for a client.",
  "reports.range.label": "Period",
  "reports.range.week": "Last 7 days",
  "reports.range.month": "Last 30 days",
  "reports.client.label": "Client",
  "reports.client.placeholder": "Select a client",
  "reports.generate": "Generate PDF",
  "reports.generating": "Generating…",
  "reports.download.error": "Failed to generate report. Please try again.",

  // PDF sections
  "reports.section.executive": "Executive Summary",
  "reports.section.timeline": "Activity Timeline",
  "reports.section.threats": "Threat Intelligence",
  "reports.section.credentials": "Credential Attacks",
  "reports.section.reconnaissance": "Reconnaissance & Depth",
  "reports.section.geo": "Geographic Distribution",
  "reports.section.classification": "Session Classification",
  "reports.section.web": "Web Attacks",

  // KPI labels
  "reports.kpi.events": "Total Events",
  "reports.kpi.sessions": "SSH Sessions",
  "reports.kpi.webHits": "Web Hits",
  "reports.kpi.uniqueIps": "Unique Attackers",
  "reports.kpi.successLogins": "Successful Logins",
  "reports.kpi.botPct": "Bot Traffic",
  "reports.kpi.humanPct": "Human Traffic",
  "reports.kpi.mitreTactics": "MITRE Tactics",
  "reports.kpi.mitreTechniques": "MITRE Techniques",

  // Chart labels
  "reports.chart.activity": "Attack Activity",
  "reports.chart.geo": "Top Source Countries (by unique IPs)",
  "reports.chart.botRatio": "Bot vs Human Sessions",
  "reports.chart.bot": "Bot",
  "reports.chart.human": "Human",
  "reports.chart.unknown": "Unknown",
  "reports.chart.funnel": "Attack Funnel",

  // Funnel
  "reports.funnel.connections": "Connections",
  "reports.funnel.authAttempts": "Auth Attempts",
  "reports.funnel.loginSuccess": "Successful Logins",
  "reports.funnel.commands": "Commands Executed",
  "reports.funnel.compromise": "High-Signal Compromise",

  // Credentials
  "reports.creds.topPairs": "Top Credential Pairs",
  "reports.creds.username": "Username",
  "reports.creds.password": "Password",
  "reports.creds.attempts": "Attempts",
  "reports.creds.successes": "Successes",
  "reports.creds.sprayPatterns": "Password Spray Patterns",
  "reports.creds.recurringIps": "Recurring Attacker IPs",

  // MITRE
  "reports.mitre.tactic": "Tactic",
  "reports.mitre.techniques": "Techniques",
  "reports.mitre.hits": "Hits",

  // Footer
  "reports.footer.generated": "Generated",
  "reports.footer.period": "Period",
  "reports.footer.confidential": "Confidential — For authorized recipient only",
  "reports.noActivity": "No activity recorded for this period.",
} as const

export const es: Record<keyof typeof en, string> = {
  "reports.title": "Reportes por Cliente",
  "reports.description": "Genera un reporte PDF de seguridad para un cliente.",
  "reports.range.label": "Período",
  "reports.range.week": "Últimos 7 días",
  "reports.range.month": "Últimos 30 días",
  "reports.client.label": "Cliente",
  "reports.client.placeholder": "Seleccionar cliente",
  "reports.generate": "Generar PDF",
  "reports.generating": "Generando…",
  "reports.download.error": "Error al generar el reporte. Intente de nuevo.",

  "reports.section.executive": "Resumen Ejecutivo",
  "reports.section.timeline": "Línea de Tiempo de Actividad",
  "reports.section.threats": "Inteligencia de Amenazas",
  "reports.section.credentials": "Ataques de Credenciales",
  "reports.section.reconnaissance": "Reconocimiento y Profundidad",
  "reports.section.geo": "Distribución Geográfica",
  "reports.section.classification": "Clasificación de Sesiones",
  "reports.section.web": "Ataques Web",

  "reports.kpi.events": "Total de Eventos",
  "reports.kpi.sessions": "Sesiones SSH",
  "reports.kpi.webHits": "Hits Web",
  "reports.kpi.uniqueIps": "Atacantes Únicos",
  "reports.kpi.successLogins": "Logins Exitosos",
  "reports.kpi.botPct": "Tráfico Bot",
  "reports.kpi.humanPct": "Tráfico Humano",
  "reports.kpi.mitreTactics": "Tácticas MITRE",
  "reports.kpi.mitreTechniques": "Técnicas MITRE",

  "reports.chart.activity": "Actividad de Ataques",
  "reports.chart.geo": "Principales Países de Origen (por IPs únicas)",
  "reports.chart.botRatio": "Sesiones Bot vs Humano",
  "reports.chart.bot": "Bot",
  "reports.chart.human": "Humano",
  "reports.chart.unknown": "Desconocido",
  "reports.chart.funnel": "Embudo de Ataque",

  "reports.funnel.connections": "Conexiones",
  "reports.funnel.authAttempts": "Intentos de Auth",
  "reports.funnel.loginSuccess": "Logins Exitosos",
  "reports.funnel.commands": "Comandos Ejecutados",
  "reports.funnel.compromise": "Compromiso de Alta Señal",

  "reports.creds.topPairs": "Pares de Credenciales Más Usados",
  "reports.creds.username": "Usuario",
  "reports.creds.password": "Contraseña",
  "reports.creds.attempts": "Intentos",
  "reports.creds.successes": "Éxitos",
  "reports.creds.sprayPatterns": "Patrones de Password Spray",
  "reports.creds.recurringIps": "IPs Atacantes Recurrentes",

  "reports.mitre.tactic": "Táctica",
  "reports.mitre.techniques": "Técnicas",
  "reports.mitre.hits": "Hits",

  "reports.footer.generated": "Generado",
  "reports.footer.period": "Período",
  "reports.footer.confidential": "Confidencial — Solo para destinatario autorizado",
  "reports.noActivity": "Sin actividad registrada para este período.",
}
