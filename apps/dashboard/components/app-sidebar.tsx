"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { hasPermission, type Role } from "@/lib/roles-shared"
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
  Fingerprint,
  MonitorSmartphone,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AlertsBell } from "@/components/alerts/alerts-bell"
import { LiveAttackBadge } from "@/components/live-attack-badge"
import { TenantSwitcher } from "@/components/tenant-switcher"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useSidebarCollapse } from "@/components/sidebar-collapse-context"
import { SidebarUserCard } from "@/components/sidebar-user-card"
import { useT } from "@/components/locale-provider"
import type { TranslationKey } from "@/lib/i18n/dictionaries"

// `key` is a stable identifier (used for React keys + open/closed state), since
// the visible label (`titleKey` resolved via t()) changes with the locale.
const navSections = [
  {
    key: "inicio",
    titleKey: "sidebar.section.inicio",
    icon: BarChart2,
    items: [
      { titleKey: "sidebar.item.dashboard", href: "/", icon: BarChart2 },
    ],
  },
  {
    key: "ssh",
    titleKey: "sidebar.section.ssh",
    icon: Terminal,
    items: [
      { titleKey: "sidebar.item.sessions", href: "/sessions", icon: Activity },
      { titleKey: "sidebar.item.commands", href: "/commands", icon: Terminal },
      { titleKey: "sidebar.item.campaigns", href: "/campaigns", icon: Crosshair },
    ],
  },
  {
    key: "web",
    titleKey: "sidebar.section.web",
    icon: Globe,
    items: [
      { titleKey: "sidebar.item.webAttacks", href: "/web-attacks", icon: Globe },
    ],
  },
  {
    key: "network",
    titleKey: "sidebar.section.network",
    icon: Network,
    items: [
      { titleKey: "sidebar.item.overview", href: "/services", icon: Network },
      { titleKey: "sidebar.item.deception", href: "/deception", icon: Ghost },
      { titleKey: "sidebar.item.ftp", href: "/services/ftp", icon: HardDrive },
      { titleKey: "sidebar.item.mysql", href: "/services/mysql", icon: Database },
      { titleKey: "sidebar.item.portScan", href: "/services/ports", icon: Radar },
    ],
  },
  {
    key: "intelligence",
    titleKey: "sidebar.section.intelligence",
    icon: Layers3,
    items: [
      { titleKey: "sidebar.item.alerts",      href: "/alerts",      icon: Bell        },
      { titleKey: "sidebar.item.threats",     href: "/threats",     icon: ShieldAlert },
      { titleKey: "sidebar.item.iocs",        href: "/iocs",        icon: Fingerprint },
      { titleKey: "sidebar.item.credentials", href: "/credentials", icon: Shield      },
      { titleKey: "sidebar.item.malware",     href: "/malware",     icon: Biohazard   },
      { titleKey: "sidebar.item.networkIds", href: "/suricata",    icon: FileCode    },
      { titleKey: "sidebar.item.apiDefense", href: "/api-defense", icon: Radar       },
    ],
  },
  {
    key: "infrastructure",
    titleKey: "sidebar.section.infrastructure",
    icon: Server,
    items: [
      { titleKey: "sidebar.item.clients", href: "/clients", icon: Layers3 },
      { titleKey: "sidebar.item.sensors", href: "/sensors", icon: Server },
      { titleKey: "sidebar.item.installGuide", href: "/install", icon: BookOpen },
      { titleKey: "sidebar.item.storage", href: "/storage", icon: HardDrive },
      { titleKey: "sidebar.item.monitoring", href: "/monitoring", icon: Activity },
      { titleKey: "sidebar.item.settings", href: "/settings", icon: Settings },
    ],
  },
  {
    key: "administration",
    titleKey: "sidebar.section.administration",
    icon: Users,
    minRole: "analyst" as Role,
    items: [
      { titleKey: "sidebar.item.users", href: "/users", icon: Users, minRole: "admin" as Role },
      { titleKey: "sidebar.item.adminSessions", href: "/sessions-admin", icon: MonitorSmartphone, minRole: "admin" as Role },
      { titleKey: "sidebar.item.auditLog", href: "/audit", icon: ClipboardList, minRole: "analyst" as Role },
    ],
  },
] as const

