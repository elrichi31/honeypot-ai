import { AppSidebar } from "@/components/app-sidebar"
import { CredentialsView } from "@/components/credentials-view"
import { fetchEvents } from "@/lib/api"

export default async function CredentialsPage() {
  const [successEvents, failedEvents] = await Promise.all([
    fetchEvents({ type: "auth.success", limit: 100 }),
    fetchEvents({ type: "auth.failed", limit: 100 }),
  ])

  const authEvents = [...successEvents, ...failedEvents].sort(
    (a, b) => new Date(b.eventTs).getTime() - new Date(a.eventTs).getTime()
  )

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="ml-60 flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Credentials</h1>
          <p className="text-sm text-muted-foreground">
            Login attempts captured by the honeypot
          </p>
        </div>

        <CredentialsView events={authEvents} />
      </main>
    </div>
  )
}
