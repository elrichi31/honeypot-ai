"use client"

import { formatDistanceToNow } from "date-fns"

interface TimeAgoProps {
  timestamp: string | Date
  className?: string
}

/**
 * Renders a relative time string ("3 minutes ago") with hydration suppressed.
 * suppressHydrationWarning is needed because the server-rendered timestamp
 * differs from the client-rendered one by the time the page hydrates.
 */
export function TimeAgo({ timestamp, className }: TimeAgoProps) {
  return (
    <span
      suppressHydrationWarning
      className={className}
    >
      {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
    </span>
  )
}
