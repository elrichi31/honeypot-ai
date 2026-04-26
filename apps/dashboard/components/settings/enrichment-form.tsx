"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ShieldCheck, Eye, EyeOff, CheckCircle, Loader2 } from "lucide-react"
import { SaveFeedback, CardHeader, type SaveStatus } from "./setting-card"

interface KeyRowProps {
  id: string
  label: string
  placeholder: string
  hint: string
  value: string
  hasKey: boolean
  loading: boolean
  onChange: (v: string) => void
  onSave: () => void
  onClear: () => void
  status: SaveStatus
  error: string
}

function KeyRow({ id, label, placeholder, hint, value, hasKey, loading, onChange, onSave, onClear, status, error }: KeyRowProps) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          {loading ? (
            <div className="flex h-10 items-center rounded-md border border-border bg-secondary px-3 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading...
            </div>
          ) : (
            <Input
              id={id}
              type={show ? "text" : "password"}
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSave()}
              className="pr-10 font-mono text-sm"
            />
          )}
          {!loading && (
            <button type="button" onClick={() => setShow(!show)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        <Button onClick={onSave} disabled={status === "saving" || loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {status === "saving" ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving</> : status === "saved" ? <><CheckCircle className="mr-1.5 h-3.5 w-3.5" />Saved</> : "Save"}
        </Button>
        {hasKey && <Button variant="outline" onClick={onClear}>Clear</Button>}
      </div>
      <SaveFeedback status={status} error={error} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

export function EnrichmentForm() {
  const [abuseKey, setAbuseKey] = useState("")
  const [hasAbuseKey, setHasAbuseKey] = useState(false)
  const [abuseStatus, setAbuseStatus] = useState<SaveStatus>("loading")
  const [abuseError, setAbuseError] = useState("")

  const [ipinfoKey, setIpinfoKey] = useState("")
  const [hasIpinfoKey, setHasIpinfoKey] = useState(false)
  const [ipinfoStatus, setIpinfoStatus] = useState<SaveStatus>("loading")
  const [ipinfoError, setIpinfoError] = useState("")

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setHasAbuseKey(d.hasAbuseipdbKey)
        setAbuseKey(d.hasAbuseipdbKey ? d.abuseipdbApiKey : "")
        setAbuseStatus("idle")
        setHasIpinfoKey(d.hasIpinfoKey)
        setIpinfoKey(d.hasIpinfoKey ? d.ipinfoApiKey : "")
        setIpinfoStatus("idle")
      })
      .catch(() => { setAbuseStatus("idle"); setIpinfoStatus("idle") })
  }, [])

  async function saveKey(field: string, value: string, setStatus: (s: SaveStatus) => void, setError: (e: string) => void, setHas: (b: boolean) => void) {
    setStatus("saving")
    setError("")
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error()
      setHas(!!value.trim())
      setStatus("saved")
      setTimeout(() => setStatus("idle"), 3000)
    } catch {
      setError("Could not save.")
      setStatus("error")
    }
  }

  function clearKey(field: string, setValue: (s: string) => void, setHas: (b: boolean) => void) {
    setValue("")
    setHas(false)
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: "" }),
    })
  }

  const anyConfigured = hasAbuseKey || hasIpinfoKey
  const badge = anyConfigured ? (
    <span className="flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
      <CheckCircle className="h-3 w-3" /> {[hasAbuseKey && "AbuseIPDB", hasIpinfoKey && "ipinfo"].filter(Boolean).join(" · ")}
    </span>
  ) : undefined

  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader icon={ShieldCheck} iconBg="bg-cyan-500/20" iconColor="text-cyan-400" title="IP Enrichment" description="Enrich attacker IPs with external threat intelligence feeds" badge={badge} />

      <div className="space-y-5 p-4">
        <KeyRow
          id="abuseipdb-key"
          label="AbuseIPDB API Key"
          placeholder="your-abuseipdb-key"
          hint="Free: 1,000 checks/día · abuseipdb.com/account/api"
          value={abuseKey}
          hasKey={hasAbuseKey}
          loading={abuseStatus === "loading"}
          onChange={setAbuseKey}
          onSave={() => saveKey("abuseipdbApiKey", abuseKey, setAbuseStatus, setAbuseError, setHasAbuseKey)}
          onClear={() => clearKey("abuseipdbApiKey", setAbuseKey, setHasAbuseKey)}
          status={abuseStatus}
          error={abuseError}
        />

        <div className="border-t border-border" />

        <KeyRow
          id="ipinfo-key"
          label="ipinfo.io API Key"
          placeholder="your-ipinfo-token"
          hint="Free: 50,000 requests/mes (funciona sin key, key solo sube el límite) · ipinfo.io/signup"
          value={ipinfoKey}
          hasKey={hasIpinfoKey}
          loading={ipinfoStatus === "loading"}
          onChange={setIpinfoKey}
          onSave={() => saveKey("ipinfoApiKey", ipinfoKey, setIpinfoStatus, setIpinfoError, setHasIpinfoKey)}
          onClear={() => clearKey("ipinfoApiKey", setIpinfoKey, setHasIpinfoKey)}
          status={ipinfoStatus}
          error={ipinfoError}
        />

        <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Cómo funciona</p>
          <p>Al abrir el detalle de una amenaza o sesión, se consultan estas APIs. El resultado se cachea <strong>7 días</strong> (AbuseIPDB) y <strong>30 días</strong> (ipinfo) para no desperdiciar quota. ipinfo funciona sin key.</p>
        </div>
      </div>
    </div>
  )
}
