"use client"

import { KeyRound, CheckCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CardHeader, SecretField, useConfigField } from "./setting-card"
import { Surface } from "@/components/ui/surface"
import { useT } from "@/components/locale-provider"

function generateSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export function IngestSecretForm() {
  const t = useT()
  const field = useConfigField({ key: "ingestSecret", hasKey: "hasIngestSecret", prePopulate: true })

  function handleGenerate() {
    field.setValue(generateSecret())
  }

  const badge = field.hasValue ? (
    <span className="flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
      <CheckCircle className="h-3 w-3" /> {t("set.common.configured")}
    </span>
  ) : undefined

  const generateButton = (
    <Button variant="outline" onClick={handleGenerate} disabled={field.status === "loading"} className="gap-1.5">
      <RefreshCw className="h-3.5 w-3.5" /> {t("set.common.generate")}
    </Button>
  )

  return (
    <Surface>
      <CardHeader
        icon={KeyRound}
        iconBg="bg-amber-500/20"
        iconColor="text-amber-400"
        title={t("set.ingestSecret.title")}
        description={t("set.ingestSecret.description")}
        badge={badge}
      />

      <div className="space-y-3 p-4">
        <SecretField
          id="ingest-secret"
          label="INGEST_SHARED_SECRET"
          placeholder={t("set.ingestSecret.placeholder")}
          value={field.value}
          hasValue={field.hasValue}
          loading={field.status === "loading"}
          status={field.status}
          error={field.error}
          disableSave={!field.dirty}
          onChange={field.setValue}
          onSave={() => field.save()}
          onClear={field.clear}
          extra={generateButton}
        />

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">{t("set.ingestSecret.importantTitle")}</p>
          <p>{t("set.ingestSecret.importantBody")}</p>
        </div>
      </div>
    </Surface>
  )
}
