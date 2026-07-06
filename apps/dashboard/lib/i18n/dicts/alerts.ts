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
  "alerts.deleteAll.button": "Delete all",
  "alerts.deleteAll.title": "Delete all alerts?",
  "alerts.deleteAll.descScoped": "This will permanently delete all alerts for the selected tenant. This cannot be undone.",
  "alerts.deleteAll.descAll": "This will permanently delete all alerts in the current scope. This cannot be undone.",
  "alerts.deleteAll.cancel": "Cancel",
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
  "alerts.deleteAll.button": "Eliminar todas",
  "alerts.deleteAll.title": "¿Eliminar todas las alertas?",
  "alerts.deleteAll.descScoped": "Esto eliminará permanentemente todas las alertas del tenant seleccionado. No se puede deshacer.",
  "alerts.deleteAll.descAll": "Esto eliminará permanentemente todas las alertas del alcance actual. No se puede deshacer.",
  "alerts.deleteAll.cancel": "Cancelar",
}
