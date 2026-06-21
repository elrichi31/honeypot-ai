// Dashboard — analysis sections: country chart, campaigns, funnel, recurring IPs, commands, session depth.
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  // ── Country success chart ──────────────────────────────────────────────────
  "dash.country.title": "Success Rate by Country",
  "dash.country.subtitle": "Filtered to countries with at least 20 sessions and 2 distinct IPs",
  "dash.country.top3": "Top 3",
  "dash.country.midTier": "Mid tier",
  "dash.country.rest": "Rest",
  "dash.country.sessionsIps": "{sessions} sessions · {ips} IPs",
  "dash.country.success": "{rate}% success",
  "dash.country.successRate": "Success Rate",

  // ── Credential campaigns ───────────────────────────────────────────────────
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

  // ── Attack funnel ──────────────────────────────────────────────────────────
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

  // ── Recurring IPs ──────────────────────────────────────────────────────────
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

  // ── Post-login command paths ───────────────────────────────────────────────
  "dash.commands.title": "Post-Login Command Paths",
  "dash.commands.subtitle": "Most frequent command sequences in successful sessions",
  "dash.commands.pattern": "Pattern #{n}",
  "dash.commands.sourceIps": "{n} source IPs",

  // ── Session depth chart ────────────────────────────────────────────────────
  "dash.depth.title": "Successful Session Depth",
  "dash.depth.subtitle": "Most successful logins stay extremely shallow, which is useful signal on its own",
  "dash.depth.sessions": "Sessions",
  "dash.depth.averageCommands": "Average commands",
  "dash.depth.maximumDepth": "Maximum depth",
  "dash.depth.twentyPlus": "20+ commands",
} as const

export const es: Record<keyof typeof en, string> = {
  "dash.country.title": "Tasa de éxito por país",
  "dash.country.subtitle": "Filtrado a países con al menos 20 sesiones y 2 IPs distintas",
  "dash.country.top3": "Top 3",
  "dash.country.midTier": "Nivel medio",
  "dash.country.rest": "Resto",
  "dash.country.sessionsIps": "{sessions} sesiones · {ips} IPs",
  "dash.country.success": "{rate}% de éxito",
  "dash.country.successRate": "Tasa de éxito",

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

  "dash.commands.title": "Rutas de comandos post-login",
  "dash.commands.subtitle": "Secuencias de comandos más frecuentes en sesiones exitosas",
  "dash.commands.pattern": "Patrón #{n}",
  "dash.commands.sourceIps": "{n} IPs de origen",

  "dash.depth.title": "Profundidad de sesiones exitosas",
  "dash.depth.subtitle": "La mayoría de los logins exitosos se quedan muy superficiales, lo cual es una señal útil en sí misma",
  "dash.depth.sessions": "Sesiones",
  "dash.depth.averageCommands": "Comandos promedio",
  "dash.depth.maximumDepth": "Profundidad máxima",
  "dash.depth.twentyPlus": "20+ comandos",
}
