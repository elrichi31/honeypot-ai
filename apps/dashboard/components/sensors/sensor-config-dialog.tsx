"use client"

import { apiFetch, assertOk } from "@/lib/client-fetch"

import { useCallback, useEffect, useRef, useState } from "react"
import { Save, X, RotateCcw, Plus, Loader2, CheckCircle2, XCircle, Clock, History, Undo2 } from "lucide-react"
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
import type { TranslationKey } from "@/lib/i18n/dictionaries"
import { useLiveStream } from "@/hooks/use-live-stream"
import { useViewer, canActOnSensor } from "@/hooks/use-viewer"

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

export interface WebHoneypotConfig {
  server_header: string
  powered_by_header: string
  log_level: "DEBUG" | "INFO" | "WARNING" | "ERROR"
}

const WEB_DEFAULTS: WebHoneypotConfig = {
  server_header: "Apache/2.4.57 (Ubuntu)",
  powered_by_header: "PHP/8.1.2-1ubuntu2.14",
  log_level: "INFO",
}

export interface PortConfig {
  panel_title: string
  panel_org: string
}

const PORT_DEFAULTS: PortConfig = {
  panel_title: "Operations Dashboard",
  panel_org: "Corp Internal Dashboard",
}

export interface SmbConfig {
  share_name: string
  share_comment: string
  server_name: string
  server_os: string
  server_domain: string
}

const SMB_DEFAULTS: SmbConfig = {
  share_name: "ADMIN$",
  share_comment: "Corp Remote Admin",
  server_name: "FS-TECHCORP-01",
  server_os: "Windows Server 2022 Standard",
  server_domain: "TECHCORP",
}

export interface FtpConfig {
  banner: string
}

const FTP_DEFAULTS: FtpConfig = {
  banner: "220 (vsFTPd 3.0.5)",
}

export interface MysqlConfig {
  server_version: string
}

const MYSQL_DEFAULTS: MysqlConfig = {
  server_version: "5.7.44-log",
}

type SensorConfig = CowrieConfig | WebHoneypotConfig | PortConfig | SmbConfig | FtpConfig | MysqlConfig

const DEFAULTS_BY_PROTOCOL: Record<string, SensorConfig> = {
  http: WEB_DEFAULTS,
  "port-scan": PORT_DEFAULTS,
  smb: SMB_DEFAULTS,
  ftp: FTP_DEFAULTS,
  mysql: MYSQL_DEFAULTS,
}

// port-scan/smb/ftp/mysql apply by restarting the sensor process
// (config.apply + os._exit, Docker's restart policy relaunches it) rather
// than web-honeypot's in-memory hot-apply — hence the distinct description
// copy per protocol below.
const TITLE_KEY_BY_PROTOCOL: Record<string, TranslationKey> = {
  http: "sensors.config.title.web",
  "port-scan": "sensors.config.title.port",
  smb: "sensors.config.title.smb",
  ftp: "sensors.config.title.ftp",
  mysql: "sensors.config.title.mysql",
}

const DESCRIPTION_KEY_BY_PROTOCOL: Record<string, TranslationKey> = {
  http: "sensors.config.description.web",
  "port-scan": "sensors.config.description.restart",
  smb: "sensors.config.description.restart",
  ftp: "sensors.config.description.restart",
  mysql: "sensors.config.description.restart",
}

function defaultsFor(protocol: string): SensorConfig {
  return DEFAULTS_BY_PROTOCOL[protocol] ?? DEFAULTS
}

type ConfigVersion = {
  id: string
  configHash: string
  status: "pending" | "applied" | "failed" | "rolled_back"
  createdBy: string
  appliedAt: string | null
}

const VERSION_STATUS_COLOR: Record<ConfigVersion["status"], string> = {
  applied: "text-emerald-400",
  pending: "text-amber-400",
  failed: "text-red-400",
  rolled_back: "text-muted-foreground",
}

// Mirrors sensor_command_state.ts's non-terminal states for config.apply,
// bucketed to what's worth telling the operator. "idle" is pre-save/closed.
type ApplyPhase = "idle" | "pending" | "succeeded" | "failed" | "expired"

const PENDING_LABEL_KEY: Record<string, TranslationKey> = {
  queued: "sensors.config.apply.queued",
  sent: "sensors.config.apply.sent",
  acked: "sensors.config.apply.acked",
  running: "sensors.config.apply.running",
}

