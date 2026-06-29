"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Settings, Shield, Mail, User as UserIcon } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useSession } from "@/lib/auth-client"
import { ROLE_LABEL_KEYS, type Role } from "@/lib/roles-shared"
import { useT } from "@/components/locale-provider"

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
  const t = useT()
  const { data: session } = useSession()
  const user = session?.user
  const [role, setRole] = useState<Role | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/me")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => { if (!cancelled && data?.role) setRole(data.role as Role) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account and SOC access</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <Surface className="flex items-center gap-4 p-5">
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
                {ROLE_LABEL_KEYS[role] ? t(ROLE_LABEL_KEYS[role]) : role}
              </span>
            )}
          </div>
        </Surface>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field icon={UserIcon} label="Name" value={user?.name ?? "—"} />
          <Field icon={Mail} label="Email" value={user?.email ?? "—"} />
          <Field icon={Shield} label="Role" value={role ? (ROLE_LABEL_KEYS[role] ? t(ROLE_LABEL_KEYS[role]) : role) : "—"} />
        </div>

        <Surface padded>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Account preferences</p>
              <p className="text-xs text-muted-foreground">Configure the platform and integrations from Settings.</p>
            </div>
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </div>
        </Surface>
      </div>
    </PageShell>
  )
}
