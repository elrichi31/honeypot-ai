import { cookies } from "next/headers"
import {
  DEFAULT_LOCALE,
  isLocale,
  translate,
  type Locale,
  type TranslationKey,
} from "./dictionaries"

// Keep in sync with LOCALE_COOKIE in components/locale-provider.tsx. Duplicated
// here (rather than imported) so this server module doesn't pull in the client
// provider file.
const LOCALE_COOKIE = "dashboard_locale"

/** Read the per-user locale from the request cookie (server components only). */
export async function getServerLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value
  return isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
}

/**
 * Server-side counterpart to useT(): returns a `t()` bound to the request's
 * locale, for translating text inside server components (which can't use the
 * React context hook).
 */
export async function getServerT() {
  const locale = await getServerLocale()
  return (key: TranslationKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars)
}
