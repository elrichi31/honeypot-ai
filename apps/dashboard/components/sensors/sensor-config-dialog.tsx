"use client"

import { apiFetch, assertOk } from "@/lib/client-fetch"

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
import { useT } from "@/components/locale-provider"

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
  addLabel,
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  validate?: (v: string) => string | null
  addLabel: string
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
          {addLabel}
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
  const t = useT()
  const [cfg, setCfg] = useState<CowrieConfig>(DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError("")
    setSaved(false)
    apiFetch(`/api/sensors/${encodeURIComponent(sensorId)}/config`, { cache: "no-store" })
      .then((r) => assertOk(r))
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data?.config) setCfg({ ...DEFAULTS, ...data.config })
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError(t("sensors.config.loadError"))
        setLoading(false)
      })
    return () => { cancelled = true }
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
      await assertOk(await apiFetch(`/api/sensors/${encodeURIComponent(sensorId)}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      }), t("sensors.config.saveError"))
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sensors.config.saveError"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSave} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{t("sensors.config.title")}</DialogTitle>
            <DialogDescription>
              {t("sensors.config.description")}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("sensors.config.loading")}</div>
          ) : (
            <>
              {/* Identity */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sensors.config.section.identity")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("sensors.config.field.hostname")} hint={t("sensors.config.field.hostname.hint")}>
                    <Input
                      value={cfg.hostname}
                      onChange={(e) => set("hostname", e.target.value)}
                      placeholder="web-prod-01"
                      className="font-mono text-sm"
                    />
                  </Field>
                  <Field label={t("sensors.config.field.hardwarePlatform")} hint={t("sensors.config.field.hardwarePlatform.hint")}>
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
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sensors.config.section.sshBanner")}</p>
                <Field label={t("sensors.config.field.sshVersion")} hint={t("sensors.config.field.sshVersion.hint")}>
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
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sensors.config.section.kernel")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("sensors.config.field.kernelVersion")} hint={t("sensors.config.field.kernelVersion.hint")}>
                    <Input
                      value={cfg.kernel_version}
                      onChange={(e) => set("kernel_version", e.target.value)}
                      placeholder="5.15.0-91-generic"
                      className="font-mono text-sm"
                    />
                  </Field>
                  <Field label={t("sensors.config.field.kernelBuild")} hint={t("sensors.config.field.kernelBuild.hint")}>
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
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sensors.config.section.timeouts")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("sensors.config.field.interactiveTimeout")} hint={t("sensors.config.field.interactiveTimeout.hint")}>
                    <Input
                      type="number"
                      min={30}
                      max={3600}
                      value={cfg.interactive_timeout}
                      onChange={(e) => set("interactive_timeout", Number(e.target.value))}
                      className="font-mono text-sm"
                    />
                  </Field>
                  <Field label={t("sensors.config.field.authTimeout")} hint={t("sensors.config.field.authTimeout.hint")}>
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
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sensors.config.section.credentials")}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t("sensors.config.credentials.total", { total: String(cfg.usernames.length * cfg.passwords.length) })}
                  </p>
                </div>
                <Field label={t("sensors.config.field.usernames")} hint={t("sensors.config.field.usernames.hint")}>
                  <TagInput
                    values={cfg.usernames}
                    onChange={(v) => set("usernames", v)}
                    placeholder="e.g. root"
                    validate={(v) => /\s/.test(v) ? t("sensors.config.tagInput.noSpaces") : null}
                    addLabel={t("sensors.config.tagInput.add")}
                  />
                </Field>
                <Field label={t("sensors.config.field.passwords")} hint={t("sensors.config.field.passwords.hint")}>
                  <TagInput
                    values={cfg.passwords}
                    onChange={(v) => set("passwords", v)}
                    placeholder="e.g. MyBaitPass99!"
                    validate={(v) => v.length < 8 ? t("sensors.config.tagInput.minLength") : null}
                    addLabel={t("sensors.config.tagInput.add")}
                  />
                </Field>
              </div>

              {/* Restart notice */}
              {saved && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-400">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{t("sensors.config.saved")}</span>
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
              {t("sensors.config.resetDefaults")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
              {t("sensors.config.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={loading || saving}>
              <Save className="h-3.5 w-3.5" />
              {saving ? t("sensors.config.saving") : t("sensors.config.saveApply")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
