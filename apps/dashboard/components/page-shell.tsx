import { AppSidebar } from "@/components/app-sidebar"

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="ml-60 flex-1 p-6">{children}</main>
    </div>
  )
}
