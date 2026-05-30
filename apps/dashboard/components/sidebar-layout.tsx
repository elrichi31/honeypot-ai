"use client"

import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"

const NO_SIDEBAR_PATHS = ["/login", "/setup"]

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (NO_SIDEBAR_PATHS.includes(pathname)) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="ml-72 flex-1 p-6">{children}</main>
    </div>
  )
}
