"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/components/locale-provider"
import { apiFetch } from "@/lib/client-fetch"
import { CheckCircle, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react"

export type SaveStatus = "idle" | "loading" | "saving" | "saved" | "error"

// ---------------------------------------------------------------------------
// Primitives reused across all settings forms
// ---------------------------------------------------------------------------

export function Skeleton() {
  return <div className="h-10 w-full animate-pulse rounded-md bg-secondary" />
}

export function SaveFeedback({ status, error }: { status: SaveStatus; error: string }) {
  const t = useT()
  if (status === "error")
    return (
      <p className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3 w-3" /> {error}
      </p>
    )
  if (status === "saved")
    return (
      <p className="flex items-center gap-1 text-xs text-success">
        <CheckCircle className="h-3 w-3" /> {t("set.common.savedOk")}
      </p>
    )
  return null
}

export function SaveButton({ status, loading, disabled }: { status: SaveStatus; loading: boolean; disabled?: boolean }) {
  const t = useT()
  return (
    <Button
      type="submit"
      disabled={status === "saving" || loading || disabled}
      className="bg-primary text-primary-foreground hover:bg-primary/90"
    >
      {status === "saving" ? (
        <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> {t("set.common.saving")}</>
      ) : status === "saved" ? (
        <><CheckCircle className="mr-1.5 h-3.5 w-3.5" /> {t("set.common.saved")}</>
      ) : (
        t("set.common.save")
      )}
    </Button>
  )
}

export function CardHeader({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  badge,
}: {
  icon: React.ElementType
  iconBg: string
  iconColor: string
  title: string
  description: string
  badge?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border p-4">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {badge}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SecretField — password input with show/hide toggle, loading skeleton,
// save/clear buttons. Shared by every "API key / secret" settings row.
// ---------------------------------------------------------------------------

export interface SecretFieldProps {
  id: string
  label: string
  placeholder: string
  hint?: string
  value: string
  hasValue: boolean
  loading: boolean
  status: SaveStatus
  error: string
  onChange: (v: string) => void
  onSave: () => void
  onClear: () => void
  /** Extra buttons rendered after the clear button (e.g. "Send test"). */
  extra?: React.ReactNode
  /** Disable the save button even when not saving/loading (e.g. not dirty). */
  disableSave?: boolean
}

export function SecretField({
  id, label, placeholder, hint, value, hasValue,
  loading, status, error, onChange, onSave, onClear, extra, disableSave,
}: SecretFieldProps) {
  const t = useT()
  const [show, setShow] = useState(false)

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          {loading ? (
            <div className="flex h-10 items-center rounded-md border border-border bg-secondary px-3 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> {t("set.common.loading")}
            </div>
          ) : (
            <Input
              id={id}
              type={show ? "text" : "password"}
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !disableSave && onSave()}
              className="pr-10 font-mono text-sm"
            />
          )}
          {!loading && (
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        <Button
          onClick={onSave}
          disabled={status === "saving" || loading || !!disableSave}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {status === "saving"
            ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />{t("set.common.saving")}</>
            : status === "saved"
            ? <><CheckCircle className="mr-1.5 h-3.5 w-3.5" />{t("set.common.saved")}</>
            : t("set.common.save")}
        </Button>
        {hasValue && <Button variant="outline" onClick={onClear}>{t("set.common.clear")}</Button>}
        {extra}
      </div>
      <SaveFeedback status={status} error={error} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// useConfigField — encapsulates GET-on-mount + save + clear for a single
// secret config key. Used by forms that manage exactly one key.
// ---------------------------------------------------------------------------

interface ConfigFieldOptions {
  /** The config key name as returned by GET /api/config (e.g. "openaiApiKey"). */
  key: string
  /** The boolean flag returned by GET /api/config indicating whether a value is set. */
  hasKey: string
  /**
   * When true, the current value from GET is pre-populated into the input
   * (masked by the backend). When false (default), the field is left blank
   * so the user must retype to update — prevents saving the masked value back.
   */
  prePopulate?: boolean
}

export interface ConfigFieldState {
  value: string
  hasValue: boolean
  status: SaveStatus
  error: string
  dirty: boolean
  setValue: (v: string) => void
  save: (override?: string) => Promise<void>
  clear: () => void
}

export function useConfigField({ key, hasKey, prePopulate = false }: ConfigFieldOptions): ConfigFieldState {
  const t = useT()
  const [value, setValue] = useState("")
  const [hasValue, setHasValue] = useState(false)
  const [status, setStatus] = useState<SaveStatus>("loading")
  const [error, setError] = useState("")
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    apiFetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setHasValue(!!d[hasKey])
        if (prePopulate && d[hasKey]) setValue(d[key] ?? "")
        setStatus("idle")
      })
      .catch(() => setStatus("idle"))
  }, [key, hasKey, prePopulate])

  async function save(override?: string) {
    const val = override ?? value
    setStatus("saving")
    setError("")
    try {
      const res = await apiFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: val }),
      })
      if (!res.ok) throw new Error()
      setHasValue(!!val.trim())
      setDirty(false)
      setStatus("saved")
      setTimeout(() => setStatus("idle"), 3000)
    } catch {
      setError(t("set.common.couldNotSave"))
      setStatus("error")
    }
  }

  function clear() {
    setValue("")
    setHasValue(false)
    setDirty(false)
    apiFetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: "" }),
    })
  }

  return {
    value,
    hasValue,
    status,
    error,
    dirty,
    setValue: (v) => { setValue(v); setDirty(true) },
    save,
    clear,
  }
}
