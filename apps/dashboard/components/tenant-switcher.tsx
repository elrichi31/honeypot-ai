"use client"

import { Building2, Globe } from "lucide-react"
import { useTenant } from "@/components/tenant-context"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * Tenant selector for superadmins: switch between "Global" (all clients) and a
 * specific tenant. The choice is stored in a cookie (see TenantProvider) and
 * applies app-wide via server-side scope resolution. Hidden for non-superadmins,
 * who are pinned to their own client.
 *
 * Uses the themed Radix Select (not a native <select>) so the open menu matches
 * the dark dashboard instead of the OS's white dropdown.
 *
 * `collapsed` renders the compact rail variant (icon + tooltip).
 */

// Radix Select forbids an empty-string value, so use a sentinel for "Global".
const GLOBAL = "__global__"

export function TenantSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { isGlobal, tenantId, setTenant, clients } = useTenant()

  if (!isGlobal) return null

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
      <Select
        value={tenantId ?? GLOBAL}
        onValueChange={(v) => setTenant(v === GLOBAL ? null : v)}
      >
        <SelectTrigger size="sm" className="w-full bg-card" aria-label="Tenant scope">
          <span className="flex items-center gap-2 truncate">
            {tenantId ? (
              <Building2 className="h-3.5 w-3.5 shrink-0 text-fuchsia-400" />
            ) : (
              <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={GLOBAL}>Global (todos los tenants)</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
