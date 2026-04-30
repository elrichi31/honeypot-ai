"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  Terminal,
  Shield,
  Activity,
  Settings,
  Bug,
  Crosshair,
  LogOut,
  Globe,
  ChevronDown,
  FolderSearch,
  Map,
  ShieldAlert,
  BarChart2,
  Layers3,
  Radar,
  Network,
  Database,
  Server,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { signOut, useSession } from "@/lib/auth-client"

const navSections = [
  {
    title: "Dashboard",
    icon: BarChart2,
    items: [
      { title: "Dashboard", href: "/", icon: BarChart2 },
      { title: "Live Attack Map", href: "/live", icon: Radar },
    ],
  },
  {
    title: "SSH Honeypot",
    icon: Radar,
    items: [
      { title: "Sessions", href: "/sessions", icon: Activity },
      { title: "Commands", href: "/commands", icon: Terminal },
      { title: "Credentials", href: "/credentials", icon: Shield },
      { title: "Campaigns", href: "/campaigns", icon: Crosshair },
    ],
  },
  {
    title: "Web Honeypot",
    icon: Globe,
    items: [
      { title: "Attackers", href: "/web-attacks", icon: Globe },
      { title: "Timeline", href: "/web-attacks/timeline", icon: BarChart2 },
      { title: "Paths", href: "/web-attacks/paths", icon: FolderSearch },
      { title: "Geo", href: "/web-attacks/geo", icon: Map },
    ],
  },
  {
    title: "Network Honeypots",
    icon: Network,
    items: [
      { title: "Protocol Hits", href: "/services", icon: Network },
      { title: "FTP", href: "/services/ftp", icon: Server },
      { title: "MySQL", href: "/services/mysql", icon: Database },
      { title: "Port Scans", href: "/services/ports", icon: Radar },
    ],
  },
  {
    title: "Intelligence",
    icon: Layers3,
    items: [{ title: "Threats", href: "/threats", icon: ShieldAlert }],
  },
  {
    title: "System",
    icon: Settings,
    items: [{ title: "Settings", href: "/settings", icon: Settings }],
  },
] as const

function useHealthCheck() {
  const [status, setStatus] = useState<{
    apiOnline: boolean | null
    lastEventAt: string | null
  }>({ apiOnline: null, lastEventAt: null })

  useEffect(() => {
    function check() {
      fetch("/api/health")
        .then((response) => response.json())
        .then(setStatus)
        .catch(() => setStatus({ apiOnline: false, lastEventAt: null }))
    }

    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [])

  return status
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const health = useHealthCheck()
  const { data: session } = useSession()

  const initialOpenSections = useMemo(() => {
    const map: Record<string, boolean> = {}
    navSections.forEach((section) => {
      map[section.title] = section.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    })
    return map
  }, [pathname])

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(initialOpenSections)

  useEffect(() => {
    setOpenSections((current) => {
      const next = { ...current }
      navSections.forEach((section) => {
        if (section.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))) {
          next[section.title] = true
        }
      })
      return next
    })
  }, [pathname])

  async function handleLogout() {
    await signOut()
    router.push("/login")
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-72 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
          <Bug className="h-4 w-4 text-accent-foreground" />
        </div>
        <div>
          <p className="font-semibold text-sidebar-foreground">HoneyTrap</p>
          <p className="text-[11px] text-muted-foreground">SOC view for the honeypot</p>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {navSections.map((section) => {
          const sectionActive = section.items.some(
            (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
          )
          const SectionIcon = section.icon

          return (
            <div key={section.title} className="rounded-xl border border-border/60 bg-background/40">
              <button
                onClick={() =>
                  setOpenSections((current) => ({
                    ...current,
                    [section.title]: !current[section.title],
                  }))
                }
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  sectionActive
                    ? "text-sidebar-foreground"
                    : "text-muted-foreground hover:text-sidebar-foreground",
                )}
              >
                <SectionIcon className="h-4 w-4" />
                <span className="flex-1">{section.title}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    openSections[section.title] && "rotate-180",
                  )}
                />
              </button>

              {openSections[section.title] && (
                <div className="space-y-1 px-2 pb-2">
                  {section.items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/" && pathname.startsWith(`${item.href}/`))
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.title}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="border-t border-border px-3 py-2">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="flex-1 truncate text-left">
            {session?.user?.email ?? "Log out"}
          </span>
        </button>
      </div>

      <div className="border-t border-border p-4 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {health.apiOnline === null ? (
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-muted-foreground/40" />
            </span>
          ) : health.apiOnline ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
          ) : (
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
            </span>
          )}
          <span>
            {health.apiOnline === null
              ? "Conectando..."
              : health.apiOnline
                ? "Ingest API online"
                : "Ingest API offline"}
          </span>
        </div>

        <div className="text-[11px] text-muted-foreground/60">
          {health.lastEventAt
            ? `Último evento ${formatDistanceToNow(new Date(health.lastEventAt), { addSuffix: true })}`
            : health.apiOnline === false
              ? "Sin conexión al backend"
              : "Sin eventos aún"}
        </div>
      </div>
    </aside>
  )
}
