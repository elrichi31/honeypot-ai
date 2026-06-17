"use client"

import { Building2, Globe } from "lucide-react"
import { useTenant } from "@/components/tenant-context"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * Tenant selector for superadmins: switch between "Global" (all clients) and a
 * specific tenant. The choice is stored in a cookie (see TenantProvider) and
 * applies app-wide via server-side scope resolution. Hidden for non-superadmins,
 * who are pinned to their own client.
 *
 * `collapsed` renders the compact rail variant (icon + tooltip).
 */
export function TenantSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { isSuperadmin, tenantId, setTenant, clients } = useTenant()

  if (!isSuperadmin) return null

  const activeName = tenantId ? clients.find((c) => c.id === tenantId)?.name ?? "Tenant" : "Global"

  if (collapsed) {
    return (
      <div className="flex justify-center border-b border-border px-2 py-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
              {tenantId ? <Building2 className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">Tenant: {activeName}</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="border-b border-border px-3 py-2">
      <div className="relative flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
        {tenantId ? (
          <Building2 className="h-3.5 w-3.5 shrink-0 text-fuchsia-400" />
        ) : (
          <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <select
          value={tenantId ?? ""}
          onChange={(e) => setTenant(e.target.value || null)}
          className="w-full bg-transparent text-xs text-foreground focus:outline-none"
          title="Scope global por tenant (superadmin)"
        >
          <option value="">Global (todos los tenants)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
