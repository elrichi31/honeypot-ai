"use client"

import { apiFetch } from "@/lib/client-fetch"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { KeyRound, Eye, EyeOff, CheckCircle, Loader2, RefreshCw } from "lucide-react"
import { SaveFeedback, CardHeader, type SaveStatus } from "./setting-card"

// Generate a strong, URL-safe random secret in the browser (64 hex chars).
function generateSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export function IngestSecretForm() {
  const [secret, setSecret] = useState("")
  const [hasSecret, setHasSecret] = useState(false)
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<SaveStatus>("loading")
  const [error, setError] = useState("")
  // Tracks whether the field currently holds a freshly generated/typed secret
  // (vs the masked value loaded from the server, which must not be saved back).
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    apiFetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setHasSecret(d.hasIngestSecret)
        setSecret(d.hasIngestSecret ? d.ingestSecret : "")
        setStatus("idle")
      })
      .catch(() => setStatus("idle"))
  }, [])

  async function save(value: string) {
    setStatus("saving")
    setError("")
    try {
      const res = await apiFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingestSecret: value }),
      })
      if (!res.ok) throw new Error()
      setHasSecret(!!value.trim())
      setDirty(false)
      setStatus("saved")
      setTimeout(() => setStatus("idle"), 3000)
    } catch {
      setError("No se pudo guardar.")
      setStatus("error")
    }
  }

  function handleGenerate() {
    const s = generateSecret()
    setSecret(s)
    setShow(true)
    setDirty(true)
  }

  function handleClear() {
    setSecret("")
    setHasSecret(false)
    setDirty(false)
    save("")
  }

  const badge = hasSecret ? (
    <span className="flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
      <CheckCircle className="h-3 w-3" /> Configurado
    </span>
  ) : undefined

  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader
        icon={KeyRound}
        iconBg="bg-amber-500/20"
        iconColor="text-amber-400"
        title="Secreto de ingestión"
        description="Clave compartida que los sensores usan para autenticarse al ingest. Se incrusta automáticamente en cada instalador."
        badge={badge}
      />

      <div className="space-y-3 p-4">
        <Label htmlFor="ingest-secret">INGEST_SHARED_SECRET</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            {status === "loading" ? (
              <div className="flex h-10 items-center rounded-md border border-border bg-secondary px-3 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Cargando...
              </div>
            ) : (
              <Input
                id="ingest-secret"
                type={show ? "text" : "password"}
                placeholder="genera o pega un secreto largo"
                value={secret}
                onChange={(e) => { setSecret(e.target.value); setDirty(true) }}
                onKeyDown={(e) => e.key === "Enter" && dirty && save(secret)}
                className="pr-10 font-mono text-sm"
              />
            )}
            {status !== "loading" && (
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          </div>
          <Button variant="outline" onClick={handleGenerate} disabled={status === "loading"} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Generar
          </Button>
          <Button
            onClick={() => save(secret)}
            disabled={status === "saving" || status === "loading" || !dirty}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {status === "saving" ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Guardando</> : status === "saved" ? <><CheckCircle className="mr-1.5 h-3.5 w-3.5" />Guardado</> : "Guardar"}
          </Button>
          {hasSecret && <Button variant="outline" onClick={handleClear}>Borrar</Button>}
        </div>
        <SaveFeedback status={status} error={error} />

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Importante</p>
          <p>
            Si cambias este secreto, los sensores ya desplegados dejarán de reportar (HTTP 401)
            hasta que los reinstales con un instalador nuevo. El ingest-api del servidor debe usar
            el mismo valor (variable <span className="font-mono">INGEST_SHARED_SECRET</span>).
          </p>
        </div>
      </div>
    </div>
  )
}
