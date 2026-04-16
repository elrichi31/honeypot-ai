import Link from "next/link"
import { cn } from "@/lib/utils"

const tabs = [
  { label: "Attackers", href: "/web-attacks" },
  { label: "Timeline",  href: "/web-attacks/timeline" },
  { label: "Paths",     href: "/web-attacks/paths" },
  { label: "Geo",       href: "/web-attacks/geo" },
]

export function WebAttacksNav({ active }: { active: "attackers" | "timeline" | "paths" | "geo" }) {
  const activeHref = {
    attackers: "/web-attacks",
    timeline:  "/web-attacks/timeline",
    paths:     "/web-attacks/paths",
    geo:       "/web-attacks/geo",
  }[active]

  return (
    <div className="mb-6 flex gap-1 rounded-lg border border-border bg-muted/20 p-1 w-fit">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            tab.href === activeHref
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
