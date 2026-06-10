"use client"

import { Languages } from "lucide-react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CardHeader } from "./setting-card"
import { Surface } from "@/components/ui/surface"
import { useLocale } from "@/components/locale-provider"
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/dictionaries"

/**
 * Language preference. Unlike the other settings cards this doesn't hit
 * /api/config — the locale is a per-user, client-side preference (cookie +
 * localStorage), so it applies instantly with no save button.
 */
export function LanguageForm() {
  const { locale, setLocale, t } = useLocale()

  return (
    <Surface>
      <CardHeader
        icon={Languages}
        iconBg="bg-emerald-500/20"
        iconColor="text-emerald-400"
        title={t("settings.language.title")}
        description={t("settings.language.description")}
      />

      <div className="space-y-3 p-4">
        <Label htmlFor="language-select">{t("settings.language.label")}</Label>
        <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
          <SelectTrigger id="language-select" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCALES.map((l) => (
              <SelectItem key={l} value={l}>
                {LOCALE_LABELS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Surface>
  )
}
