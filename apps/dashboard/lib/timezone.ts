export const DEFAULT_TIMEZONE = "UTC"

/**
 * Format a date in a given timezone using Intl.DateTimeFormat.
 */
export function formatInTimezone(
  date: Date | string | number,
  timezone: string,
  opts: Intl.DateTimeFormatOptions,
): string {
  const d = date instanceof Date ? date : new Date(date)
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...opts }).format(d)
  } catch {
    // Fallback to UTC if timezone string is invalid
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(d)
  }
}

/** HH:mm:ss in the given timezone */
export function formatTimeOnly(date: Date | string, timezone: string): string {
  return formatInTimezone(date, timezone, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

/** e.g. "Apr 16, 2025, 10:35:00 AM" (24h) */
export function formatDateTimeLong(date: Date | string, timezone: string): string {
  return formatInTimezone(date, timezone, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

/** e.g. "Apr 16, 2025" */
export function formatDateShort(date: Date | string, timezone: string): string {
  return formatInTimezone(date, timezone, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/** Server-side helper: reads DASHBOARD_TIMEZONE env var */
export function getServerTimezone(): string {
  return process.env.DASHBOARD_TIMEZONE ?? DEFAULT_TIMEZONE
}
