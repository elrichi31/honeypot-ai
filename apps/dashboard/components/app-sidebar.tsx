"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import type { Role } from "@/lib/roles-shared"
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
  Biohazard,
  FileCode,
  HardDrive,
  Users,
  ClipboardList,
  Bell,
  BookOpen,
  Ghost,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { signOut, useSession } from "@/lib/auth-client"
import { AlertsBell } from "@/components/alerts/alerts-bell"

const navSections = [
  {
    title: "Inicio",
    icon: BarChart2,
    items: [
      { title: "Dashboard", href: "/", icon: BarChart2 },
    ],
  },
  {
    title: "SSH Honeypot",
    icon: Terminal,
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
      { title: "Web Attacks", href: "/web-attacks", icon: Globe },
    ],
  },
  {
    title: "Network Honeypots",
    icon: Network,
    items: [
      { title: "Overview", href: "/services", icon: Network },
      { title: "Deception", href: "/deception", icon: Ghost },
      { title: "FTP", href: "/services/ftp", icon: HardDrive },
      { title: "MySQL", href: "/services/mysql", icon: Database },
      { title: "Port Scan", href: "/services/ports", icon: Radar },
    ],
  },
  {
    title: "Intelligence",
    icon: Layers3,
    items: [
      { title: "Alerts",      href: "/alerts",       icon: Bell        },
      { title: "Threats",     href: "/threats",      icon: ShieldAlert },
      { title: "Malware",     href: "/malware",      icon: Biohazard   },
      { title: "Network IDS",    href: "/suricata", icon: FileCode },
      { title: "API Defense", href: "/api-defense",  icon: Radar       },
    ],
  },
  {
    title: "Infrastructure",
    icon: Server,
    items: [
      { title: "Clients", href: "/clients", icon: Layers3 },
      { title: "Sensors", href: "/sensors", icon: Server },
      { title: "Install Guide", href: "/install", icon: BookOpen },
      { title: "Storage", href: "/storage", icon: HardDrive },
      { title: "Monitoring", href: "/monitoring", icon: Activity },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
  {
    title: "Administration",
    icon: Users,
    minRole: "analyst" as Role,
    items: [
      { title: "Users", href: "/users", icon: Users, minRole: "admin" as Role },
      { title: "Audit Log", href: "/audit", icon: ClipboardList, minRole: "analyst" as Role },
    ],
  },
] as const

function useHealthCheck() {
  const [status, setStatus] = useState<{
    apiOnline: boolean | null
    lastEventAt: string | null
  }>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("sidebar_health")
      if (cached) return JSON.parse(cached)
    }
    return { apiOnline: null, lastEventAt: null }
  })

  useEffect(() => {
    function check() {
      fetch("/api/health")
        .then((r) => r.json())
        .then((data) => {
          setStatus(data)
          localStorage.setItem("sidebar_health", JSON.stringify(data))
        })
        .catch(() => setStatus((prev) => ({ ...prev, apiOnline: false })))
    }

    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [])

  return status
}

const ROLE_ORDER: Role[] = ["viewer", "analyst", "admin"]
function hasPermission(userRole: Role, required: Role) {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(required)
}

export function AppSidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const health = useHealthCheck()
  const { data: session } = useSession()
  const [myRole, setMyRole] = useState<Role>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("sidebar_role") as Role) || "viewer"
    }
    return "viewer"
  })

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.role) {
          setMyRole(data.role as Role)
          localStorage.setItem("sidebar_role", data.role)
        }
      })
      .catch(() => {})
  }, [])

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
    <aside className={mobile
      ? "flex h-full w-72 flex-col border-r border-border bg-sidebar"
      : "fixed left-0 top-0 z-40 flex h-screen w-72 flex-col border-r border-border bg-sidebar"
    }>
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
          <Bug className="h-4 w-4 text-accent-foreground" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sidebar-foreground">HoneyTrap</p>
          <p className="text-[11px] text-muted-foreground">SOC view for the honeypot</p>
        </div>
        <AlertsBell />
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {navSections.filter((section) => !("minRole" in section) || hasPermission(myRole, (section as { minRole: Role }).minRole)).map((section) => {
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
                  {section.items.filter((item) => !("minRole" in item) || hasPermission(myRole, (item as { minRole: Role }).minRole)).map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/" && pathname.startsWith(`${item.href}/`))
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
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
            ? `Last event ${formatDistanceToNow(new Date(health.lastEventAt), { addSuffix: true })}`
            : health.apiOnline === false
              ? "No connection to backend"
              : "No events yet"}
        </div>
      </div>
    </aside>
  )
}
