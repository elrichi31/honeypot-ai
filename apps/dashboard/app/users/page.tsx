"use client"

import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { Users, UserPlus, Trash2, X, Eye, EyeOff, ShieldCheck } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { useSession } from "@/lib/auth-client"
import { ROLE_LABELS, ROLE_COLORS, ROLE_DESCRIPTIONS, type Role } from "@/lib/roles-shared"

type User = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: string
  createdAt: string
}

type Me = { id: string; name: string; email: string; role: Role }

const ROLES: Role[] = ["admin", "analyst", "viewer"]

function RoleBadge({ role }: { role: string }) {
  const color = ROLE_COLORS[role as Role] ?? "bg-muted text-muted-foreground"
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>
      {ROLE_LABELS[role as Role] ?? role}
    </span>
  )
}

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<Role>("analyst")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Error al crear usuario"); return }
      onCreated()
    } catch {
      setError("Error de red al crear usuario")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Crear usuario</h2>
            <p className="text-sm text-muted-foreground">El usuario podrá acceder al dashboard con estas credenciales.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Nombre</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nombre completo"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="usuario@empresa.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Contraseña</label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={8} placeholder="Mínimo 8 caracteres"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring" />
              <button type="button" onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Rol</label>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    role === r
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-accent/50"
                  }`}>
                  <div className={`text-xs font-medium ${role === r ? "text-primary-foreground" : "text-foreground"}`}>
                    {ROLE_LABELS[r]}
                  </div>
                  <div className={`text-[10px] leading-tight mt-0.5 ${role === r ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {ROLE_DESCRIPTIONS[r]}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {loading ? "Creando..." : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DeleteConfirmDialog({ user, onClose, onDeleted }: { user: User; onClose: () => void; onDeleted: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleDelete() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" })
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error ?? "Error al eliminar"); return }
      onDeleted()
    } catch {
      setError("Error de red al eliminar usuario")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Eliminar usuario</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-2 text-sm text-muted-foreground">
          ¿Eliminar a <span className="font-medium text-foreground">{user.name}</span> ({user.email})?
        </p>
        <p className="mb-5 text-xs text-muted-foreground">Esta acción no se puede deshacer. Se cierran todas sus sesiones activas.</p>
        {error && <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            Cancelar
          </button>
          <button onClick={handleDelete} disabled={loading}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60">
            {loading ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UsersPage() {
  const { data: session } = useSession()
  const [users, setUsers] = useState<User[]>([])
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [changingRole, setChangingRole] = useState<string | null>(null)

  async function fetchAll() {
    setLoading(true)
    try {
      const [usersRes, meRes] = await Promise.all([fetch("/api/users"), fetch("/api/me")])
      if (usersRes.ok) setUsers(await usersRes.json())
      if (meRes.ok) setMe(await meRes.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const isAdmin = me?.role === "admin"

  async function handleRoleChange(userId: string, newRole: Role) {
    setChangingRole(userId)
    try {
      await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
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
          <h1 className="text-2xl font-semibold text-foreground">Usuarios</h1>
          <p className="text-sm text-muted-foreground">Gestiona quién tiene acceso al dashboard y con qué permisos.</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <UserPlus className="h-4 w-4" />
            Crear usuario
          </button>
        )}
      </div>

      {/* Role legend */}
      <div className="mb-6 flex flex-wrap items-start gap-3">
        {ROLES.map((r) => (
          <div key={r} className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
            <RoleBadge role={r} />
            <span className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</span>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">Cargando usuarios...</div>
        ) : users.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No hay usuarios</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Rol</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Registrado</th>
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
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">tú</span>
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
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <RoleBadge role={user.role} />
                          {isCurrentUser && user.role === "admin" && (
                            <ShieldCheck className="h-3.5 w-3.5 text-rose-400" />
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true, locale: es })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && !isCurrentUser && (
                        <button onClick={() => setDeleteTarget(user)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Eliminar usuario">
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
      </div>

      {!isAdmin && !loading && (
        <p className="mt-4 text-xs text-muted-foreground text-center">
          Solo los administradores pueden crear, eliminar o cambiar roles de usuarios.
        </p>
      )}

      {showCreate && (
        <CreateUserDialog onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchAll() }} />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog user={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => { setDeleteTarget(null); fetchAll() }} />
      )}
    </PageShell>
  )
}
