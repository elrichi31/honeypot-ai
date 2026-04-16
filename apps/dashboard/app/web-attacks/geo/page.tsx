import { AppSidebar } from "@/components/app-sidebar"
import { WebAttacksNav } from "@/components/web-attacks-nav"
import { fetchWebHitsByIp } from "@/lib/api"
import { geolocateWebHits } from "@/lib/geo"
import { WebGeoMap } from "./web-geo-map"

export default async function WebGeoPage() {
  const attackers  = await fetchWebHitsByIp()
  const countries  = geolocateWebHits(attackers)
  const totalHits  = countries.reduce((s, c) => s + c.totalHits, 0)

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="ml-60 flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Web Attacks · Geo</h1>
          <p className="text-sm text-muted-foreground">
            {countries.length} países · {attackers.length} IPs únicas · {totalHits.toLocaleString()} hits totales
          </p>
        </div>

        <WebAttacksNav active="geo" />

        <WebGeoMap countries={countries} totalHits={totalHits} />
      </main>
    </div>
  )
}
