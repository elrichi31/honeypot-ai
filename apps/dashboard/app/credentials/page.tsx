import { AppSidebar } from "@/components/app-sidebar"
import { CredentialsView } from "@/components/credentials-view"
import { fetchCredentialsAnalytics } from "@/lib/api"

export default async function CredentialsPage() {
  const analytics = await fetchCredentialsAnalytics({ limit: 250, recentLimit: 750 })

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="ml-60 flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Credentials</h1>
          <p className="text-sm text-muted-foreground">
            Login attempts, repeated credentials, and attacker auth patterns
          </p>
        </div>

        <CredentialsView analytics={analytics} />
      </main>
    </div>
  )
}
