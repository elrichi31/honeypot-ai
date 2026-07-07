"use client"

import { useState, useEffect } from "react"
import { Palette } from "lucide-react"
import { apiFetch } from "@/lib/client-fetch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { CardHeader, SaveFeedback, type SaveStatus } from "./setting-card"
import { Surface } from "@/components/ui/surface"
import { useT } from "@/components/locale-provider"
import type { Brand } from "@/lib/brand-config"

export function BrandForm() {
  const t = useT()
  const [brand, setBrand] = useState<Brand>("default")
  const [status, setStatus] = useState<SaveStatus>("loading")
  const [error, setError] = useState("")

  useEffect(() => {
    apiFetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setBrand(d.brand === "ist-americas" ? "ist-americas" : "default")
        setStatus("idle")
      })
      .catch(() => setStatus("idle"))
  }, [])

  async function save() {
    setStatus("saving")
    setError("")
    try {
      const res = await apiFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand }),
      })
      if (!res.ok) throw new Error()
      window.location.reload()
    } catch {
      setError(t("set.common.couldNotSave"))
      setStatus("error")
    }
  }

  return (
    <Surface>
      <CardHeader
        icon={Palette}
        iconBg="bg-rose-500/20"
        iconColor="text-rose-400"
        title={t("set.brand.title")}
        description={t("set.brand.description")}
      />

      <div className="space-y-3 p-4">
        <Label htmlFor="brand-select">{t("set.brand.label")}</Label>
        <div className="flex gap-2">
          <Select value={brand} onValueChange={(v) => setBrand(v as Brand)} disabled={status === "loading"}>
            <SelectTrigger id="brand-select" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{t("set.brand.default")}</SelectItem>
              <SelectItem value="ist-americas">{t("set.brand.istAmericas")}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={save}
            disabled={status === "saving" || status === "loading"}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {status === "saving" ? t("set.common.saving") : t("set.common.save")}
          </Button>
        </div>
        <SaveFeedback status={status} error={error} />
        <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          {t("set.brand.note")}
        </div>
      </div>
    </Surface>
  )
}
