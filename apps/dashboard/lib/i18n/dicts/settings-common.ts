// Settings — shared/common strings, page title, language picker, session duration.
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  // ── Language picker ────────────────────────────────────────────────────────
  "settings.language.title": "Language",
  "settings.language.description": "Choose the interface language. Applies immediately and is remembered on this device.",
  "settings.language.label": "Interface language",

  // ── Global common actions ──────────────────────────────────────────────────
  "common.save": "Save",
  "common.cancel": "Cancel",

  // ── Settings form shared ───────────────────────────────────────────────────
  "set.common.save": "Save",
  "set.common.saving": "Saving",
  "set.common.saved": "Saved",
  "set.common.savingEllipsis": "Saving...",
  "set.common.loading": "Loading...",
  "set.common.clear": "Clear",
  "set.common.generate": "Generate",
  "set.common.configured": "Configured",
  "set.common.savedOk": "Saved successfully.",
  "set.common.couldNotSave": "Could not save.",
  "set.common.couldNotSaveServer": "Could not save. Is the server running?",
  "set.common.reDetect": "Re-detect",
  "set.common.howItWorks": "How it works",

  // ── Settings page ──────────────────────────────────────────────────────────
  "set.page.title": "Settings",
  "set.page.subtitle": "Configure your honeypot monitoring preferences",

  // ── Session duration ───────────────────────────────────────────────────────
  "set.session.title": "Session duration",
  "set.session.description": "How long a login session stays valid in the dashboard.",
  "set.session.hoursLabel": "Hours (1 – 720)",
  "set.session.note": "The change applies to new sessions after restarting the dashboard. Existing sessions keep their expiration; you can force them from Administration → Sessions.",

  // ── OpenAI / AI analysis ───────────────────────────────────────────────────
  "set.openai.title": "AI Analysis",
  "set.openai.description": "OpenAI key for session threat analysis",
  "set.openai.keyLabel": "OpenAI API Key",
  "set.openai.keyHint": "Get your key at platform.openai.com/api-keys. Stored locally, never exposed in plain text.",
  "set.openai.howBody": "Open any session and click Analyze session. The dashboard sends session data to GPT-4o mini and returns a threat assessment.",
} as const

export const es: Record<keyof typeof en, string> = {
  "settings.language.title": "Idioma",
  "settings.language.description": "Elige el idioma de la interfaz. Se aplica de inmediato y se recuerda en este dispositivo.",
  "settings.language.label": "Idioma de la interfaz",

  "common.save": "Guardar",
  "common.cancel": "Cancelar",

  "set.common.save": "Guardar",
  "set.common.saving": "Guardando",
  "set.common.saved": "Guardado",
  "set.common.savingEllipsis": "Guardando...",
  "set.common.loading": "Cargando...",
  "set.common.clear": "Borrar",
  "set.common.generate": "Generar",
  "set.common.configured": "Configurado",
  "set.common.savedOk": "Guardado correctamente.",
  "set.common.couldNotSave": "No se pudo guardar.",
  "set.common.couldNotSaveServer": "No se pudo guardar. ¿Está corriendo el servidor?",
  "set.common.reDetect": "Volver a detectar",
  "set.common.howItWorks": "Cómo funciona",

  "set.page.title": "Ajustes",
  "set.page.subtitle": "Configura tus preferencias de monitoreo del honeypot",

  "set.session.title": "Duración de sesión",
  "set.session.description": "Cuánto tiempo permanece válida una sesión de inicio de sesión en el dashboard.",
  "set.session.hoursLabel": "Horas (1 – 720)",
  "set.session.note": "El cambio aplica a las sesiones nuevas tras reiniciar el dashboard. Las sesiones existentes mantienen su expiración; puedes forzarlas desde Administración → Sesiones.",

  "set.openai.title": "Análisis con IA",
  "set.openai.description": "Clave de OpenAI para el análisis de amenazas de sesiones",
  "set.openai.keyLabel": "API Key de OpenAI",
  "set.openai.keyHint": "Obtén tu clave en platform.openai.com/api-keys. Se guarda localmente, nunca se expone en texto plano.",
  "set.openai.howBody": "Abre cualquier sesión y haz clic en Analizar sesión. El dashboard envía los datos de la sesión a GPT-4o mini y devuelve una evaluación de amenaza.",
}
