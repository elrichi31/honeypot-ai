"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  LayoutDashboard,
  Terminal,
  Shield,
  Activity,
  Settings,
  Bug,
  Crosshair,
  LogOut,
  Globe,
  ChevronDown,
  Users,
  BarChart2,
  FolderSearch,
  Map,
  ShieldAlert,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { signOut, useSession } from "@/lib/auth-client"

const navItems = [
  { title: "Overview",     href: "/",            icon: LayoutDashboard },
  { title: "Sessions",     href: "/sessions",    icon: Activity },
  { title: "Commands",     href: "/commands",    icon: Terminal },
  { title: "Credentials",  href: "/credentials", icon: Shield },
  { title: "Campaigns",    href: "/campaigns",   icon: Crosshair },
  { title: "Threats",      href: "/threats",     icon: ShieldAlert },
  { title: "Settings",     href: "/settings",    icon: Settings },
]

const webAttacksItems = [
  { title: "Attackers",  href: "/web-attacks",           icon: Users },
  { title: "Timeline",   href: "/web-attacks/timeline",  icon: BarChart2 },
  { title: "Paths",      href: "/web-attacks/paths",     icon: FolderSearch },
  { title: "Geo",        href: "/web-attacks/geo",       icon: Map },
]

function useHealthCheck() {
  const [status, setStatus] = useState<{
    apiOnline: boolean | null
    lastEventAt: string | null
  }>({ apiOnline: null, lastEventAt: null })

  useEffect(() => {
    function check() {
      fetch("/api/health")
        .then((r) => r.json())
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

  const isWebActive = pathname.startsWith("/web-attacks")
  const [webOpen, setWebOpen] = useState(isWebActive)

  async function handleLogout() {
    await signOut()
    router.push("/login")
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
          <Bug className="h-4 w-4 text-accent-foreground" />
        </div>
        <span className="font-semibold text-sidebar-foreground">HoneyTrap</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          )
        })}

        {/* Web Attacks — collapsible submenu */}
        <div>
          <button
            onClick={() => setWebOpen((o) => !o)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isWebActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <Globe className="h-4 w-4" />
            <span className="flex-1 text-left">Web Attacks</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", webOpen && "rotate-180")} />
          </button>

          {webOpen && (
            <div className="mt-1 ml-3 space-y-0.5 border-l border-border pl-3">
              {webAttacksItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.title}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </nav>

      {/* User / Logout */}
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

      {/* Status */}
      <div className="border-t border-border p-4 space-y-2">
        {/* Ingest API */}
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

        {/* Last event */}
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
