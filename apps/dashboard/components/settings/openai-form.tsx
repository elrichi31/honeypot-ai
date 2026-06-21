"use client"

import { Sparkles, CheckCircle } from "lucide-react"
import { CardHeader, SecretField, useConfigField } from "./setting-card"
import { Surface } from "@/components/ui/surface"
import { useT } from "@/components/locale-provider"

export function OpenAiForm() {
  const t = useT()
  const field = useConfigField({ key: "openaiApiKey", hasKey: "hasKey", prePopulate: true })

  const badge = field.hasValue ? (
    <span className="flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
      <CheckCircle className="h-3 w-3" /> {t("set.common.configured")}
    </span>
  ) : undefined

  return (
    <Surface>
      <CardHeader icon={Sparkles} iconBg="bg-primary/20" iconColor="text-primary" title={t("set.openai.title")} description={t("set.openai.description")} badge={badge} />

      <div className="space-y-4 p-4">
        <SecretField
          id="openai-key"
          label={t("set.openai.keyLabel")}
          placeholder="sk-..."
          hint={t("set.openai.keyHint")}
          value={field.value}
          hasValue={field.hasValue}
          loading={field.status === "loading"}
          status={field.status}
          error={field.error}
          onChange={field.setValue}
          onSave={() => field.save()}
          onClear={field.clear}
        />

        <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">{t("set.common.howItWorks")}</p>
          <p>{t("set.openai.howBody")}</p>
        </div>
      </div>
    </Surface>
  )
}
