"use client"

import { useEffect, useState } from "react"
import { Save, X, RotateCcw, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface CowrieConfig {
  hostname: string
  interactive_timeout: number
  authentication_timeout: number
  kernel_version: string
  kernel_build_string: string
  hardware_platform: string
  ssh_version: string
}

const DEFAULTS: CowrieConfig = {
  hostname: "web-prod-01",
  interactive_timeout: 300,
  authentication_timeout: 120,
  kernel_version: "5.15.0-91-generic",
  kernel_build_string: "#101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023",
  hardware_platform: "x86_64",
  ssh_version: "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6",
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function SensorConfigDialog({
  sensorId,
  open,
  onClose,
}: {
  sensorId: string
  open: boolean
  onClose: () => void
}) {
  const [cfg, setCfg] = useState<CowrieConfig>(DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError("")
    setSaved(false)
    fetch(`/api/sensors/${encodeURIComponent(sensorId)}/config`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.config) setCfg({ ...DEFAULTS, ...data.config })
      })
      .catch(() => setError("No se pudo cargar la configuración"))
      .finally(() => setLoading(false))
  }, [open, sensorId])

  function set<K extends keyof CowrieConfig>(key: K, value: CowrieConfig[K]) {
    setCfg((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    try {
      const res = await fetch(`/api/sensors/${encodeURIComponent(sensorId)}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      })
      if (!res.ok) throw new Error()
      setSaved(true)
    } catch {
      setError("Error al guardar. Intenta de nuevo.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSave} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Configure SSH Honeypot</DialogTitle>
            <DialogDescription>
              Changes are applied on the next Cowrie restart (triggered automatically within ~60s).
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading config…</div>
          ) : (
            <>
              {/* Identity */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identity</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Hostname" hint="Shown in the shell prompt after login">
                    <Input
                      value={cfg.hostname}
                      onChange={(e) => set("hostname", e.target.value)}
                      placeholder="web-prod-01"
                      className="font-mono text-sm"
                    />
                  </Field>
                  <Field label="Hardware Platform" hint="Returned by uname -m">
                    <Input
                      value={cfg.hardware_platform}
                      onChange={(e) => set("hardware_platform", e.target.value)}
                      placeholder="x86_64"
                      className="font-mono text-sm"
                    />
                  </Field>
                </div>
              </div>

              {/* SSH Banner */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SSH Banner</p>
                <Field label="SSH Version String" hint="Sent during the SSH handshake — attackers fingerprint servers by this">
                  <Input
                    value={cfg.ssh_version}
                    onChange={(e) => set("ssh_version", e.target.value)}
                    placeholder="SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6"
                    className="font-mono text-sm"
                  />
                </Field>
              </div>

              {/* Kernel */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kernel Info</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Kernel Version" hint="Returned by uname -r">
                    <Input
                      value={cfg.kernel_version}
                      onChange={(e) => set("kernel_version", e.target.value)}
                      placeholder="5.15.0-91-generic"
                      className="font-mono text-sm"
                    />
                  </Field>
                  <Field label="Kernel Build String" hint="Returned by uname -v">
                    <Input
                      value={cfg.kernel_build_string}
                      onChange={(e) => set("kernel_build_string", e.target.value)}
                      placeholder="#101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023"
                      className="font-mono text-sm"
                    />
                  </Field>
                </div>
              </div>

              {/* Timeouts */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Session Timeouts</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Interactive Timeout (s)" hint="Idle session closes after this many seconds">
                    <Input
                      type="number"
                      min={30}
                      max={3600}
                      value={cfg.interactive_timeout}
                      onChange={(e) => set("interactive_timeout", Number(e.target.value))}
                      className="font-mono text-sm"
                    />
                  </Field>
                  <Field label="Authentication Timeout (s)" hint="Time allowed to complete authentication">
                    <Input
                      type="number"
                      min={10}
                      max={600}
                      value={cfg.authentication_timeout}
                      onChange={(e) => set("authentication_timeout", Number(e.target.value))}
                      className="font-mono text-sm"
                    />
                  </Field>
                </div>
              </div>

              {/* Restart notice */}
              {saved && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-400">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Config saved. Cowrie will apply it and restart automatically within ~60 seconds.
                  </span>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setCfg(DEFAULTS); setSaved(false) }}
              disabled={loading || saving}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset defaults
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading || saving}>
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save & Apply"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
