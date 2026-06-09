"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Settings, Shield, Mail, User as UserIcon } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useSession } from "@/lib/auth-client"
import { ROLE_LABELS, type Role } from "@/lib/roles-shared"

function initialsOf(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "?"
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function Field({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/60">{label}</p>
        <p className="truncate text-sm text-foreground">{value}</p>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { data: session } = useSession()
  const user = session?.user
  const [role, setRole] = useState<Role | null>(null)

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.role) setRole(data.role as Role)
      })
      .catch(() => {})
  }, [])

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Perfil</h1>
        <p className="text-sm text-muted-foreground">Tu cuenta y acceso al SOC</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
          <Avatar className="h-16 w-16">
            {user?.image ? <AvatarImage src={user.image} alt={user.name ?? "User"} /> : null}
            <AvatarFallback className="bg-sidebar-accent text-lg text-sidebar-foreground">
              {initialsOf(user?.name, user?.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-foreground">{user?.name ?? "—"}</p>
            <p className="truncate text-sm text-muted-foreground">{user?.email ?? ""}</p>
            {role && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-border bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                <Shield className="h-3 w-3" />
                {ROLE_LABELS[role] ?? role}
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field icon={UserIcon} label="Nombre" value={user?.name ?? "—"} />
          <Field icon={Mail} label="Email" value={user?.email ?? "—"} />
          <Field icon={Shield} label="Rol" value={role ? (ROLE_LABELS[role] ?? role) : "—"} />
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Preferencias de la cuenta</p>
              <p className="text-xs text-muted-foreground">Configura la plataforma y las integraciones desde Settings.</p>
            </div>
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
