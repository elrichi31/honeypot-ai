"use client"

import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import type { WebHitByIp } from "@/lib/api"

const ATTACK_COLORS: Record<string, string> = {
  sqli: "bg-red-500/15 text-red-400 border-red-500/30",
  xss: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  lfi: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  rfi: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  cmdi: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  scanner: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  info_disclosure: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  recon: "bg-muted/50 text-muted-foreground border-border",
}

const ATTACK_LABELS: Record<string, string> = {
  sqli: "SQLi",
  xss: "XSS",
  lfi: "LFI",
  rfi: "RFI",
  cmdi: "CmdI",
  scanner: "Scanner",
  info_disclosure: "Info",
  recon: "Recon",
}

function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(0x1f1e6 - 65 + char.charCodeAt(0)))
    .join("")
}

export function AttackersTable({
  attackers,
  geo,
}: {
  attackers: WebHitByIp[]
  geo: Record<string, { country: string; countryName: string } | null>
}) {
  const router = useRouter()

  if (attackers.length === 0) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
          Sin datos - visita http://localhost:8080 para generar ataques
        </td>
      </tr>
    )
  }

  return (
    <>
      {attackers.map((attacker) => {
        const location = geo[attacker.srcIp] ?? null

        return (
          <tr
            key={attacker.srcIp}
            className="cursor-pointer transition-colors hover:bg-muted/20"
            onClick={() => router.push(`/web-attacks/${encodeURIComponent(attacker.srcIp)}`)}
          >
            <td className="whitespace-nowrap px-4 py-3">
              <div className="flex items-center gap-2">
                {location?.country && (
                  <span className="text-base" title={location.countryName ?? undefined}>
                    {countryFlag(location.country)}
                  </span>
                )}
                <div>
                  <p className="font-mono text-sm text-foreground">{attacker.srcIp}</p>
                  {location?.countryName && <p className="text-xs text-muted-foreground">{location.countryName}</p>}
                </div>
              </div>
            </td>

            <td className="whitespace-nowrap px-4 py-3">
              <span className="font-semibold text-foreground">{attacker.totalHits.toLocaleString()}</span>
            </td>

            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                {attacker.attackTypes.map((type) => (
                  <span
                    key={type}
                    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium ${ATTACK_COLORS[type] ?? ATTACK_COLORS.recon}`}
                  >
                    {ATTACK_LABELS[type] ?? type}
                  </span>
                ))}
              </div>
            </td>

            <td className="max-w-[220px] px-4 py-3">
              <div className="space-y-0.5">
                {attacker.topPaths.slice(0, 2).map((path, index) => (
                  <p key={index} className="truncate font-mono text-xs text-muted-foreground" title={path}>
                    {path}
                  </p>
                ))}
                {attacker.topPaths.length > 2 && (
                  <p className="text-xs text-muted-foreground/60">+{attacker.topPaths.length - 2} mas</p>
                )}
              </div>
            </td>

            <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(attacker.firstSeen), { addSuffix: true })}
            </td>

            <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(attacker.lastSeen), { addSuffix: true })}
            </td>
          </tr>
        )
      })}
    </>
  )
}
