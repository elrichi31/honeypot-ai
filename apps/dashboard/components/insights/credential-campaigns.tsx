"use client"

import { Crosshair } from "lucide-react"

export interface CampaignGeoRow {
  bucketStart: string
  username: string | null
  password: string | null
  attempts: number
  successCount: number
  uniqueIps: number
  ips: string[]
  countries: string[]
  countryCount: number
  successRate: number
}

function formatCredential(username: string | null, password: string | null) {
  return `${username?.trim() || "?"}:${password?.trim() || "?"}`
}

function formatDateLabel(value: string | null) {
  if (!value) return "n/a"
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value))
}

type Props = { rows: CampaignGeoRow[] }

export function CredentialCampaigns({ rows }: Props) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-5 flex items-center gap-2">
        <Crosshair className="h-4 w-4 text-violet-400" />
        <div>
          <h2 className="font-semibold text-foreground">Credential Campaigns</h2>
          <p className="text-sm text-muted-foreground">
            6-hour windows where the same credential pair appears across multiple IPs
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="max-h-[540px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-4 py-3 text-left">Credential</th>
                <th className="px-4 py-3 text-left">Window</th>
                <th className="px-4 py-3 text-left">Spread</th>
                <th className="px-4 py-3 text-left">Attempts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((campaign) => (
                <tr key={`${campaign.bucketStart}-${campaign.username ?? ""}-${campaign.password ?? ""}`}>
                  <td className="px-4 py-3 align-top">
                    <code className="font-mono text-foreground">
                      {formatCredential(campaign.username, campaign.password)}
                    </code>
                    <p className="mt-1 text-xs text-muted-foreground">{campaign.successRate}% success within window</p>
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {formatDateLabel(campaign.bucketStart)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-foreground">{campaign.uniqueIps} IPs · {campaign.countryCount} countries</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {campaign.countries.length > 0 ? campaign.countries.join(", ") : "No public geo"}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p className="font-semibold text-foreground">{campaign.attempts}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{campaign.successCount} successful</p>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No coordinated credential windows crossed the current threshold.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
