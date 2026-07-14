// Sensors — WS remote control panel (status.get presence + trigger).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  "sensors.control.connected": "Control · connected",
  "sensors.control.disconnected": "Control · disconnected",
  "sensors.control.checkStatus": "Check status",
  "sensors.control.error": "Command failed",
  "sensors.control.result": "{version} · up {uptime}s",
} as const

export const es: Record<keyof typeof en, string> = {
  "sensors.control.connected": "Control · conectado",
  "sensors.control.disconnected": "Control · desconectado",
  "sensors.control.checkStatus": "Consultar estado",
  "sensors.control.error": "El comando falló",
  "sensors.control.result": "{version} · activo {uptime}s",
}
