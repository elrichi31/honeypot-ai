import type { TranslationKey } from "../dictionaries"

export const en = {
  "webAttacks.timeline.rankingTitle": "Attack ranking",
  "webAttacks.timeline.rankingSubtitle": "Sorted by frequency · all-time",

  "webAttacks.geo.noData": "No geolocalizable data",
  "webAttacks.geo.noDataHint": "Private/Docker IPs have no geo",
  "webAttacks.geo.tableSubtitle": "Sorted by total hits · click an IP to see details",
  "webAttacks.geo.col.topThreat": "Top threat",
  "webAttacks.geo.col.pctOfTotal": "% of total",
} as const

export const es: Record<keyof typeof en, string> = {
  "webAttacks.timeline.rankingTitle": "Ranking de ataques",
  "webAttacks.timeline.rankingSubtitle": "Ordenado por frecuencia · all-time",

  "webAttacks.geo.noData": "Sin datos geolocalizables",
  "webAttacks.geo.noDataHint": "Las IPs privadas/Docker no tienen geo",
  "webAttacks.geo.tableSubtitle": "Ordenado por total de hits · click en una IP para ver su detalle",
  "webAttacks.geo.col.topThreat": "Top amenaza",
  "webAttacks.geo.col.pctOfTotal": "% del total",
}

void (0 as unknown as keyof typeof en extends TranslationKey ? true : never)
