// Analytics — Sensor/Client Comparison, superadmin-only (docs/plans/ANALYTICS_MODULE.md Fase E).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  "analytics.comparison.title": "Sensor/Client Comparison",
  "analytics.comparison.description": "Traffic volume by sensor or client over time — superadmin, global scope only.",
  "analytics.comparison.tab.bySensor": "By sensor",
  "analytics.comparison.tab.byClient": "By client",
  "analytics.comparison.empty": "No data in this range yet.",
} as const

export const es: Record<keyof typeof en, string> = {
  "analytics.comparison.title": "Comparativa por Sensor/Cliente",
  "analytics.comparison.description": "Volumen de tráfico por sensor o cliente en el tiempo — solo superadmin, alcance global.",
  "analytics.comparison.tab.bySensor": "Por sensor",
  "analytics.comparison.tab.byClient": "Por cliente",
  "analytics.comparison.empty": "Todavía no hay datos en este rango.",
}
