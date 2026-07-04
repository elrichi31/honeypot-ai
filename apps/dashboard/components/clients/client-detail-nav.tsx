import Link from "next/link"
import { cn } from "@/lib/utils"
import type { getServerT } from "@/lib/i18n/server"

export function ClientDetailNav({
  slug,
  active,
  t,
}: {
  slug: string
  active: "overview" | "deception"
  t: Awaited<ReturnType<typeof getServerT>>
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
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            tab.key === active
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
