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

import * as sidebar from "./dicts/sidebar"
import * as settings from "./dicts/settings"
import * as credentials from "./dicts/credentials"
import * as dashboard from "./dicts/dashboard"
import * as threats from "./dicts/threats"
import * as iocs from "./dicts/iocs"
import * as malware from "./dicts/malware"
import * as suricata from "./dicts/suricata"
import * as defense from "./dicts/defense"
import * as clients from "./dicts/clients"
import * as sensors from "./dicts/sensors"
import * as infra from "./dicts/infra"

export const LOCALES = ["en", "es"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
}

const en = {
  ...sidebar.en,
  ...settings.en,
  ...credentials.en,
  ...dashboard.en,
  ...threats.en,
  ...iocs.en,
  ...malware.en,
  ...suricata.en,
  ...defense.en,
  ...clients.en,
  ...sensors.en,
  ...infra.en,
} as const

export type TranslationKey = keyof typeof en

const es: Record<TranslationKey, string> = {
  ...sidebar.es,
  ...settings.es,
  ...credentials.es,
  ...dashboard.es,
  ...threats.es,
  ...iocs.es,
  ...malware.es,
  ...suricata.es,
  ...defense.es,
  ...clients.es,
  ...sensors.es,
  ...infra.es,
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
