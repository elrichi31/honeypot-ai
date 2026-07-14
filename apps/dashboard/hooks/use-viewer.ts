"use client"

import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/client-fetch"
import { hasPermission, type Role } from "@/lib/roles-shared"

export type Viewer = { role: Role; clientId: string | null; isSuperadmin: boolean }

// Module-level cache: many SensorCard instances on the same page would
// otherwise each fire their own GET /api/me. One request, shared by every
// caller for the lifetime of the tab (role/clientId don't change without a
// re-login, which reloads the page anyway).
let viewerPromise: Promise<Viewer | null> | null = null

function fetchViewer(): Promise<Viewer | null> {
  if (!viewerPromise) {
    viewerPromise = apiFetch("/api/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
  }
  return viewerPromise
}

export function useViewer(): Viewer | null {
  const [viewer, setViewer] = useState<Viewer | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchViewer().then((v) => { if (!cancelled) setViewer(v) })
    return () => { cancelled = true }
  }, [])
  return viewer
}

// Ownership + role gate shared by every control-plane action button: the
// server enforces this too (SensorControlService.authorize), this only
// decides whether to show/enable the control so a user without permission
// isn't shown a button that will just 403.
export function canActOnSensor(viewer: Viewer | null, minRole: Role, sensorClientId: string | null | undefined): boolean {
  if (!viewer) return false
  if (!hasPermission(viewer.role, minRole)) return false
  if (viewer.isSuperadmin) return true
  return !!viewer.clientId && viewer.clientId === sensorClientId
}
