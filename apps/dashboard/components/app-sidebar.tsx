"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
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
  Globe,
  ChevronDown,
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
  MonitorSmartphone,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AlertsBell } from "@/components/alerts/alerts-bell"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useSidebarCollapse } from "@/components/sidebar-collapse-context"
import { SidebarUserCard } from "@/components/sidebar-user-card"

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
      { title: "Sessions", href: "/sessions-admin", icon: MonitorSmartphone, minRole: "admin" as Role },
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
  const health = useHealthCheck()
  const { collapsed: collapsedState, toggle, setCollapsed } = useSidebarCollapse()
  // The rail (collapsed) mode only applies to the fixed desktop sidebar. Inside
  // the mobile sheet we always render the full expanded panel.
  const collapsed = mobile ? false : collapsedState
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

  // Collapsed rail: clicking a section icon expands the panel and opens that
  // section, so a single click takes the user from rail → the items they want.
  function openSectionFromRail(title: string) {
    setCollapsed(false)
    setOpenSections((current) => ({ ...current, [title]: true }))
  }

  const visibleSections = navSections.filter(
    (section) => !("minRole" in section) || hasPermission(myRole, (section as { minRole: Role }).minRole),
  )

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-sidebar transition-[width] duration-200",
          mobile ? "h-full w-72" : "fixed left-0 top-0 z-40 h-screen",
          !mobile && (collapsed ? "w-[68px]" : "w-72"),
          mobile && "w-72",
        )}
      >
        {/* Header — when expanded, the alerts bell and collapse toggle share this
            row so the toggle doesn't waste a line of its own. When collapsed, just
            the logo lives here and the toggle drops to its own compact row below. */}
        <div className={cn("flex h-14 items-center border-b border-border", collapsed ? "justify-center px-2" : "gap-2 px-4")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent">
            <Bug className="h-4 w-4 text-accent-foreground" />
          </div>
          {!collapsed && (
            <>
              <div className="flex-1">
                <p className="font-semibold text-sidebar-foreground">HoneyTrap</p>
                <p className="text-[11px] text-muted-foreground">SOC view for the honeypot</p>
              </div>
              <AlertsBell />
              {!mobile && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggle}
                      aria-label="Collapse sidebar"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Collapse</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </div>

        {/* Collapse toggle row — only when collapsed (expanded shows it in header). */}
        {!mobile && collapsed && (
          <div className="flex justify-center border-b border-border px-2 py-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggle}
                  aria-label="Expand sidebar"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Nav */}
        <nav className={cn("flex-1 overflow-y-auto", collapsed ? "space-y-1 p-2" : "space-y-2 p-3")}>
          {visibleSections.map((section) => {
            const sectionActive = section.items.some(
              (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
            )
            const SectionIcon = section.icon

            // Collapsed rail: one icon per section, tooltip with the title, click
            // expands + opens that section.
            if (collapsed) {
              return (
                <Tooltip key={section.title}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => openSectionFromRail(section.title)}
                      aria-label={section.title}
                      className={cn(
                        "flex h-10 w-full items-center justify-center rounded-lg transition-colors",
                        sectionActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )}
                    >
                      <SectionIcon className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{section.title}</TooltipContent>
                </Tooltip>
              )
            }

            return (
              <div key={section.title}>
                {/* Section header — a subtle, borderless label that toggles the group. */}
                <button
                  onClick={() =>
                    setOpenSections((current) => ({
                      ...current,
                      [section.title]: !current[section.title],
                    }))
                  }
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide transition-colors",
                    sectionActive
                      ? "text-sidebar-foreground"
                      : "text-muted-foreground/70 hover:text-sidebar-foreground",
                  )}
                >
                  <span className="flex-1">{section.title}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-transform",
                      openSections[section.title] && "rotate-180",
                    )}
                  />
                </button>

                {openSections[section.title] && (
                  <div className="mt-0.5 space-y-0.5">
                    {section.items.filter((item) => !("minRole" in item) || hasPermission(myRole, (item as { minRole: Role }).minRole)).map((item) => {
                      const isActive =
                        pathname === item.href ||
                        (item.href !== "/" && pathname.startsWith(`${item.href}/`))
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                            isActive
                              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
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

        {/* Footer — user card and the ingest health status share one row so the
            avatar and the "Ingest API online" dot sit at the same height. The
            verbose "last event" line moves into a tooltip on the dot to keep it
            to a single line. When collapsed, only the avatar shows (rail-clean). */}
        <div className={cn("flex items-center gap-2 border-t border-border", collapsed ? "justify-center p-2" : "p-3")}>
          <div className="min-w-0 flex-1">
            <SidebarUserCard collapsed={collapsed} />
          </div>
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Ingest API status"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/40"
                >
                  {health.apiOnline === null ? (
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                  ) : health.apiOnline ? (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                    </span>
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-destructive" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="flex flex-col gap-0.5">
                <span>
                  {health.apiOnline === null
                    ? "Conectando..."
                    : health.apiOnline
                      ? "Ingest API online"
                      : "Ingest API offline"}
                </span>
                <span className="text-muted-foreground">
                  {health.lastEventAt
                    ? `Last event ${formatDistanceToNow(new Date(health.lastEventAt), { addSuffix: true })}`
                    : health.apiOnline === false
                      ? "No connection to backend"
                      : "No events yet"}
                </span>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
