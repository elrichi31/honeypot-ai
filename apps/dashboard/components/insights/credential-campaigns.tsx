"use client"

import { Crosshair } from "lucide-react"
import { useTimezone } from "@/components/timezone-provider"
import { useT } from "@/components/locale-provider"
import { Surface } from "@/components/ui/surface"
import { formatInTimezone } from "@/lib/timezone"

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

function formatDateLabel(value: string | null, tz: string) {
  if (!value) return "n/a"
  return formatInTimezone(value, tz, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
}

type Props = { rows: CampaignGeoRow[] }

export function CredentialCampaigns({ rows }: Props) {
  const tz = useTimezone()
  const t = useT()
  return (
    <Surface className="p-5">
      <div className="mb-5 flex items-center gap-2">
        <Crosshair className="h-4 w-4 text-violet-400" />
        <div>
          <h2 className="font-semibold text-foreground">{t("dash.campaigns.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("dash.campaigns.subtitle")}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="max-h-[540px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-4 py-3 text-left">{t("dash.campaigns.colCredential")}</th>
                <th className="px-4 py-3 text-left">{t("dash.campaigns.colWindow")}</th>
                <th className="px-4 py-3 text-left">{t("dash.campaigns.colSpread")}</th>
                <th className="px-4 py-3 text-left">{t("dash.campaigns.colAttempts")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((campaign) => (
                <tr key={`${campaign.bucketStart}-${campaign.username ?? ""}-${campaign.password ?? ""}`}>
                  <td className="px-4 py-3 align-top">
                    <code className="font-mono text-foreground">
                      {formatCredential(campaign.username, campaign.password)}
                    </code>
                    <p className="mt-1 text-xs text-muted-foreground">{t("dash.campaigns.successWithinWindow", { rate: campaign.successRate })}</p>
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {formatDateLabel(campaign.bucketStart, tz)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-foreground">{t("dash.campaigns.spread", { ips: campaign.uniqueIps, countries: campaign.countryCount })}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {campaign.countries.length > 0 ? campaign.countries.join(", ") : t("dash.campaigns.noPublicGeo")}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p className="font-semibold text-foreground">{campaign.attempts}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("dash.campaigns.successful", { n: campaign.successCount })}</p>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("dash.campaigns.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Surface>
  )
}
