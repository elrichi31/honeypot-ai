// Analytics — Cross-source attacker timeline on /threats/[ip] (docs/plans/ANALYTICS_MODULE.md Fase C).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  "analytics.attackerTimeline.title": "Full history (all sources)",
  "analytics.attackerTimeline.description": "Every cowrie/web/protocol/suricata event from this IP, from ClickHouse's full retention — not just what Postgres kept.",
  "analytics.attackerTimeline.loadMore": "Load more",
  "analytics.attackerTimeline.empty": "No historical events found for this IP.",
  "analytics.attackerTimeline.source.cowrie": "SSH",
  "analytics.attackerTimeline.source.web": "Web",
  "analytics.attackerTimeline.source.protocol": "Protocol",
  "analytics.attackerTimeline.source.suricata": "IDS",
} as const

export const es: Record<keyof typeof en, string> = {
  "analytics.attackerTimeline.title": "Historial completo (todas las fuentes)",
  "analytics.attackerTimeline.description": "Todos los eventos cowrie/web/protocolo/suricata de este IP, de la retención completa de ClickHouse — no solo lo que guardó Postgres.",
  "analytics.attackerTimeline.loadMore": "Cargar más",
  "analytics.attackerTimeline.empty": "No se encontraron eventos históricos para este IP.",
  "analytics.attackerTimeline.source.cowrie": "SSH",
  "analytics.attackerTimeline.source.web": "Web",
  "analytics.attackerTimeline.source.protocol": "Protocolo",
  "analytics.attackerTimeline.source.suricata": "IDS",
}
