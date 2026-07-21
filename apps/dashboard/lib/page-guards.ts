import { redirect } from "next/navigation"
import { requireRole } from "@/lib/roles"

/**
 * Server guard for pages a `cliente` must never reach — non-scoped telemetry
 * (suricata, api-defense) and everything under Infrastructure. A `cliente` is
 * tenant-scoped and read-only; hiding the nav isn't enough (URLs are guessable),
 * so this redirects them to the dashboard. Call it BEFORE any data fetch, in the
 * page (server components) or its layout (client-component pages).
 */
export async function forbidCliente(): Promise<void> {
  const auth = await requireRole("viewer")
  if (auth.ok && auth.role === "cliente") redirect("/")
}
