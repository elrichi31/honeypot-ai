"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export const TENANT_COOKIE = "tenant_scope"

export type ClientLite = { id: string; name: string }

type TenantContextValue = {
  isSuperadmin: boolean
  tenantId: string | null           // null = global (all clients)
  setTenant: (id: string | null) => void
  clients: ClientLite[]
}

const TenantContext = createContext<TenantContextValue | null>(null)

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * Holds the superadmin's active tenant selection. Persisted in a cookie so the
 * server (route handlers / server components) sees the same scope. Non-superadmin
 * users get no selection (they're pinned to their own client server-side), so the
 * switcher never renders for them.
 *
 * Changing the tenant writes the cookie and calls router.refresh() so Server
 * Components re-render with the new scope.
 */
export function TenantProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [clients, setClients] = useState<ClientLite[]>([])
  // Start null on BOTH server and client to avoid a hydration mismatch (the
  // server can't read document.cookie). The real value is read in useEffect.
  const [tenantId, setTenantId] = useState<string | null>(null)

  useEffect(() => {
    const fromCookie = readCookie(TENANT_COOKIE)
    if (fromCookie) setTenantId(fromCookie)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (me: { isSuperadmin?: boolean } | null) => {
        if (cancelled || !me?.isSuperadmin) return
        setIsSuperadmin(true)
        const res = await fetch("/api/clients")
        const rows: Array<{ id: string; name: string }> = res.ok ? await res.json() : []
        if (!cancelled) setClients(rows.map((c) => ({ id: c.id, name: c.name })))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const setTenant = useCallback((id: string | null) => {
    setTenantId(id)
    if (typeof document !== "undefined") {
      if (id) {
        document.cookie = `${TENANT_COOKIE}=${encodeURIComponent(id)};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`
      } else {
        document.cookie = `${TENANT_COOKIE}=;path=/;max-age=0;samesite=lax`
      }
    }
    router.refresh()
  }, [router])

  return (
    <TenantContext.Provider value={{ isSuperadmin, tenantId, setTenant, clients }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext)
  if (!ctx) return { isSuperadmin: false, tenantId: null, setTenant: () => {}, clients: [] }
  return ctx
}
