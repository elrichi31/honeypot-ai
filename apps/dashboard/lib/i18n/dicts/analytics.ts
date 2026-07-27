// Data Analytics module (docs/plans/ANALYTICS_MODULE.md) — i18n strings (en + es).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  "analytics.title": "Data Analytics",
  "analytics.description": "Long-range historical trends across every honeypot source, powered by ClickHouse.",
  "analytics.comingSoon": "Coming soon",
  "analytics.trends.title": "Trends Explorer",
  "analytics.trends.description": "Attack volume over any time range, broken down by protocol, sensor or client.",
  "analytics.credentials.title": "Credential Intelligence",
  "analytics.credentials.description": "Top username/password combos, brute-force campaign timelines and success-rate trends.",
  "analytics.emptyState.title": "This section is under construction",
  "analytics.emptyState.description": "We're building the ClickHouse-powered analytics module — check back soon.",
} as const

export const es: Record<keyof typeof en, string> = {
  "analytics.title": "Analítica de Datos",
  "analytics.description": "Tendencias históricas de largo rango de todas las fuentes del honeypot, con ClickHouse.",
  "analytics.comingSoon": "Próximamente",
  "analytics.trends.title": "Explorador de Tendencias",
  "analytics.trends.description": "Volumen de ataques en cualquier rango de tiempo, desglosado por protocolo, sensor o cliente.",
  "analytics.credentials.title": "Inteligencia de Credenciales",
  "analytics.credentials.description": "Top de combos usuario/contraseña, campañas de fuerza bruta y tendencia de tasa de éxito.",
  "analytics.emptyState.title": "Esta sección está en construcción",
  "analytics.emptyState.description": "Estamos construyendo el módulo de analítica con ClickHouse — volvé pronto.",
}
