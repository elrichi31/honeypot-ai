// Alerts list page — severity filter and grouping controls.
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  "alerts.severity.all": "All severities",
  "alerts.severity.critical": "Critical",
  "alerts.severity.high": "High",
  "alerts.severity.info": "Info",
  "alerts.groupBy.label": "Group by",
  "alerts.groupBy.none": "None",
  "alerts.groupBy.type": "Alert type",
  "alerts.groupBy.client": "Client / sensor",
  "alerts.groupBy.srcIp": "Source IP",
  "alerts.group.unknownIp": "Unknown IP",
  "alerts.group.unknownClient": "Unknown client",
  "alerts.group.count": "{count} alert(s)",
  "alerts.empty.filtered": "No alerts match this filter",
} as const

export const es: Record<keyof typeof en, string> = {
  "alerts.severity.all": "Todas las severidades",
  "alerts.severity.critical": "Crítica",
  "alerts.severity.high": "Alta",
  "alerts.severity.info": "Info",
  "alerts.groupBy.label": "Agrupar por",
  "alerts.groupBy.none": "Ninguno",
  "alerts.groupBy.type": "Tipo de alerta",
  "alerts.groupBy.client": "Cliente / sensor",
  "alerts.groupBy.srcIp": "IP de origen",
  "alerts.group.unknownIp": "IP desconocida",
  "alerts.group.unknownClient": "Cliente desconocido",
  "alerts.group.count": "{count} alerta(s)",
  "alerts.empty.filtered": "Ninguna alerta coincide con este filtro",
}
