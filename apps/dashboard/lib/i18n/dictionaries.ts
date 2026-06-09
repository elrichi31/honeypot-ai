// Lightweight i18n dictionaries. Keys are namespaced by dot (e.g.
// "sidebar.section.intelligence"). `en` is the source of truth: its key set
// defines the `TranslationKey` type, so every other locale must provide the same
// keys (enforced by the `Record<TranslationKey, string>` annotation below).
//
// This is intentionally a plain object + a tiny t() rather than a full i18n
// library: no routing per locale, no ICU plurals needed yet, zero new deps. If we
// later need pluralization or interpolation beyond {var}, revisit.

export const LOCALES = ["en", "es"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
}

const en = {
  // ── Sidebar ──────────────────────────────────────────────────────────────
  "sidebar.tagline": "SOC view for the honeypot",
  "sidebar.collapse": "Collapse",
  "sidebar.expand": "Expand",
  "sidebar.status": "Ingest API status",
  "sidebar.status.connecting": "Connecting...",
  "sidebar.status.online": "Ingest API online",
  "sidebar.status.offline": "Ingest API offline",
  "sidebar.status.noConnection": "No connection to backend",
  "sidebar.status.noEvents": "No events yet",
  "sidebar.status.lastEvent": "Last event {time}",

  // Sections
  "sidebar.section.inicio": "Home",
  "sidebar.section.ssh": "SSH Honeypot",
  "sidebar.section.web": "Web Honeypot",
  "sidebar.section.network": "Network Honeypots",
  "sidebar.section.intelligence": "Intelligence",
  "sidebar.section.infrastructure": "Infrastructure",
  "sidebar.section.administration": "Administration",

  // Items
  "sidebar.item.dashboard": "Dashboard",
  "sidebar.item.sessions": "Sessions",
  "sidebar.item.commands": "Commands",
  "sidebar.item.credentials": "Credentials",
  "sidebar.item.campaigns": "Campaigns",
  "sidebar.item.webAttacks": "Web Attacks",
  "sidebar.item.overview": "Overview",
  "sidebar.item.deception": "Deception",
  "sidebar.item.ftp": "FTP",
  "sidebar.item.mysql": "MySQL",
  "sidebar.item.portScan": "Port Scan",
  "sidebar.item.alerts": "Alerts",
  "sidebar.item.threats": "Threats",
  "sidebar.item.malware": "Malware",
  "sidebar.item.networkIds": "Network IDS",
  "sidebar.item.apiDefense": "API Defense",
  "sidebar.item.clients": "Clients",
  "sidebar.item.sensors": "Sensors",
  "sidebar.item.installGuide": "Install Guide",
  "sidebar.item.storage": "Storage",
  "sidebar.item.monitoring": "Monitoring",
  "sidebar.item.settings": "Settings",
  "sidebar.item.users": "Users",
  "sidebar.item.adminSessions": "Sessions",
  "sidebar.item.auditLog": "Audit Log",

  // ── User menu ────────────────────────────────────────────────────────────
  "user.account": "Account",
  "user.profile": "Profile",
  "user.settings": "Settings",
  "user.logout": "Log out",

  // ── Settings: language ───────────────────────────────────────────────────
  "settings.language.title": "Language",
  "settings.language.description": "Choose the interface language. Applies immediately and is remembered on this device.",
  "settings.language.label": "Interface language",

  // ── Common ───────────────────────────────────────────────────────────────
  "common.save": "Save",
  "common.cancel": "Cancel",
} as const

export type TranslationKey = keyof typeof en

const es: Record<TranslationKey, string> = {
  // ── Sidebar ──────────────────────────────────────────────────────────────
  "sidebar.tagline": "Vista SOC del honeypot",
  "sidebar.collapse": "Colapsar",
  "sidebar.expand": "Expandir",
  "sidebar.status": "Estado de Ingest API",
  "sidebar.status.connecting": "Conectando...",
  "sidebar.status.online": "Ingest API en línea",
  "sidebar.status.offline": "Ingest API desconectada",
  "sidebar.status.noConnection": "Sin conexión con el backend",
  "sidebar.status.noEvents": "Aún no hay eventos",
  "sidebar.status.lastEvent": "Último evento {time}",

  // Sections
  "sidebar.section.inicio": "Inicio",
  "sidebar.section.ssh": "Honeypot SSH",
  "sidebar.section.web": "Honeypot Web",
  "sidebar.section.network": "Honeypots de Red",
  "sidebar.section.intelligence": "Inteligencia",
  "sidebar.section.infrastructure": "Infraestructura",
  "sidebar.section.administration": "Administración",

  // Items
  "sidebar.item.dashboard": "Panel",
  "sidebar.item.sessions": "Sesiones",
  "sidebar.item.commands": "Comandos",
  "sidebar.item.credentials": "Credenciales",
  "sidebar.item.campaigns": "Campañas",
  "sidebar.item.webAttacks": "Ataques Web",
  "sidebar.item.overview": "Resumen",
  "sidebar.item.deception": "Deception",
  "sidebar.item.ftp": "FTP",
  "sidebar.item.mysql": "MySQL",
  "sidebar.item.portScan": "Escaneo de Puertos",
  "sidebar.item.alerts": "Alertas",
  "sidebar.item.threats": "Amenazas",
  "sidebar.item.malware": "Malware",
  "sidebar.item.networkIds": "IDS de Red",
  "sidebar.item.apiDefense": "Defensa de API",
  "sidebar.item.clients": "Clientes",
  "sidebar.item.sensors": "Sensores",
  "sidebar.item.installGuide": "Guía de Instalación",
  "sidebar.item.storage": "Almacenamiento",
  "sidebar.item.monitoring": "Monitoreo",
  "sidebar.item.settings": "Ajustes",
  "sidebar.item.users": "Usuarios",
  "sidebar.item.adminSessions": "Sesiones",
  "sidebar.item.auditLog": "Registro de Auditoría",

  // ── User menu ────────────────────────────────────────────────────────────
  "user.account": "Cuenta",
  "user.profile": "Perfil",
  "user.settings": "Ajustes",
  "user.logout": "Cerrar sesión",

  // ── Settings: language ───────────────────────────────────────────────────
  "settings.language.title": "Idioma",
  "settings.language.description": "Elige el idioma de la interfaz. Se aplica de inmediato y se recuerda en este dispositivo.",
  "settings.language.label": "Idioma de la interfaz",

  // ── Common ───────────────────────────────────────────────────────────────
  "common.save": "Guardar",
  "common.cancel": "Cancelar",
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
