"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"

const TimezoneContext = createContext<string>(DEFAULT_TIMEZONE)

export function TimezoneProvider({
  timezone: serverTimezone,
  children,
}: {
  timezone: string
  children: React.ReactNode
}) {
  // Start with the server-provided value (no hydration mismatch).
  // A useEffect will immediately swap to the localStorage-cached value (no
  // visible flash) and then validate against /api/config so settings changes
  // made during client-side navigation are always reflected.
  const [timezone, setTimezone] = useState(serverTimezone)

  useEffect(() => {
    // Step 1 – apply cached timezone instantly (before the fetch resolves)
    const cached = typeof window !== "undefined" ? localStorage.getItem("dashboard_tz") : null
    if (cached) setTimezone(cached)

    // Step 2 – fetch the authoritative value from the config API
    fetch("/api/config")
      .then((r) => r.json())
      .then((data: { timezone?: string }) => {
        const tz = data.timezone || serverTimezone || DEFAULT_TIMEZONE
        localStorage.setItem("dashboard_tz", tz)
        setTimezone(tz)
      })
      .catch(() => {
        // If fetch fails, the cached / server value stays in effect
      })
  }, [serverTimezone])

  return (
    <TimezoneContext.Provider value={timezone}>
      {children}
    </TimezoneContext.Provider>
  )
}

export function useTimezone(): string {
  return useContext(TimezoneContext)
}
