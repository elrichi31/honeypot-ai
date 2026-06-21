"use client"

import { useState } from "react"
import { Bell, CheckCircle, Send, AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CardHeader, SecretField, useConfigField } from "./setting-card"
import { Surface } from "@/components/ui/surface"
import { useT } from "@/components/locale-provider"
import { apiFetch } from "@/lib/client-fetch"

export function DiscordForm() {
  const t = useT()
  const field = useConfigField({ key: "discordWebhookUrl", hasKey: "hasDiscordWebhook" })
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState("")

  async function sendTest() {
    setTesting(true)
    setTestError("")
    try {
      const res = await apiFetch("/api/alerts/test", { method: "POST" })
      if (res.status === 401 || res.status === 403) {
        setTestError(t("set.discord.testAdmin"))
      } else if (!res.ok) {
        setTestError(t("set.discord.testFailed"))
      }
    } catch {
      setTestError(t("set.discord.testConnect"))
    } finally {
      setTesting(false)
    }
  }

  const badge = field.hasValue ? (
    <span className="flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
      <CheckCircle className="h-3 w-3" /> {t("set.common.configured")}
    </span>
  ) : undefined

  const testButton = field.hasValue ? (
    <div className="flex flex-col gap-1.5">
      <Button variant="outline" size="sm" onClick={sendTest} disabled={testing} className="gap-2 self-start">
        {testing
          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("set.discord.sending")}</>
          : <><Send className="h-3.5 w-3.5" />{t("set.discord.sendTest")}</>}
      </Button>
      {testError && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3 shrink-0" />{testError}
        </p>
      )}
    </div>
  ) : undefined

  return (
    <Surface>
      <CardHeader
        icon={Bell}
        iconBg="bg-indigo-500/20"
        iconColor="text-indigo-400"
        title={t("set.discord.title")}
        description={t("set.discord.description")}
        badge={badge}
      />

      <div className="space-y-4 p-4">
        <SecretField
          id="discord-webhook"
          label={t("set.discord.webhookLabel")}
          placeholder={field.hasValue ? t("set.discord.placeholderHas") : t("set.discord.placeholderEmpty")}
          hint={t("set.discord.breadcrumb")}
          value={field.value}
          hasValue={field.hasValue}
          loading={field.status === "loading"}
          status={field.status}
          error={field.error}
          onChange={field.setValue}
          onSave={() => field.save()}
          onClear={field.clear}
        />

        {testButton}

        <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">{t("set.discord.whenTitle")}</p>
          <ul className="space-y-0.5">
            <li>🔓 {t("set.discord.whenLogin")}</li>
            <li>🚨 {t("set.discord.whenAbuse")}</li>
          </ul>
        </div>
      </div>
    </Surface>
  )
}