function ApplyStatusNotice({ phase, pendingStatus, error }: { phase: ApplyPhase; pendingStatus: string; error: string }) {
  const t = useT()
  if (phase === "idle") return null

  if (phase === "pending") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-400">
        <Loader2 className="h-3.5 w-3.5 mt-0.5 shrink-0 animate-spin" />
        <span>{t(PENDING_LABEL_KEY[pendingStatus] ?? "sensors.config.apply.queued")}</span>
      </div>
    )
  }
  if (phase === "succeeded") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>{t("sensors.config.apply.succeeded")}</span>
      </div>
    )
  }
  if (phase === "expired") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
        <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>{t("sensors.config.apply.expired")}</span>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
      <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>{t("sensors.config.apply.failed", { error: error || t("sensors.config.saveError") })}</span>
    </div>
  )
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

function CowrieConfigFields({
  cfg,
  set,
  t,
}: {
  cfg: CowrieConfig
  set: (key: keyof CowrieConfig, value: CowrieConfig[keyof CowrieConfig]) => void
  t: ReturnType<typeof useT>
}) {
  return (
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
    </>
  )
}

function WebHoneypotConfigFields({
  cfg,
  set,
  t,
}: {
  cfg: WebHoneypotConfig
  set: (key: keyof WebHoneypotConfig, value: WebHoneypotConfig[keyof WebHoneypotConfig]) => void
  t: ReturnType<typeof useT>
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sensors.config.section.serverBanner")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("sensors.config.field.serverHeader")} hint={t("sensors.config.field.serverHeader.hint")}>
          <Input
            value={cfg.server_header}
            onChange={(e) => set("server_header", e.target.value)}
            placeholder="Apache/2.4.57 (Ubuntu)"
            className="font-mono text-sm"
          />
        </Field>
        <Field label={t("sensors.config.field.poweredByHeader")} hint={t("sensors.config.field.poweredByHeader.hint")}>
          <Input
            value={cfg.powered_by_header}
            onChange={(e) => set("powered_by_header", e.target.value)}
            placeholder="PHP/8.1.2-1ubuntu2.14"
            className="font-mono text-sm"
          />
        </Field>
      </div>
      <Field label={t("sensors.config.field.logLevel")} hint={t("sensors.config.field.logLevel.hint")}>
        <select
          value={cfg.log_level}
          onChange={(e) => set("log_level", e.target.value as WebHoneypotConfig["log_level"])}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARNING">WARNING</option>
          <option value="ERROR">ERROR</option>
        </select>
      </Field>
    </div>
  )
}

function PortConfigFields({
  cfg,
  set,
  t,
}: {
  cfg: PortConfig
  set: (key: keyof PortConfig, value: PortConfig[keyof PortConfig]) => void
  t: ReturnType<typeof useT>
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sensors.config.section.httpPanel")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("sensors.config.field.panelTitle")} hint={t("sensors.config.field.panelTitle.hint")}>
          <Input
            value={cfg.panel_title}
            onChange={(e) => set("panel_title", e.target.value)}
            placeholder="Operations Dashboard"
            className="font-mono text-sm"
          />
        </Field>
        <Field label={t("sensors.config.field.panelOrg")} hint={t("sensors.config.field.panelOrg.hint")}>
          <Input
            value={cfg.panel_org}
            onChange={(e) => set("panel_org", e.target.value)}
            placeholder="Corp Internal Dashboard"
            className="font-mono text-sm"
          />
        </Field>
      </div>
    </div>
  )
}

function SmbConfigFields({
  cfg,
  set,
  t,
}: {
  cfg: SmbConfig
  set: (key: keyof SmbConfig, value: SmbConfig[keyof SmbConfig]) => void
  t: ReturnType<typeof useT>
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sensors.config.section.smbIdentity")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("sensors.config.field.shareName")} hint={t("sensors.config.field.shareName.hint")}>
          <Input value={cfg.share_name} onChange={(e) => set("share_name", e.target.value)} placeholder="ADMIN$" className="font-mono text-sm" />
        </Field>
        <Field label={t("sensors.config.field.shareComment")} hint={t("sensors.config.field.shareComment.hint")}>
          <Input value={cfg.share_comment} onChange={(e) => set("share_comment", e.target.value)} placeholder="Corp Remote Admin" className="font-mono text-sm" />
        </Field>
        <Field label={t("sensors.config.field.serverName")} hint={t("sensors.config.field.serverName.hint")}>
          <Input value={cfg.server_name} onChange={(e) => set("server_name", e.target.value)} placeholder="FS-TECHCORP-01" className="font-mono text-sm" />
        </Field>
        <Field label={t("sensors.config.field.serverOs")} hint={t("sensors.config.field.serverOs.hint")}>
          <Input value={cfg.server_os} onChange={(e) => set("server_os", e.target.value)} placeholder="Windows Server 2022 Standard" className="font-mono text-sm" />
        </Field>
        <Field label={t("sensors.config.field.serverDomain")} hint={t("sensors.config.field.serverDomain.hint")}>
          <Input value={cfg.server_domain} onChange={(e) => set("server_domain", e.target.value)} placeholder="TECHCORP" className="font-mono text-sm" />
        </Field>
      </div>
    </div>
  )
}

