"use client"

import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import type { WebHitByIp } from "@/lib/api"
import { ATTACK_COLORS, ATTACK_LABELS } from "@/lib/attack-types"
import { EmptyState } from "@/components/ui/data-states"
import { Flag } from "@/components/ui/flag"

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
        <td colSpan={7}>
          <EmptyState
            icon="globe"
            title="No web attacks recorded"
            description="HTTP attacks will appear here once the web honeypot receives requests."
          />
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
                  <Flag code={location.country} className="text-base" />
                )}
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-mono text-sm text-foreground">{attacker.srcIp}</p>
                    {(attacker.canaryHits ?? 0) > 0 && (
                      <span
                        className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/15 px-1.5 py-0 text-[10px] font-semibold text-red-400"
                        title={`${attacker.canaryHits} canary credential replay${attacker.canaryHits! > 1 ? "s" : ""}`}
                      >
                        🎯 Canary
                      </span>
                    )}
                  </div>
                  {location?.countryName && <p className="text-xs text-muted-foreground">{location.countryName}</p>}
                </div>
              </div>
            </td>

            <td className="whitespace-nowrap px-4 py-3">
              <span className="font-semibold text-foreground">{attacker.totalHits.toLocaleString('en-US')}</span>
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

            <td className="max-w-[200px] px-4 py-3">
              {(attacker.sensorNames?.length ?? 0) > 0 ? (
                <div className="space-y-0.5">
                  <p className="truncate text-xs text-foreground" title={attacker.sensorNames!.join(", ")}>
                    {attacker.sensorNames!.slice(0, 2).join(", ")}
                    {attacker.sensorNames!.length > 2 ? ` +${attacker.sensorNames!.length - 2}` : ""}
                  </p>
                  {(attacker.clientNames?.length ?? 0) > 0 && (
                    <p className="truncate text-[11px] text-muted-foreground" title={attacker.clientNames!.join(", ")}>
                      {attacker.clientNames!.join(", ")}
                    </p>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground/50">—</span>
              )}
            </td>

            <td className="max-w-[220px] px-4 py-3">
              <div className="space-y-0.5">
                {attacker.topPaths.slice(0, 2).map((path, index) => (
                  <p key={index} className="truncate font-mono text-xs text-muted-foreground" title={path}>
                    {path}
                  </p>
                ))}
                {attacker.topPaths.length > 2 && (
                  <p className="text-xs text-muted-foreground/60">+{attacker.topPaths.length - 2} more</p>
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
