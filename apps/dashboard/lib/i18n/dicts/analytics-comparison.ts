// Analytics — Sensor/Client Comparison, superadmin-only (docs/plans/ANALYTICS_MODULE.md Fase E).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  "analytics.comparison.title": "Sensor/Client Comparison",
  "analytics.comparison.description": "Traffic volume by sensor or client over time — superadmin, global scope only.",
  "analytics.comparison.tab.bySensor": "By sensor",
  "analytics.comparison.tab.byClient": "By client",
  "analytics.comparison.empty": "No data in this range yet.",
  "analytics.comparison.forbidden": "Global comparison requires superadmin access.",
  "analytics.comparison.chartDescription": "Compare volume and movement across entities on the same timeline.",
  "analytics.comparison.metric.events": "Compared events",
  "analytics.comparison.metric.entities": "Active entities",
  "analytics.comparison.metric.leader": "Leading entity",
  "analytics.comparison.metric.concentration": "Concentration",
  "analytics.comparison.metric.leadingShare": "Share held by the leading entity",
  "analytics.comparison.share.title": "Volume share",
  "analytics.comparison.share.description": "How the selected range is distributed across entities.",
} as const

export const es: Record<keyof typeof en, string> = {
  "analytics.comparison.title": "Comparativa por Sensor/Cliente",
  "analytics.comparison.description": "Volumen de tráfico por sensor o cliente en el tiempo — solo superadmin, alcance global.",
  "analytics.comparison.tab.bySensor": "Por sensor",
  "analytics.comparison.tab.byClient": "Por cliente",
  "analytics.comparison.empty": "Todavía no hay datos en este rango.",
  "analytics.comparison.forbidden": "La comparación global requiere acceso de superadmin.",
  "analytics.comparison.chartDescription": "Compara el volumen y movimiento de las entidades en una misma línea de tiempo.",
  "analytics.comparison.metric.events": "Eventos comparados",
  "analytics.comparison.metric.entities": "Entidades activas",
  "analytics.comparison.metric.leader": "Entidad líder",
  "analytics.comparison.metric.concentration": "Concentración",
  "analytics.comparison.metric.leadingShare": "Participación de la entidad líder",
  "analytics.comparison.share.title": "Participación de volumen",
  "analytics.comparison.share.description": "Cómo se distribuye el rango seleccionado entre las entidades.",
}
