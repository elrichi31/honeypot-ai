"use client"

import { createContext, useCallback, useContext, useTransition, type ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

interface NavTransitionContextValue {
  /** True while a navigation triggered through this provider is in flight. */
  isPending: boolean
  /**
   * Merge `updates` into the current query string and navigate, inside a
   * transition. Keys listed in `remove` are deleted from the query string.
   */
  pushParams: (updates: Record<string, string>, remove?: string[]) => void
  /** Navigate to an arbitrary href inside a transition. */
  push: (href: string) => void
}

const NavTransitionContext = createContext<NavTransitionContextValue | null>(null)

/**
 * Wraps router navigation in a React transition so callers can render a loading
 * state (`isPending`) while the server component for the next URL is fetched.
 *
 * Without this, `router.push()` from a client component blocks silently: Next's
 * route-level `loading.tsx` only shows on initial segment navigation, not on
 * same-page query-param changes (tabs, filters, pagination).
 */
export function NavTransitionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const pushParams = useCallback(
    (updates: Record<string, string>, remove?: string[]) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) next.set(key, value)
      for (const key of remove ?? []) next.delete(key)
      const url = `${pathname}?${next.toString()}`
      startTransition(() => router.push(url))
    },
    [pathname, router, searchParams],
  )

  const push = useCallback(
    (href: string) => {
      startTransition(() => router.push(href))
    },
    [router],
  )

  return (
    <NavTransitionContext.Provider value={{ isPending, pushParams, push }}>
      {children}
    </NavTransitionContext.Provider>
  )
}

export function useNavTransition(): NavTransitionContextValue {
  const ctx = useContext(NavTransitionContext)
  if (!ctx) {
    throw new Error("useNavTransition must be used within a NavTransitionProvider")
  }
  return ctx
}

/**
 * Like {@link useNavTransition} but falls back to a plain router-based
 * implementation when no provider is present, so shared components
 * (TablePagination, TableShell) work on pages that haven't opted in.
 */
export function useNavTransitionOptional(): NavTransitionContextValue {
  const ctx = useContext(NavTransitionContext)
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const pushParams = useCallback(
    (updates: Record<string, string>, remove?: string[]) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) next.set(key, value)
      for (const key of remove ?? []) next.delete(key)
      const url = `${pathname}?${next.toString()}`
      startTransition(() => router.push(url))
    },
    [pathname, router, searchParams],
  )

  const push = useCallback(
    (href: string) => {
      startTransition(() => router.push(href))
    },
    [router],
  )

  return ctx ?? { isPending, pushParams, push }
}
