"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { User, Settings, LogOut, ChevronsUpDown } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { signOut, useSession, fetchPublicIp } from "@/lib/auth-client"
import { useT } from "@/components/locale-provider"

function initialsOf(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "?"
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

/**
 * Footer identity card that mirrors the reference: avatar + name + email, opening
 * a menu (Profile / Settings / Log out). Collapses to just the avatar when the
 * sidebar is in rail mode. Replaces the bare logout button.
 */
export function SidebarUserCard({ collapsed }: { collapsed: boolean }) {
  const router = useRouter()
  const t = useT()
  const { data: session } = useSession()
  const user = session?.user

  async function handleLogout() {
    const publicIp = await fetchPublicIp()
    await signOut(
      publicIp ? { fetchOptions: { headers: { "x-client-public-ip": publicIp } } } : undefined,
    )
    router.push("/login")
  }

  const avatar = (
    <Avatar className="h-8 w-8 shrink-0">
      {user?.image ? <AvatarImage src={user.image} alt={user.name ?? "User"} /> : null}
      <AvatarFallback className="bg-sidebar-accent text-[11px] text-sidebar-foreground">
        {initialsOf(user?.name, user?.email)}
      </AvatarFallback>
    </Avatar>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background/40 p-1.5 text-left transition-colors hover:bg-sidebar-accent/50 focus:outline-none",
          collapsed && "justify-center border-transparent bg-transparent p-1",
        )}
        aria-label="Open account menu"
      >
        {avatar}
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {user?.name ?? t("user.account")}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {user?.email ?? ""}
              </p>
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate text-sm font-medium">{user?.name ?? t("user.account")}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user?.email ?? ""}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" className="cursor-pointer">
            <User className="mr-2 h-4 w-4" />
            {t("user.profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            {t("user.settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          {t("user.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
