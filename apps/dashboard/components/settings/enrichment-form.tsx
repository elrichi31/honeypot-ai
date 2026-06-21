"use client"

import { useEffect, useState } from "react"
import { CheckCircle, Loader2, ShieldCheck, Activity } from "lucide-react"
import { apiFetch } from "@/lib/client-fetch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Surface } from "@/components/ui/surface"
import { useT } from "@/components/locale-provider"
import { CardHeader, SaveFeedback, SecretField, type SaveStatus } from "./setting-card"

// Plain-text URL row (not a secret, no show/hide toggle)
function UrlRow({
  id, label, placeholder, hint, value, loading, onChange, onSave, status, error,
}: {
  id: string; label: string; placeholder: string; hint: string
  value: string; loading: boolean
  onChange: (v: string) => void; onSave: () => void
  status: SaveStatus; error: string
}) {
  const t = useT()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        {loading ? (
          <div className="flex h-10 flex-1 items-center rounded-md border border-border bg-secondary px-3 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> {t("set.common.loading")}
          </div>
        ) : (
          <Input
            id={id}
            type="url"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSave()}
            className="font-mono text-sm"
          />
        )}
        <Button onClick={onSave} disabled={status === "saving" || loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {status === "saving"
            ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />{t("set.common.saving")}</>
            : status === "saved"
            ? <><CheckCircle className="mr-1.5 h-3.5 w-3.5" />{t("set.common.saved")}</>
            : t("set.common.save")}
        </Button>
      </div>
      <SaveFeedback status={status} error={error} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

interface VtQuota {
  today: number; thisMonth: number
  dailyLimit: number; monthlyLimit: number
  dailyRemaining: number; monthlyRemaining: number
}

function VtQuotaWidget({ quota }: { quota: VtQuota }) {
  const dailyPct  = Math.min(100, Math.round((quota.today / quota.dailyLimit) * 100))
  const monthPct  = Math.min(100, Math.round((quota.thisMonth / quota.monthlyLimit) * 100))
  const barColor  = (pct: number) =>
    pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-warning" : "bg-success"

  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <Activity className="h-3.5 w-3.5 text-primary" />
        VirusTotal quota usage
      </div>
      <div className="space-y-2">
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Daily ({quota.dailyLimit} req/day soft cap)</span>
            <span className={dailyPct >= 90 ? "text-destructive font-semibold" : ""}>
              {quota.today} / {quota.dailyLimit} ({quota.dailyRemaining} left)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-border">
            <div className={`h-full rounded-full transition-all ${barColor(dailyPct)}`} style={{ width: `${dailyPct}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Monthly ({quota.monthlyLimit.toLocaleString()} req/month soft cap)</span>
            <span className={monthPct >= 90 ? "text-destructive font-semibold" : ""}>
              {quota.thisMonth.toLocaleString()} / {quota.monthlyLimit.toLocaleString()} ({quota.monthlyRemaining.toLocaleString()} left)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-border">
            <div className={`h-full rounded-full transition-all ${barColor(monthPct)}`} style={{ width: `${monthPct}%` }} />
          </div>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Soft caps: 480/day · 15,000/month · Hard limits: 500/day · 15,500/month (free tier). Updates on page load.
      </p>
    </div>
  )
}

export function EnrichmentForm() {
  const t = useT()

  const [abuseKey, setAbuseKey] = useState("")
  const [hasAbuseKey, setHasAbuseKey] = useState(false)
  const [abuseStatus, setAbuseStatus] = useState<SaveStatus>("loading")
  const [abuseError, setAbuseError] = useState("")

  const [ipinfoKey, setIpinfoKey] = useState("")
  const [hasIpinfoKey, setHasIpinfoKey] = useState(false)
  const [ipinfoStatus, setIpinfoStatus] = useState<SaveStatus>("loading")
  const [ipinfoError, setIpinfoError] = useState("")

  const [spectraUrl, setSpectraUrl] = useState("")
  const [spectraToken, setSpectraToken] = useState("")
  const [hasSpectraToken, setHasSpectraToken] = useState(false)
  const [spectraUrlStatus, setSpectraUrlStatus] = useState<SaveStatus>("loading")
  const [spectraTokenStatus, setSpectraTokenStatus] = useState<SaveStatus>("loading")
  const [spectraUrlError, setSpectraUrlError] = useState("")
  const [spectraTokenError, setSpectraTokenError] = useState("")

  const [vtKey, setVtKey] = useState("")
  const [hasVtKey, setHasVtKey] = useState(false)
  const [vtStatus, setVtStatus] = useState<SaveStatus>("loading")
  const [vtError, setVtError] = useState("")
  const [vtQuota, setVtQuota] = useState<VtQuota | null>(null)

  useEffect(() => {
    apiFetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setHasAbuseKey(d.hasAbuseipdbKey)
        setAbuseKey(d.hasAbuseipdbKey ? d.abuseipdbApiKey : "")
        setAbuseStatus("idle")

        setHasIpinfoKey(d.hasIpinfoKey)
        setIpinfoKey(d.hasIpinfoKey ? d.ipinfoApiKey : "")
        setIpinfoStatus("idle")

        setSpectraUrl(d.spectraAnalyzeUrl ?? "")
        setHasSpectraToken(d.hasSpectraAnalyzeToken)
        setSpectraToken(d.hasSpectraAnalyzeToken ? d.spectraAnalyzeToken : "")
        setSpectraUrlStatus("idle")
        setSpectraTokenStatus("idle")

        setHasVtKey(d.hasVirusTotalKey)
        setVtKey(d.hasVirusTotalKey ? d.virustotalApiKey : "")
        setVtStatus("idle")
        if (d.vtQuota) setVtQuota(d.vtQuota)
      })
      .catch(() => {
        setAbuseStatus("idle")
        setIpinfoStatus("idle")
        setSpectraUrlStatus("idle")
        setSpectraTokenStatus("idle")
        setVtStatus("idle")
      })
  }, [])

  async function saveField(
    body: Record<string, string>,
    setStatus: (s: SaveStatus) => void,
    setError: (e: string) => void,
    afterSave?: () => void,
  ) {
    setStatus("saving")
    setError("")
    try {
      const res = await apiFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      afterSave?.()
      setStatus("saved")
      setTimeout(() => setStatus("idle"), 3000)
    } catch {
      setError(t("set.common.couldNotSave"))
      setStatus("error")
    }
  }

  async function saveKey(
    field: string, value: string,
    setStatus: (s: SaveStatus) => void, setError: (e: string) => void, setHas: (b: boolean) => void,
  ) {
    return saveField({ [field]: value }, setStatus, setError, () => setHas(!!value.trim()))
  }

  function clearKey(field: string, setValue: (s: string) => void, setHas: (b: boolean) => void) {
    setValue("")
    setHas(false)
    apiFetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: "" }),
    })
  }

  const anyConfigured = hasAbuseKey || hasIpinfoKey || hasSpectraToken || hasVtKey
  const badge = anyConfigured ? (
    <span className="flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
      <CheckCircle className="h-3 w-3" />
      {[hasAbuseKey && "AbuseIPDB", hasIpinfoKey && "ipinfo", hasSpectraToken && "Spectra Analyze", hasVtKey && "VirusTotal"].filter(Boolean).join(" · ")}
    </span>
  ) : undefined

  return (
    <Surface>
      <CardHeader icon={ShieldCheck} iconBg="bg-cyan-500/20" iconColor="text-cyan-400" title={t("set.enrichment.title")} description={t("set.enrichment.description")} badge={badge} />

      <div className="space-y-5 p-4">
        <SecretField
          id="abuseipdb-key"
          label={t("set.enrichment.abuseLabel")}
          placeholder={t("set.enrichment.abusePlaceholder")}
          hint={t("set.enrichment.abuseHint")}
          value={abuseKey}
          hasValue={hasAbuseKey}
          loading={abuseStatus === "loading"}
          onChange={setAbuseKey}
          onSave={() => saveKey("abuseipdbApiKey", abuseKey, setAbuseStatus, setAbuseError, setHasAbuseKey)}
          onClear={() => clearKey("abuseipdbApiKey", setAbuseKey, setHasAbuseKey)}
          status={abuseStatus}
          error={abuseError}
        />

        <div className="border-t border-border" />

        <SecretField
          id="ipinfo-key"
          label={t("set.enrichment.ipinfoLabel")}
          placeholder={t("set.enrichment.ipinfoPlaceholder")}
          hint={t("set.enrichment.ipinfoHint")}
          value={ipinfoKey}
          hasValue={hasIpinfoKey}
          loading={ipinfoStatus === "loading"}
          onChange={setIpinfoKey}
          onSave={() => saveKey("ipinfoApiKey", ipinfoKey, setIpinfoStatus, setIpinfoError, setHasIpinfoKey)}
          onClear={() => clearKey("ipinfoApiKey", setIpinfoKey, setHasIpinfoKey)}
          status={ipinfoStatus}
          error={ipinfoError}
        />

        <div className="border-t border-border" />

        <UrlRow
          id="spectra-url"
          label={t("set.enrichment.spectraUrlLabel")}
          placeholder={t("set.enrichment.spectraUrlPlaceholder")}
          hint={t("set.enrichment.spectraUrlHint")}
          value={spectraUrl}
          loading={spectraUrlStatus === "loading"}
          onChange={setSpectraUrl}
          onSave={() => saveField({ spectraAnalyzeUrl: spectraUrl }, setSpectraUrlStatus, setSpectraUrlError)}
          status={spectraUrlStatus}
          error={spectraUrlError}
        />

        <div className="border-t border-border" />

        <SecretField
          id="spectra-token"
          label={t("set.enrichment.spectraTokenLabel")}
          placeholder={t("set.enrichment.spectraTokenPlaceholder")}
          hint={t("set.enrichment.spectraTokenHint")}
          value={spectraToken}
          hasValue={hasSpectraToken}
          loading={spectraTokenStatus === "loading"}
          onChange={setSpectraToken}
          onSave={() => saveKey("spectraAnalyzeToken", spectraToken, setSpectraTokenStatus, setSpectraTokenError, setHasSpectraToken)}
          onClear={() => clearKey("spectraAnalyzeToken", setSpectraToken, setHasSpectraToken)}
          status={spectraTokenStatus}
          error={spectraTokenError}
        />

        <div className="border-t border-border" />

        <SecretField
          id="vt-key"
          label="VirusTotal API Key"
          placeholder="your-virustotal-key"
          hint="Free tier: 4 req/min · 500 req/day · 15,500 req/month · virustotal.com/gui/home/apikey"
          value={vtKey}
          hasValue={hasVtKey}
          loading={vtStatus === "loading"}
          onChange={setVtKey}
          onSave={() => saveKey("virustotalApiKey", vtKey, setVtStatus, setVtError, setHasVtKey)}
          onClear={() => clearKey("virustotalApiKey", setVtKey, setHasVtKey)}
          status={vtStatus}
          error={vtError}
        />

        {hasVtKey && vtQuota && <VtQuotaWidget quota={vtQuota} />}

        <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">{t("set.common.howItWorks")}</p>
          <p>{t("set.enrichment.howBody")}</p>
        </div>
      </div>
    </Surface>
  )
}
