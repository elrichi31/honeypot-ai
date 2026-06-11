// Install guide, Storage, Monitoring — i18n strings (en + es).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  // ── Install guide (infrastructure) ─────────────────────────────────────────
  "install.title": "Installing a sensor",
  "install.subtitle": "How to deploy a honeypot sensor on a Linux VPS and confirm it is reporting correctly.",
  "install.goToSensors": "Go to Sensors → Add sensor",
  "install.fullDocs": "Full documentation",
  "install.step1.title": "Pick the sensors and download the installer",
  "install.step2.title": "Copy the script to your VPS and run it as root",
  "install.step3.title": "Confirm the containers are running",
  "install.step4.title": "Confirm it appears in the dashboard",
  "install.step5.title": "Verify telemetry is flowing",
  "install.portNote.title": "Heads up about port 22 (SSH sensor)",
  "install.troubleshooting": "Troubleshooting",
  "install.done": "Once it shows up Online with events flowing, the sensor is fully deployed.",

  // ── Storage (infrastructure) ───────────────────────────────────────────────
  "storage.title": "Storage",
  "storage.subtitle": "Disk usage, database size, ingestion history and retention policy.",
  "storage.loadError": "Could not load storage stats.",

  // ── Monitoring (infrastructure) ────────────────────────────────────────────
  "monitoring.title": "Monitoring",
  "monitoring.subtitle": "Server resources, cache stats and container health. Refreshes every 60s.",
  "monitoring.updated": "Updated {time}",
  "monitoring.refresh": "Refresh",
  "monitoring.section.systemResources": "System Resources",
  "monitoring.section.containerProcesses": "Container Processes",
  "monitoring.section.redisCache": "Redis Cache",
  "monitoring.section.containers": "Containers",
} as const

export const es: Record<keyof typeof en, string> = {
  // ── Install guide (infrastructure) ─────────────────────────────────────────
  "install.title": "Instalar un sensor",
  "install.subtitle": "Cómo desplegar un sensor honeypot en un VPS Linux y confirmar que está reportando correctamente.",
  "install.goToSensors": "Ir a Sensores → Añadir sensor",
  "install.fullDocs": "Documentación completa",
  "install.step1.title": "Elige los sensores y descarga el instalador",
  "install.step2.title": "Copia el script a tu VPS y ejecútalo como root",
  "install.step3.title": "Confirma que los contenedores están en ejecución",
  "install.step4.title": "Confirma que aparece en el panel",
  "install.step5.title": "Verifica que la telemetría está fluyendo",
  "install.portNote.title": "Atención con el puerto 22 (sensor SSH)",
  "install.troubleshooting": "Resolución de problemas",
  "install.done": "Cuando aparezca En línea con eventos fluyendo, el sensor está completamente desplegado.",

  // ── Storage (infrastructure) ───────────────────────────────────────────────
  "storage.title": "Almacenamiento",
  "storage.subtitle": "Uso de disco, tamaño de la base de datos, historial de ingesta y política de retención.",
  "storage.loadError": "No se pudieron cargar las estadísticas de almacenamiento.",

  // ── Monitoring (infrastructure) ────────────────────────────────────────────
  "monitoring.title": "Monitorización",
  "monitoring.subtitle": "Recursos del servidor, estadísticas de caché y salud de contenedores. Se actualiza cada 60s.",
  "monitoring.updated": "Actualizado {time}",
  "monitoring.refresh": "Actualizar",
  "monitoring.section.systemResources": "Recursos del sistema",
  "monitoring.section.containerProcesses": "Procesos de contenedores",
  "monitoring.section.redisCache": "Caché Redis",
  "monitoring.section.containers": "Contenedores",
}
