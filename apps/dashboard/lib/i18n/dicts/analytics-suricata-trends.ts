// Analytics — Suricata Signature Trends (docs/plans/ANALYTICS_MODULE.md Fase D).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  "analytics.suricataTrends.title": "Suricata Signature Trends",
  "analytics.suricataTrends.description": "Long-range trend of the top signatures/categories, not just the last 24h.",
  "analytics.suricataTrends.groupBy.signature": "By signature",
  "analytics.suricataTrends.groupBy.category": "By category",
  "analytics.suricataTrends.top.title": "Top over this range",
  "analytics.suricataTrends.col.name": "Name",
  "analytics.suricataTrends.col.count": "Alerts",
  "analytics.suricataTrends.col.severity": "Min. severity",
  "analytics.suricataTrends.empty": "No Suricata alerts in this range yet.",
  "analytics.suricataTrends.top.description": "Concentration within the top groups returned for this range.",
  "analytics.suricataTrends.metric.visible": "Visible alert volume",
  "analytics.suricataTrends.metric.topTen": "Across the top 10 groups",
  "analytics.suricataTrends.metric.groups": "Tracked groups",
  "analytics.suricataTrends.metric.priorityOne": "Priority 1 groups",
  "analytics.suricataTrends.metric.highestPriority": "Highest Suricata priority",
  "analytics.suricataTrends.metric.concentration": "Top concentration",
} as const

export const es: Record<keyof typeof en, string> = {
  "analytics.suricataTrends.title": "Tendencias de Firmas Suricata",
  "analytics.suricataTrends.description": "Tendencia de largo rango de las top firmas/categorías, no solo las últimas 24h.",
  "analytics.suricataTrends.groupBy.signature": "Por firma",
  "analytics.suricataTrends.groupBy.category": "Por categoría",
  "analytics.suricataTrends.top.title": "Top en este rango",
  "analytics.suricataTrends.col.name": "Nombre",
  "analytics.suricataTrends.col.count": "Alertas",
  "analytics.suricataTrends.col.severity": "Severidad mín.",
  "analytics.suricataTrends.empty": "Todavía no hay alertas de Suricata en este rango.",
  "analytics.suricataTrends.top.description": "Concentración dentro de los grupos principales devueltos para este rango.",
  "analytics.suricataTrends.metric.visible": "Volumen visible de alertas",
  "analytics.suricataTrends.metric.topTen": "En los 10 grupos principales",
  "analytics.suricataTrends.metric.groups": "Grupos rastreados",
  "analytics.suricataTrends.metric.priorityOne": "Grupos prioridad 1",
  "analytics.suricataTrends.metric.highestPriority": "Máxima prioridad de Suricata",
  "analytics.suricataTrends.metric.concentration": "Concentración principal",
}
