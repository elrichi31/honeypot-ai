"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { Menu, Bug } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import { useIsMobile } from "@/components/ui/use-mobile"
import { cn } from "@/lib/utils"
import { SidebarCollapseProvider, useSidebarCollapse } from "@/components/sidebar-collapse-context"
import { TenantProvider } from "@/components/tenant-context"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"

const NO_SIDEBAR_PATHS = ["/login", "/setup"]

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarCollapseProvider>
      <TenantProvider>
        <SidebarLayoutInner>{children}</SidebarLayoutInner>
      </TenantProvider>
    </SidebarCollapseProvider>
  )
}

function SidebarLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const { collapsed } = useSidebarCollapse()
  const [open, setOpen] = useState(false)

  if (NO_SIDEBAR_PATHS.includes(pathname)) {
    return <>{children}</>
  }

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open navigation menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
              <Bug className="h-3.5 w-3.5 text-accent-foreground" />
            </div>
            <span className="font-semibold text-sidebar-foreground">HoneyTrap</span>
          </div>
        </header>

        <main className="p-4">{children}</main>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="p-0 w-72">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <AppSidebar mobile />
          </SheetContent>
        </Sheet>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      {/* min-w-0 lets this flex child shrink below its content width; without it
          wide children (tables, KPI rows) overflow past the viewport and get
          clipped on the right. The left margin tracks the sidebar's current width
          (rail vs expanded) and animates with it. */}
      <main
        className={cn(
          "min-w-0 flex-1 p-6 transition-[margin] duration-200",
          collapsed ? "ml-[68px]" : "ml-72",
        )}
      >
        {children}
      </main>
    </div>
  )
}