function FtpConfigFields({
  cfg,
  set,
  t,
}: {
  cfg: FtpConfig
  set: (key: keyof FtpConfig, value: FtpConfig[keyof FtpConfig]) => void
  t: ReturnType<typeof useT>
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sensors.config.section.ftpBanner")}</p>
      <Field label={t("sensors.config.field.ftpBanner")} hint={t("sensors.config.field.ftpBanner.hint")}>
        <Input
          value={cfg.banner}
          onChange={(e) => set("banner", e.target.value)}
          placeholder="220 (vsFTPd 3.0.5)"
          className="font-mono text-sm"
        />
      </Field>
    </div>
  )
}

function MysqlConfigFields({
  cfg,
  set,
  t,
}: {
  cfg: MysqlConfig
  set: (key: keyof MysqlConfig, value: MysqlConfig[keyof MysqlConfig]) => void
  t: ReturnType<typeof useT>
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sensors.config.section.mysqlVersion")}</p>
      <Field label={t("sensors.config.field.serverVersion")} hint={t("sensors.config.field.serverVersion.hint")}>
        <Input
          value={cfg.server_version}
          onChange={(e) => set("server_version", e.target.value)}
          placeholder="5.7.44-log"
          className="font-mono text-sm"
        />
      </Field>
    </div>
  )
}

