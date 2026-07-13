"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

const STORAGE_KEY = "sidebar_collapsed"

type SidebarCollapseValue = {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (value: boolean) => void
}

const SidebarCollapseContext = createContext<SidebarCollapseValue | null>(null)

/**
 * Shares the sidebar's collapsed/expanded state between the sidebar itself and
 * the layout (which offsets the main content by the sidebar's current width).
 * Persisted to localStorage so the choice survives reloads. Initialised
 * synchronously from storage to avoid a flash of the wrong width on mount.
 */
export function SidebarCollapseProvider({ children }: { children: React.ReactNode }) {
  // Start false on server AND client so the first client render matches the
  // server HTML (no hydration #418). The stored preference is applied in an
  // effect right after mount.
  const [collapsed, setCollapsedState] = useState<boolean>(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setCollapsedState(localStorage.getItem(STORAGE_KEY) === "true")
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, String(collapsed))
  }, [collapsed, hydrated])

  const toggle = useCallback(() => setCollapsedState((c) => !c), [])
  const value = useMemo<SidebarCollapseValue>(
    () => ({ collapsed, toggle, setCollapsed: setCollapsedState }),
    [collapsed, toggle],
  )

  return (
    <SidebarCollapseContext.Provider value={value}>
      {children}
    </SidebarCollapseContext.Provider>
  )
}

export function useSidebarCollapse(): SidebarCollapseValue {
  const ctx = useContext(SidebarCollapseContext)
  if (!ctx) {
    // Safe fallback so the sidebar/layout still render if used outside a provider.
    return { collapsed: false, toggle: () => {}, setCollapsed: () => {} }
  }
  return ctx
}
