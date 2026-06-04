"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Bell } from "lucide-react"
import { cn } from "@/lib/utils"

// Unread-alert indicator for the sidebar header. Fetches the unread count on
// mount (and when the route changes via the key in the layout); no polling —
// the count refreshes whenever the user navigates or reloads.
export function AlertsBell() {
  const [unread, setUnread] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/alerts?limit=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setUnread(Number(data.unreadCount ?? 0))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const count = unread ?? 0
  return (
    <Link
      href="/alerts"
      title="Alertas"
      className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span
          className={cn(
            "absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white",
            "bg-destructive",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  )
}
