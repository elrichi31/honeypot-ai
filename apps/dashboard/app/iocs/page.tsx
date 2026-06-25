import type { Metadata } from "next"
import { Fingerprint } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { IocSection } from "@/components/ioc-section"
import { fetchThreats, fetchMalwareArtifacts } from "@/lib/api"
import type { IocEntry } from "@/lib/ioc-export"
import { getServerT } from "@/lib/i18n/server"

// IPs at or above this risk level are treated as malicious IoCs worth exporting.
const MALICIOUS_LEVELS = new Set(["CRITICAL", "HIGH", "MEDIUM"])

export const metadata: Metadata = {
  title: "Indicators of Compromise — HoneyTrap",
}

export default async function IocsPage() {
  const t = await getServerT()

  const [threats, malware] = await Promise.all([
    fetchThreats({ pageSize: 1000 }).catch(() => []),
    fetchMalwareArtifacts({ pageSize: 200, sortBy: "capturedAt", sortDir: "desc" })
      .then((r) => r.items)
      .catch(() => []),
  ])

  // Malicious IPs → IoC entries
  const ipEntries: IocEntry[] = threats
    .filter((tr) => MALICIOUS_LEVELS.has(tr.level))
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

  return (
    <PageShell>
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <Fingerprint className="h-5 w-5 text-emerald-400" />
          <h1 className="text-2xl font-semibold text-foreground">{t("iocs.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("iocs.subtitle", { ips: ipEntries.length, hashes: hashEntries.length })}
        </p>
      </div>

      <div className="space-y-6">
        <IocSection
          title={t("iocs.section.ips")}
          kind="ip"
          entries={ipEntries}
          fileBase="honeypot-malicious-ips"
        />
        <IocSection
          title={t("iocs.section.hashes")}
          kind="hash"
          entries={hashEntries}
          fileBase="honeypot-malware-hashes"
        />
      </div>
    </PageShell>
  )
}