function useHealthCheck() {
  // Deterministic initial value (server === client) to avoid hydration #418;
  // the cached value is loaded in an effect, client-only.
  const [status, setStatus] = useState<{
    apiOnline: boolean | null
    lastEventAt: string | null
  }>({ apiOnline: null, lastEventAt: null })

  useEffect(() => {
    const cached = localStorage.getItem("sidebar_health")
    if (cached) {
      try { setStatus(JSON.parse(cached)) } catch { /* ignore malformed cache */ }
    }
  }, [])

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

export function AppSidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()
  const health = useHealthCheck()
  const t = useT()
  const { collapsed: collapsedState, toggle, setCollapsed } = useSidebarCollapse()
  // The rail (collapsed) mode only applies to the fixed desktop sidebar. Inside
  // the mobile sheet we always render the full expanded panel.
  const collapsed = mobile ? false : collapsedState
  // Must start with the SAME value on server and client to avoid a hydration
  // mismatch (#418): the server has no localStorage, so reading it in the
  // initializer made the server render "viewer" while the client rendered the
  // cached role (e.g. "superadmin"), which renders a different set of nav
  // sections — a structural mismatch that tears down the tree. We start at
  // "viewer" everywhere and reconcile from localStorage + /api/me in effects.
  const [myRole, setMyRole] = useState<Role>("viewer")

  useEffect(() => {
    const cached = localStorage.getItem("sidebar_role") as Role | null
    if (cached) setMyRole(cached)
  }, [])

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
      map[section.key] = section.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    })
    return map
  }, [pathname])

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(initialOpenSections)

  useEffect(() => {
    setOpenSections((current) => {
      const next = { ...current }
      navSections.forEach((section) => {
        if (section.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))) {
          next[section.key] = true
        }
      })
      return next
    })
  }, [pathname])

  // Collapsed rail: clicking a section icon expands the panel and opens that
  // section, so a single click takes the user from rail → the items they want.
  function openSectionFromRail(key: string) {
    setCollapsed(false)
    setOpenSections((current) => ({ ...current, [key]: true }))
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
              <div className="flex flex-1 items-center gap-2">
                <div>
                  <p className="font-semibold text-sidebar-foreground">HoneyTrap</p>
                  <p className="text-[11px] text-muted-foreground">{t("sidebar.tagline")}</p>
                </div>
                <LiveAttackBadge />
              </div>
              <AlertsBell />
              {!mobile && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggle}
                      aria-label={t("sidebar.collapse")}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{t("sidebar.collapse")}</TooltipContent>
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
                  aria-label={t("sidebar.expand")}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("sidebar.expand")}</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Tenant scope switcher (superadmin only; renders nothing otherwise) */}
        <TenantSwitcher collapsed={collapsed} />

        {/* Nav */}
        <nav className={cn("flex-1 overflow-y-auto", collapsed ? "space-y-1 p-2" : "space-y-2 p-3")}>
          {visibleSections.map((section) => {
            const sectionActive = section.items.some(
              (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
            )
            const SectionIcon = section.icon
            const sectionTitle = t(section.titleKey as TranslationKey)

            // Collapsed rail: one icon per section, tooltip with the title, click
            // expands + opens that section.
            if (collapsed) {
              return (
                <Tooltip key={section.key}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => openSectionFromRail(section.key)}
                      aria-label={sectionTitle}
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
                  <TooltipContent side="right">{sectionTitle}</TooltipContent>
                </Tooltip>
              )
            }

            return (
              <div key={section.key}>
                {/* Section header — icon + title, borderless, toggles the group. */}
                <button
                  onClick={() =>
                    setOpenSections((current) => ({
                      ...current,
                      [section.key]: !current[section.key],
                    }))
                  }
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
                    sectionActive
                      ? "text-sidebar-foreground"
                      : "text-muted-foreground hover:text-sidebar-foreground",
                  )}
                >
                  <SectionIcon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{sectionTitle}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-transform",
                      openSections[section.key] && "rotate-180",
                    )}
                  />
                </button>

                {openSections[section.key] && (
                  /* Indented sub-items with a vertical guide rail on the left so
                     it reads as a nested group (like the reference). */
                  <div className="ml-[18px] mt-0.5 space-y-0.5 border-l border-border/60 pl-2">
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
                          {t(item.titleKey as TranslationKey)}
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
                  aria-label={t("sidebar.status")}
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
                    ? t("sidebar.status.connecting")
                    : health.apiOnline
                      ? t("sidebar.status.online")
                      : t("sidebar.status.offline")}
                </span>
                <span className="text-muted-foreground">
                  {health.lastEventAt
                    ? t("sidebar.status.lastEvent", { time: formatDistanceToNow(new Date(health.lastEventAt), { addSuffix: true }) })
                    : health.apiOnline === false
                      ? t("sidebar.status.noConnection")
                      : t("sidebar.status.noEvents")}
                </span>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
