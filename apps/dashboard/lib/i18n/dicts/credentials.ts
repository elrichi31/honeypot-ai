// Credentials — i18n strings (en + es).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
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
} as const

export const es: Record<keyof typeof en, string> = {
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
}
