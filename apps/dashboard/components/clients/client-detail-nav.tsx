import Link from "next/link"
import { cn } from "@/lib/utils"
import type { getServerT } from "@/lib/i18n/server"

export function ClientDetailNav({
  slug,
  active,
  t,
  deceptionBadge,
}: {
  slug: string
  active: "overview" | "deception"
  t: Awaited<ReturnType<typeof getServerT>>
  /** Interactions with an internal trap node in the last 24h — surfaced next to the Deception tab so it's visible without opening it. */
  deceptionBadge?: number
}) {
  const tabs = [
    { key: "overview" as const, label: t("clients.detail.nav.overview"), href: `/clients/${slug}` },
    { key: "deception" as const, label: t("clients.detail.nav.deception"), href: `/clients/${slug}/deception` },
  ]

  return (
    <div className="mb-6 flex gap-1 rounded-lg border border-border bg-muted/20 p-1 w-fit">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            tab.key === active
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
          {tab.key === "deception" && !!deceptionBadge && deceptionBadge > 0 && (
            <span
              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
              title={t("clients.detail.deception.badgeTitle", { n: String(deceptionBadge) })}
            >
              {deceptionBadge > 99 ? "99+" : deceptionBadge}
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}
