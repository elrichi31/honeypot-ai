"use client"

import type { DashboardInsights } from "@/lib/api"
import { AttackFunnel } from "./insights/attack-funnel"
import { CountrySuccessChart, type CountrySuccessRow } from "./insights/country-success-chart"
import { SessionDepthChart } from "./insights/session-depth-chart"
import { CredentialCampaigns, type CampaignGeoRow } from "./insights/credential-campaigns"
import { RecurringIps } from "./insights/recurring-ips"
import { CommandPaths } from "./insights/command-paths"

interface Props {
  insights: DashboardInsights
  countrySuccess: CountrySuccessRow[]
  campaignGeo: CampaignGeoRow[]
}

export function DashboardInsightsView({ insights, countrySuccess, campaignGeo }: Props) {
  return (
    <div className="space-y-6">
      <AttackFunnel funnel={insights.funnel} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <CountrySuccessChart rows={countrySuccess} />
        <SessionDepthChart successfulDepth={insights.successfulDepth} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <CredentialCampaigns rows={campaignGeo} />
        <RecurringIps rows={insights.recurringIps} />
      </div>

      <CommandPaths patterns={insights.commandPatterns} />
    </div>
  )
}
