"use client"

import { apiFetch, assertOk } from "@/lib/client-fetch"

import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { Users, UserPlus, Trash2, Save, X, Eye, EyeOff, ShieldCheck } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useSession } from "@/lib/auth-client"
import { ROLE_LABEL_KEYS, ROLE_COLORS, ROLE_DESCRIPTION_KEYS, hasPermission, isGlobalRole, type Role } from "@/lib/roles-shared"
import { useT } from "@/components/locale-provider"

type User = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: string
  clientId: string | null
  createdAt: string
}

type Me = { id: string; name: string; email: string; role: Role; isSuperadmin?: boolean }

type ClientLite = { id: string; name: string }

// Roles assignable from the UI. `superadmin` is only offered to a superadmin.
// `cliente` is the tenant-scoped role (external customer); the rest are global staff.
const ASSIGNABLE_ROLES: Role[] = ["admin", "analyst", "viewer", "cliente"]

function RoleBadge({ role }: { role: string }) {
  const t = useT()
  const color = ROLE_COLORS[role as Role] ?? "bg-muted text-muted-foreground"
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>
      {ROLE_LABEL_KEYS[role as Role] ? t(ROLE_LABEL_KEYS[role as Role]) : role}
    </span>
  )
}

function CreateUserDialog({
  onClose,
  onCreated,
  clients,
  canSuperadmin,
}: {
  onClose: () => void
  onCreated: () => void
  clients: ClientLite[]
  canSuperadmin: boolean
}) {
  const t = useT()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<Role>("analyst")
  const [clientId, setClientId] = useState<string>("")   // "" = global / unscoped
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const roleOptions: Role[] = canSuperadmin ? ["superadmin", ...ASSIGNABLE_ROLES] : ASSIGNABLE_ROLES

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await assertOk(await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only `cliente` is tenant-scoped; every staff role is global (no tenant).
        body: JSON.stringify({ name, email, password, role, clientId: role === "cliente" ? (clientId || null) : null }),
      }), t("users.create.error"))
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("users.create.netError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("users.create.title")}</DialogTitle>
            <DialogDescription>{t("users.create.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="user-name">{t("users.create.name")}</Label>
            <Input id="user-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Full name" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-email">{t("users.create.email")}</Label>
            <Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="user@company.com" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-password">{t("users.create.password")}</Label>
            <div className="relative">
              <Input id="user-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={8} placeholder={t("users.create.passwordHint")} className="pr-10" />
              <button type="button" onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("users.create.role")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {roleOptions.map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    role === r
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-accent/50"
                  }`}>
                  <div className={`text-xs font-medium ${role === r ? "text-primary-foreground" : "text-foreground"}`}>
                    {t(ROLE_LABEL_KEYS[r])}
                  </div>
                  <div className={`text-[10px] leading-tight mt-0.5 ${role === r ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {t(ROLE_DESCRIPTION_KEYS[r])}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Tenant — only `cliente` is scoped to a client; staff roles are global. */}
          {role === "cliente" && (
            <div className="space-y-2">
              <Label htmlFor="user-tenant">{t("users.create.tenant")}</Label>
              <select
                id="user-tenant"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">{canSuperadmin ? t("users.tenant.unassigned") : t("users.tenant.select")}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">{t("users.create.tenantHint")}</p>
            </div>
          )}

          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              <X className="h-4 w-4" />
              {t("users.create.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              <Save className="h-4 w-4" />
              {loading ? t("users.create.creating") : t("users.create.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteConfirmDialog({ user, onClose, onDeleted }: { user: User; onClose: () => void; onDeleted: () => void }) {
  const t = useT()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleDelete() {
    setLoading(true)
    setError("")
    try {
      await assertOk(await apiFetch(`/api/users/${user.id}`, { method: "DELETE" }), t("users.delete.error"))
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("users.delete.netError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("users.page.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("users.delete.descPrefix")}
            <span className="font-medium text-foreground">{user.name}</span> ({user.email})
            {t("users.delete.descSuffix")}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t("users.delete.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading} className="gap-2">
            <Trash2 className="h-4 w-4" />
            {loading ? t("users.delete.deleting") : t("users.delete.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function UsersPage() {
  const t = useT()
  const { data: session } = useSession()
  const [users, setUsers] = useState<User[]>([])
  const [me, setMe] = useState<Me | null>(null)
  const [clients, setClients] = useState<ClientLite[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [changingRole, setChangingRole] = useState<string | null>(null)

  async function fetchAll() {
    setLoading(true)
    try {
      const [usersRes, meRes, clientsRes] = await Promise.all([
        apiFetch("/api/users"),
        apiFetch("/api/me"),
        apiFetch("/api/clients"),
      ])
      if (usersRes.ok) setUsers(await usersRes.json())
      if (meRes.ok) setMe(await meRes.json())
      if (clientsRes.ok) {
        const rows: Array<{ id: string; name: string }> = await clientsRes.json()
        setClients(rows.map((c) => ({ id: c.id, name: c.name })))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  // admin-level (admin or superadmin) — use hasPermission so any role at/above
  // admin in ROLE_ORDER qualifies, instead of a brittle hand-written list.
  const isAdmin = me ? hasPermission(me.role, "admin") : false
  const canSuperadmin = me?.role === "superadmin"
  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? "—" : "Global")

  async function handleRoleChange(userId: string, newRole: Role) {
    setChangingRole(userId)
    try {
      await apiFetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      })
      await fetchAll()
    } finally {
      setChangingRole(null)
    }
  }

  async function handleTenantChange(userId: string, newClientId: string) {
    setChangingRole(userId)
    try {
      await apiFetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: newClientId || null }),
      })
      await fetchAll()
    } finally {
      setChangingRole(null)
    }
  }

  return (
    <PageShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("users.page.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("users.page.description")}</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <UserPlus className="h-4 w-4" />
            {t("users.page.createButton")}
          </button>
        )}
      </div>

      {/* Role legend */}
      <div className="mb-6 flex flex-wrap items-start gap-3">
        {(canSuperadmin ? (["superadmin", ...ASSIGNABLE_ROLES] as Role[]) : ASSIGNABLE_ROLES).map((r) => (
          <Surface key={r} className="flex items-center gap-2 px-4 py-3">
            <RoleBadge role={r} />
            <span className="text-xs text-muted-foreground">{t(ROLE_DESCRIPTION_KEYS[r])}</span>
          </Surface>
        ))}
      </div>

      <Surface className="overflow-hidden">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">{t("users.page.loading")}</div>
        ) : users.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">{t("users.page.empty")}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tenant</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Registered</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => {
                const isCurrentUser = user.id === (me?.id ?? session?.user?.id)
                const isBusy = changingRole === user.id
                return (
                  <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        {user.name}
                        {isCurrentUser && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">you</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{user.email}</td>
                    <td className="px-4 py-3">
                      {isAdmin && !isCurrentUser ? (
                        <select
                          value={user.role}
                          disabled={isBusy}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as Role)}
                          className="rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                        >
                          {(canSuperadmin ? (["superadmin", ...ASSIGNABLE_ROLES] as Role[]) : ASSIGNABLE_ROLES).map((r) => (
                            <option key={r} value={r}>{t(ROLE_LABEL_KEYS[r])}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <RoleBadge role={user.role} />
                          {isCurrentUser && (user.role === "admin" || user.role === "superadmin") && (
                            <ShieldCheck className="h-3.5 w-3.5 text-rose-400" />
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin && !isCurrentUser && user.role === "cliente" ? (
                        <select
                          value={user.clientId ?? ""}
                          disabled={isBusy}
                          onChange={(e) => handleTenantChange(user.id, e.target.value)}
                          className="rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                        >
                          <option value="">{t("users.tenant.select")}</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{isGlobalRole(user.role as Role) ? "Global" : clientName(user.clientId)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true, locale: es })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && !isCurrentUser && (
                        <button onClick={() => setDeleteTarget(user)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title={t("users.page.deleteTitle")} aria-label={t("users.page.deleteTitle")}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Surface>

      {!isAdmin && !loading && (
        <p className="mt-4 text-xs text-muted-foreground text-center">
          {t("users.page.adminOnlyHint")}
        </p>
      )}

      {showCreate && (
        <CreateUserDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchAll() }}
          clients={clients}
          canSuperadmin={canSuperadmin}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog user={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => { setDeleteTarget(null); fetchAll() }} />
      )}
    </PageShell>
  )
}
