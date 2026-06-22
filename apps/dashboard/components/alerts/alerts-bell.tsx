"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { Bell } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useLiveStream, type AlertStreamEvent } from "@/hooks/use-live-stream"
import { useT } from "@/components/locale-provider"

// Unread-alert indicator for the sidebar header. Fetches the unread count on
// mount, then bumps in real-time when new alerts arrive via SSE.
export function AlertsBell() {
  const t = useT()
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

  useLiveStream({
    onAlert: useCallback((event: AlertStreamEvent) => {
      setUnread((prev) => (prev ?? 0) + 1)
      toast.warning(event.title, {
        description: event.srcIp ? `Source: ${event.srcIp}` : undefined,
        duration: 6000,
      })
    }, []),
  })

  const count = unread ?? 0
  return (
    <Link
      href="/alerts"
      title={t("sidebar.item.alerts")}
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
