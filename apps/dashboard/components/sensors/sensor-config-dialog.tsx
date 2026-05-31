"use client"

import { useEffect, useRef, useState } from "react"
import { Save, X, RotateCcw, Info, Plus } from "lucide-react"
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
  usernames: string[]
  passwords: string[]
}

const DEFAULTS: CowrieConfig = {
  hostname: "web-prod-01",
  interactive_timeout: 300,
  authentication_timeout: 120,
  kernel_version: "5.15.0-91-generic",
  kernel_build_string: "#101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023",
  hardware_platform: "x86_64",
  ssh_version: "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6",
  usernames: ["root", "ubuntu", "admin", "oracle", "postgres", "git", "deploy", "centos", "ansible", "ec2-user", "pi", "user"],
  passwords: ["HoneyTrap2026!", "AtlasNode91", "CedarRoot88", "DeltaForge73", "EmberStack64", "FalconMesh52", "GraniteKey47", "HarborPulse39", "IronVector28", "JadeMatrix84"],
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

function TagInput({
  values,
  onChange,
  placeholder,
  validate,
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  validate?: (v: string) => string | null
}) {
  const [draft, setDraft] = useState("")
  const [err, setErr] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  function add() {
    const val = draft.trim()
    if (!val) return
    if (validate) {
      const msg = validate(val)
      if (msg) { setErr(msg); return }
    }
    if (!values.includes(val)) onChange([...values, val])
    setDraft("")
    setErr("")
  }

  function remove(idx: number) {
    onChange(values.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-muted/20 p-2 min-h-[2.5rem]">
        {values.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-mono text-foreground">
            {v}
            <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-red-400 ml-0.5">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setErr("") }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder={placeholder}
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
      {err && <p className="text-[11px] text-red-400">{err}</p>}
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

              {/* Credentials */}
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accepted Credentials</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Every username gets every password. Total entries: {cfg.usernames.length} × {cfg.passwords.length} = {cfg.usernames.length * cfg.passwords.length}
                  </p>
                </div>
                <Field label="Usernames" hint="Press Enter or click Add to add each username">
                  <TagInput
                    values={cfg.usernames}
                    onChange={(v) => set("usernames", v)}
                    placeholder="e.g. root"
                    validate={(v) => /\s/.test(v) ? "No spaces allowed" : null}
                  />
                </Field>
                <Field label="Passwords" hint="Minimum 8 characters each (enforced by Cowrie)">
                  <TagInput
                    values={cfg.passwords}
                    onChange={(v) => set("passwords", v)}
                    placeholder="e.g. MyBaitPass99!"
                    validate={(v) => v.length < 8 ? "Minimum 8 characters" : null}
                  />
                </Field>
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
