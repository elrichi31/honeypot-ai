"use client"

import { PageShell } from "@/components/page-shell"
import { InfrastructureForm } from "@/components/settings/infrastructure-form"
import { OpenAiForm } from "@/components/settings/openai-form"
import { EnrichmentForm } from "@/components/settings/enrichment-form"
import { NotificationsCard, DataRetentionCard, SecurityCard } from "@/components/settings/static-cards"

export default function SettingsPage() {
  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your honeypot monitoring preferences</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <InfrastructureForm />
        <NotificationsCard />
        <DataRetentionCard />
        <SecurityCard />
        <OpenAiForm />
        <EnrichmentForm />
      </div>
    </PageShell>
  )
}
