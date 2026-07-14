// Lightweight i18n dictionaries. Keys are namespaced by dot (e.g.
// "sidebar.section.intelligence") and split into one file per namespace under
// ./dicts/. Each dict file exports its `en` (source of truth) and `es` strings
// side by side. This index merges them: the combined `en` defines the
// `TranslationKey` type, so every locale must provide the same keys (enforced by
// the `Record<TranslationKey, string>` annotations in each dict file + here).
//
// This is intentionally a plain object + a tiny t() rather than a full i18n
// library: no routing per locale, no ICU plurals needed yet, zero new deps. If we
// later need pluralization or interpolation beyond {var}, revisit.
//
// To add strings: edit (or create) the matching file in ./dicts/ — keep en + es
// together there. New namespaces just need an import + spread below.

import * as common from "./dicts/common"
import * as sidebar from "./dicts/sidebar"
import * as settingsCommon from "./dicts/settings-common"
import * as settingsInfra from "./dicts/settings-infra"
import * as settingsAlerts from "./dicts/settings-alerts"
import * as settingsEnrichment from "./dicts/settings-enrichment"
import * as credentials from "./dicts/credentials"
import * as dashboardKpi from "./dicts/dashboard-kpi"
import * as dashboardAnalysis from "./dicts/dashboard-analysis"
import * as threats from "./dicts/threats"
import * as iocs from "./dicts/iocs"
import * as malware from "./dicts/malware"
import * as suricata from "./dicts/suricata"
import * as defense from "./dicts/defense"
import * as clientsCore from "./dicts/clients-core"
import * as clientsDetail from "./dicts/clients-detail"
import * as sensorsCore from "./dicts/sensors-core"
import * as sensorsConfig from "./dicts/sensors-config"
import * as sensorsControl from "./dicts/sensors-control"
import * as infra from "./dicts/infra"
import * as sessions from "./dicts/sessions"
import * as users from "./dicts/users"
import * as threatIntel from "./dicts/threat-intel"
import * as webAttacks from "./dicts/web-attacks"
import * as reports from "./dicts/reports"
import * as alerts from "./dicts/alerts"

export const LOCALES = ["en", "es"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
}

const en = {
  ...common.en,
  ...sidebar.en,
  ...settingsCommon.en,
  ...settingsInfra.en,
  ...settingsAlerts.en,
  ...settingsEnrichment.en,
  ...credentials.en,
  ...dashboardKpi.en,
  ...dashboardAnalysis.en,
  ...threats.en,
  ...iocs.en,
  ...malware.en,
  ...suricata.en,
  ...defense.en,
  ...clientsCore.en,
  ...clientsDetail.en,
  ...sensorsCore.en,
  ...sensorsConfig.en,
  ...sensorsControl.en,
  ...infra.en,
  ...sessions.en,
  ...users.en,
  ...threatIntel.en,
  ...webAttacks.en,
  ...reports.en,
  ...alerts.en,
} as const

export type TranslationKey = keyof typeof en

const es: Record<TranslationKey, string> = {
  ...common.es,
  ...sidebar.es,
  ...settingsCommon.es,
  ...settingsInfra.es,
  ...settingsAlerts.es,
  ...settingsEnrichment.es,
  ...credentials.es,
  ...dashboardKpi.es,
  ...dashboardAnalysis.es,
  ...threats.es,
  ...iocs.es,
  ...malware.es,
  ...suricata.es,
  ...defense.es,
  ...clientsCore.es,
  ...clientsDetail.es,
  ...sensorsCore.es,
  ...sensorsConfig.es,
  ...sensorsControl.es,
  ...infra.es,
  ...sessions.es,
  ...users.es,
  ...threatIntel.es,
  ...webAttacks.es,
  ...reports.es,
  ...alerts.es,
}

export const dictionaries: Record<Locale, Record<TranslationKey, string>> = { en, es }

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

/**
 * Resolve a key for a locale, interpolating {var} placeholders. Falls back to the
 * English string, then to the raw key, so a missing translation degrades visibly
 * but never throws.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const template = dictionaries[locale]?.[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`))
}