export function SensorConfigDialog({
  sensorId,
  sensorClientId,
  protocol,
  open,
  onClose,
}: {
  sensorId: string
  sensorClientId?: string | null
  protocol: string
  open: boolean
  onClose: () => void
}) {
  const t = useT()
  const viewer = useViewer()
  const canRollback = canActOnSensor(viewer, "admin", sensorClientId)
  const [cfg, setCfg] = useState<SensorConfig>(defaultsFor(protocol))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [applyPhase, setApplyPhase] = useState<ApplyPhase>("idle")
  const [applyPendingStatus, setApplyPendingStatus] = useState("queued")
  const [applyError, setApplyError] = useState("")
  const pendingHashRef = useRef<string | null>(null)

  const [versions, setVersions] = useState<ConfigVersion[]>([])
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)
  const [rollbackError, setRollbackError] = useState("")

  const fetchVersions = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/sensors/${encodeURIComponent(sensorId)}/config/versions`, { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json() as { versions: ConfigVersion[] }
      setVersions(data.versions)
    } catch { /* non-critical, dialog still works without history */ }
  }, [sensorId])

  const checkApplyStatus = useCallback(async () => {
    const hash = pendingHashRef.current
    if (!hash) return
    try {
      const res = await apiFetch(`/api/sensors/${encodeURIComponent(sensorId)}/commands?limit=5`, { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json() as {
        commands: Array<{ status: string; action: string; payload: { configHash?: string }; error: { message: string } | null }>
      }
      const match = data.commands.find((c) => c.action === "config.apply" && c.payload?.configHash === hash)
      if (!match) return

      if (match.status === "succeeded") {
        setApplyPhase("succeeded"); pendingHashRef.current = null; fetchVersions()
      } else if (match.status === "failed") {
        setApplyPhase("failed"); setApplyError(match.error?.message ?? ""); pendingHashRef.current = null
      } else if (match.status === "expired" || match.status === "cancelled") {
        setApplyPhase("expired"); pendingHashRef.current = null
      } else {
        setApplyPhase("pending"); setApplyPendingStatus(match.status)
      }
    } catch { /* next SSE event or poll tick will retry */ }
  }, [sensorId, fetchVersions])

  // SSE gives near-instant updates; the poll is the fallback that also
  // catches TTL expiry, which the server never announces over SSE (see
  // sensor-control.repository.ts expireQueued — it just writes the row).
  useLiveStream({
    onCommandLifecycle: (event) => {
      if (event.sensorId !== sensorId || !pendingHashRef.current) return
      checkApplyStatus()
    },
  })

  useEffect(() => {
    if (applyPhase !== "pending") return
    const id = setInterval(checkApplyStatus, 5000)
    return () => clearInterval(id)
  }, [applyPhase, checkApplyStatus])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError("")
    setApplyPhase("idle")
    pendingHashRef.current = null
    setRollbackError("")
    fetchVersions()
    const defaults = defaultsFor(protocol)
    apiFetch(`/api/sensors/${encodeURIComponent(sensorId)}/config`, { cache: "no-store" })
      .then((r) => assertOk(r))
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data?.config) setCfg({ ...defaults, ...data.config })
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError(t("sensors.config.loadError"))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, sensorId, protocol, fetchVersions])

  // Loosely typed on purpose: cfg is a union of two unrelated shapes
  // (CowrieConfig | WebHoneypotConfig) with no shared keys, and each
  // protocol's field group below passes its own precisely-typed key/value —
  // a function accepting (string, unknown) is safely assignable there.
  function set(key: string, value: unknown) {
    setCfg((prev) => ({ ...prev, [key]: value }))
    setApplyPhase("idle")
    pendingHashRef.current = null
  }

  async function handleRollback() {
    setRollingBack(true)
    setRollbackError("")
    try {
      const res = await assertOk(await apiFetch(`/api/sensors/${encodeURIComponent(sensorId)}/config/rollback`, {
        method: "POST",
      }), t("sensors.config.rollback.error"))
      const { version } = await res.json() as { version: { configHash: string } }
      pendingHashRef.current = version.configHash
      setApplyPhase("pending")
      setApplyPendingStatus("queued")
      checkApplyStatus()
    } catch (err) {
      setRollbackError(err instanceof Error ? err.message : t("sensors.config.rollback.error"))
    } finally {
      setRollingBack(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    try {
      const res = await assertOk(await apiFetch(`/api/sensors/${encodeURIComponent(sensorId)}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      }), t("sensors.config.saveError"))
      const { configHash } = await res.json() as { configHash: string }
      pendingHashRef.current = configHash
      setApplyPhase("pending")
      setApplyPendingStatus("queued")
      checkApplyStatus()
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
            <DialogTitle>{t(TITLE_KEY_BY_PROTOCOL[protocol] ?? "sensors.config.title")}</DialogTitle>
            <DialogDescription>
              {t(DESCRIPTION_KEY_BY_PROTOCOL[protocol] ?? "sensors.config.description")}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("sensors.config.loading")}</div>
          ) : (
            <>
              {protocol === "http" ? (
                <WebHoneypotConfigFields cfg={cfg as WebHoneypotConfig} set={set} t={t} />
              ) : protocol === "port-scan" ? (
                <PortConfigFields cfg={cfg as PortConfig} set={set} t={t} />
              ) : protocol === "smb" ? (
                <SmbConfigFields cfg={cfg as SmbConfig} set={set} t={t} />
              ) : protocol === "ftp" ? (
                <FtpConfigFields cfg={cfg as FtpConfig} set={set} t={t} />
              ) : protocol === "mysql" ? (
                <MysqlConfigFields cfg={cfg as MysqlConfig} set={set} t={t} />
              ) : (
                <CowrieConfigFields cfg={cfg as CowrieConfig} set={set} t={t} />
              )}

              <ApplyStatusNotice phase={applyPhase} pendingStatus={applyPendingStatus} error={applyError} />

              {versions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setVersionsOpen((o) => !o)}
                      className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      <History className="h-3 w-3" />
                      {t("sensors.config.versions.title")}
                    </button>
                    {canRollback && (
                      <button
                        type="button"
                        onClick={handleRollback}
                        disabled={rollingBack || applyPhase === "pending" || !versions.some((v) => v.status === "applied")}
                        className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {rollingBack ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                        {t("sensors.config.versions.rollback")}
                      </button>
                    )}
                  </div>
                  {rollbackError && <p className="text-[11px] text-red-400">{rollbackError}</p>}
                  {versionsOpen && (
                    <ul className="space-y-1 rounded-md border border-border/50 bg-muted/10 p-2">
                      {versions.map((v) => (
                        <li key={v.id} className="flex items-center justify-between gap-2 text-[11px] font-mono">
                          <span className="text-muted-foreground truncate">{v.configHash.slice(0, 12)} · {v.createdBy}</span>
                          <span className={VERSION_STATUS_COLOR[v.status]}>{v.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
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
              onClick={() => { setCfg(defaultsFor(protocol)); setApplyPhase("idle"); pendingHashRef.current = null }}
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
