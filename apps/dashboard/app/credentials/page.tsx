import { PageShell } from "@/components/page-shell"
import { CredentialsView } from "@/components/credentials-view"
import { fetchCredentialsAnalytics } from "@/lib/api"

export default async function CredentialsPage() {
  const analytics = await fetchCredentialsAnalytics({ limit: 250, recentLimit: 750 })

  return (
    <PageShell>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Credentials</h1>
          <p className="text-sm text-muted-foreground">
            Login attempts, repeated credentials, and attacker auth patterns
          </p>
        </div>

        <CredentialsView analytics={analytics} />
  </PageShell>
  )
}
