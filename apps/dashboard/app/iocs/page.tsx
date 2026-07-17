import type { Metadata } from "next"
import { Fingerprint } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { IocSection } from "@/components/ioc-section"
import { IocFilters } from "@/components/ioc-filters"
import { IocBundleExport } from "@/components/ioc-bundle-export"
import { StatCard } from "@/components/ui/stat-card"
import { fetchThreats, fetchMalwareArtifacts, fetchAggregatedIocs } from "@/lib/api"
import type { IocEntry } from "@/lib/ioc-export"
import { getServerT } from "@/lib/i18n/server"

// IPs at or above this risk level are treated as malicious IoCs worth exporting.
const MALICIOUS_LEVELS = new Set(["CRITICAL", "HIGH", "MEDIUM"])

const VALID_PERIODS = ["24h", "7d", "30d", "90d"] as const
type Period = (typeof VALID_PERIODS)[number]
const VALID_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const

function parseCsv<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  if (!raw) return []
  const allowedSet = new Set<string>(allowed)
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean)
  return [...new Set(parts)].filter((p): p is T => allowedSet.has(p))
}

export const metadata: Metadata = {
  title: "Indicators of Compromise — HoneyTrap",
}

export default async function IocsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; levels?: string }>
}) {
  const t = await getServerT()
  const sp = await searchParams

  const period: Period = VALID_PERIODS.includes(sp.period as Period) ? (sp.period as Period) : "90d"
  const levelFilter = parseCsv(sp.levels, VALID_LEVELS)
  // Which risk levels count as malicious: the user's selection if any, else the default set.
  const activeLevels = levelFilter.length > 0 ? new Set<string>(levelFilter) : MALICIOUS_LEVELS

  const [threats, malware, aggregated] = await Promise.all([
    fetchThreats({ pageSize: 5000, period }).catch(() => []),
    fetchMalwareArtifacts({ pageSize: 200, sortBy: "capturedAt", sortDir: "desc" })
      .then((r) => r.items)
      .catch(() => []),
    fetchAggregatedIocs({ period }).catch(() => ({ c2: [], sshKeys: [] })),
  ])

  const ipEntries: IocEntry[] = threats
    .filter((tr) => activeLevels.has(tr.level))
    .map((tr) => ({
      type: "ip",
      value: tr.ip,
      meta: {
        source: "honeypot",
        score: tr.score,
        level: tr.level,
        protocols: tr.protocolsSeen.join("|"),
      },
    }))

  // Malware hashes → IoC entries (dedup by file id)
  const seen = new Set<string>()
  const hashEntries: IocEntry[] = []
  for (const m of malware) {
    if (seen.has(m.md5)) continue
    seen.add(m.md5)
    hashEntries.push({
      type: "hash",
      value: m.md5,
      meta: {
        source: m.source ?? "honeypot",
        fileType: m.fileType,
        size: m.size,
        srcIp: m.srcIp,
        capturedAt: m.capturedAt,
      },
    })
  }

  const c2Entries: IocEntry[] = aggregated.c2.map((c) => ({
    type: "c2",
    value: c.value,
    meta: {
      source: "honeypot",
      host: c.host,
      port: c.port,
      srcIp: c.srcIp,
      firstSeen: c.firstSeen,
    },
  }))

  const sshKeyEntries: IocEntry[] = aggregated.sshKeys.map((k) => ({
    type: "sshkey",
    value: k.raw,
    meta: {
      source: "honeypot",
      algorithm: k.algorithm,
      comment: k.comment ?? undefined,
      fingerprint: k.fingerprint,
      srcIp: k.srcIp,
      firstSeen: k.firstSeen,
    },
  }))

  const allEntries = [...ipEntries, ...hashEntries, ...c2Entries, ...sshKeyEntries]

  return (
    <PageShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-emerald-400" />
            <h1 className="text-2xl font-semibold text-foreground">{t("iocs.title")}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{t("iocs.subtitle")}</p>
        </div>
        <IocBundleExport entries={allEntries} />
      </div>

      <div className="mb-6">
        <IocFilters />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("iocs.stat.ips")} value={ipEntries.length.toLocaleString("en-US")} mono tone="critical" />
        <StatCard label={t("iocs.stat.hashes")} value={hashEntries.length.toLocaleString("en-US")} mono />
        <StatCard label={t("iocs.stat.c2")} value={c2Entries.length.toLocaleString("en-US")} mono tone="high" />
        <StatCard label={t("iocs.stat.sshkeys")} value={sshKeyEntries.length.toLocaleString("en-US")} mono />
      </div>

      <div className="space-y-6">
        <IocSection
          title={t("iocs.section.ips")}
          kind="ip"
          entries={ipEntries}
          fileBase="honeypot-malicious-ips"
        />
        <IocSection
          title={t("iocs.section.c2")}
          kind="c2"
          entries={c2Entries}
          fileBase="honeypot-c2-endpoints"
        />
        <IocSection
          title={t("iocs.section.hashes")}
          kind="hash"
          entries={hashEntries}
          fileBase="honeypot-malware-hashes"
        />
        <IocSection
          title={t("iocs.section.sshkeys")}
          kind="sshkey"
          entries={sshKeyEntries}
          fileBase="honeypot-ssh-keys"
        />
      </div>
    </PageShell>
  )
}
