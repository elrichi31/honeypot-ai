// Data Analytics module (docs/plans/ANALYTICS_MODULE.md) — i18n strings (en + es).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  "analytics.title": "Data Analytics",
  "analytics.description": "Long-range historical trends across every honeypot source, powered by ClickHouse.",
  "analytics.trends.title": "Trends Explorer",
  "analytics.trends.description": "Attack volume over any time range, broken down by protocol, sensor or client.",
  "analytics.trends.empty.title": "No events in this range yet",
  "analytics.trends.empty.description": "Try a wider range, or check back once more traffic has come in.",
  "analytics.unavailable.title": "Analytics is not available",
  "analytics.unavailable.description": "The ClickHouse-backed analytics module isn't reachable on this deployment.",
  "analytics.credentials.title": "Credential Intelligence",
} as const

export const es: Record<keyof typeof en, string> = {
  "analytics.title": "Analítica de Datos",
  "analytics.description": "Tendencias históricas de largo rango de todas las fuentes del honeypot, con ClickHouse.",
  "analytics.trends.title": "Explorador de Tendencias",
  "analytics.trends.description": "Volumen de ataques en cualquier rango de tiempo, desglosado por protocolo, sensor o cliente.",
  "analytics.trends.empty.title": "Todavía no hay eventos en este rango",
  "analytics.trends.empty.description": "Probá un rango más amplio, o volvé cuando haya entrado más tráfico.",
  "analytics.unavailable.title": "La analítica no está disponible",
  "analytics.unavailable.description": "El módulo de analítica con ClickHouse no está alcanzable en este deploy.",
  "analytics.credentials.title": "Inteligencia de Credenciales",
}
