"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import {
  DEFAULT_LOCALE,
  isLocale,
  translate,
  type Locale,
  type TranslationKey,
} from "@/lib/i18n/dictionaries"

export const LOCALE_COOKIE = "dashboard_locale"
const LOCALE_STORAGE = "dashboard_locale"

type LocaleContextValue = {
  locale: Locale
  setLocale: (next: Locale) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

/**
 * Per-user language preference. The server reads the locale cookie and passes it
 * in as `initialLocale` so the first paint already matches (no flash). On the
 * client we reconcile with localStorage in case it drifted, and `setLocale`
 * writes both the cookie (so the next server render is correct) and localStorage.
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale
  children: React.ReactNode
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  useEffect(() => {
    const cached = typeof window !== "undefined" ? localStorage.getItem(LOCALE_STORAGE) : null
    if (isLocale(cached) && cached !== locale) setLocaleState(cached)
    // Only on mount: align state with the device's stored preference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCALE_STORAGE, next)
      // 1-year cookie so SSR renders in the chosen language on the next request.
      document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`
    }
  }, [])

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  )

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    // Safe fallback if used outside a provider (e.g. isolated tests): English, noop setter.
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
    }
  }
  return ctx
}

/** Convenience hook when a component only needs the translate function. */
export function useT() {
  return useLocale().t
}
