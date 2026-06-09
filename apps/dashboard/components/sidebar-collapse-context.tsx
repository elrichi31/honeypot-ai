"use client"

import { createContext, useContext, useEffect, useState } from "react"

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
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem(STORAGE_KEY) === "true"
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed))
  }, [collapsed])

  const value: SidebarCollapseValue = {
    collapsed,
    toggle: () => setCollapsedState((c) => !c),
    setCollapsed: setCollapsedState,
  }

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
