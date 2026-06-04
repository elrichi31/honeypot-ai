export const dynamic = "force-dynamic"

import { WebAttacksNav } from "@/components/web-attacks-nav"
import { PageShell } from "@/components/page-shell"
import { SectionError } from "@/components/section-error"
import { fetchWebHitsByIp } from "@/lib/api"
import { geolocateWebHits } from "@/lib/geo"
import { WebGeoMap } from "./web-geo-map"

export default async function WebGeoPage() {
  let attackers
  try {
    attackers = await fetchWebHitsByIp()
  } catch {
    return (
      <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Web Attacks · Geo</h1>
        </div>
        <WebAttacksNav active="geo" />
        <SectionError />
      </PageShell>
    )
  }

  const countries  = geolocateWebHits(attackers)
  const totalHits  = countries.reduce((s, c) => s + c.totalHits, 0)

  return (
    <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Web Attacks · Geo</h1>
          <p className="text-sm text-muted-foreground">
            {countries.length} countries · {attackers.length} unique IPs · {totalHits.toLocaleString('en-US')} total hits
          </p>
        </div>

        <WebAttacksNav active="geo" />

        <WebGeoMap countries={countries} totalHits={totalHits} />
  </PageShell>
  )
}
