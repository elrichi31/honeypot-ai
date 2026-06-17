import Link from "next/link"
import { Flag } from "@/components/ui/flag"

interface Location {
  country?: string | null
  countryName?: string | null
}

interface IpWithLocationProps {
  ip: string
  location?: Location | null
  /** href prefix — defaults to /web-attacks. Pass null to render plain text (no link). */
  href?: string | null
  /** Show the country name as a subtitle below the IP */
  showCountryName?: boolean
  /** Extra classes for the IP text / link */
  ipClassName?: string
  /** Extra classes for the outer wrapper */
  className?: string
}

export function IpWithLocation({
  ip,
  location,
  href = "/web-attacks",
  showCountryName = true,
  ipClassName,
  className,
}: IpWithLocationProps) {
  const ipClass = `font-mono text-sm text-blue-400 hover:underline ${ipClassName ?? ""}`

  return (
    <div className={`flex items-center gap-1.5 min-w-0 ${className ?? ""}`}>
      {location?.country && <Flag code={location.country} />}
      {href !== null ? (
        <Link href={`${href}/${encodeURIComponent(ip)}`} className={ipClass}>
          {ip}
        </Link>
      ) : (
        <span className={`font-mono text-sm text-foreground ${ipClassName ?? ""}`}>{ip}</span>
      )}
      {showCountryName && location?.countryName && (
        <span className="text-xs text-muted-foreground truncate">{location.countryName}</span>
      )}
    </div>
  )
}
