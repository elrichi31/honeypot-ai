// Pure presentation of the threat intelligence block, shared by the PDF
// section and the on-screen report so both show identical text.
import { fmt } from "./format"
import type { ReportActorIntel, ReportThreatIntel } from "../types"
import type { TranslationKey } from "@/lib/i18n/dictionaries"

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string

export function originLine(actor: ReportActorIntel): string {
  const parts = [actor.country, actor.org, actor.usageType].filter(Boolean)
  if (actor.hosting) parts.push("hosting/VPN")
  return parts.join(" · ") || "-"
}

export function activityLine(actor: ReportActorIntel): string {
  const parts = [
    actor.sshSessions > 0 && `${fmt(actor.sshSessions)} SSH`,
    actor.commandCount > 0 && `${fmt(actor.commandCount)} cmds`,
    actor.webHits > 0 && `${fmt(actor.webHits)} web`,
    actor.protocolHits > 0 && `${fmt(actor.protocolHits)} svc`,
    actor.loginSuccess && "shell",
  ].filter(Boolean) as string[]
  return parts.join(" · ") || "-"
}

export function reputationLine(actor: ReportActorIntel): string {
  const parts = [
    actor.abuseScore != null && `Abuse ${actor.abuseScore}% (${fmt(actor.abuseReports ?? 0)})`,
    actor.vtMalicious != null && `VT ${actor.vtMalicious}/${actor.vtEngineCount ?? 0}`,
  ].filter(Boolean) as string[]
  return parts.join(" · ") || "-"
}

export function actorTableRows(actors: ReportActorIntel[]): string[][] {
  return actors.map((actor) => [
    actor.ip,
    `${actor.score} ${actor.level}`,
    actor.protocols.join(", ") || "-",
    activityLine(actor),
    originLine(actor),
    reputationLine(actor),
  ])
}

export interface IocTable {
  title: string
  headers: string[]
  rows: string[][]
}

/** Only tables with rows come back, so an empty IoC family is never rendered. */
export function iocTables(iocs: ReportThreatIntel["iocs"], t: T): IocTable[] {
  const tables: IocTable[] = [
    {
      title: t("reports.ti.ioc.c2"),
      headers: [t("reports.ti.ioc.value"), t("reports.ti.ioc.srcIp"), t("reports.ti.ioc.firstSeen")],
      rows: iocs.c2.slice(0, 12).map((i) => [i.value, i.srcIp, i.firstSeen.slice(0, 16).replace("T", " ")]),
    },
    {
      title: t("reports.ti.ioc.credentials"),
      headers: [t("reports.ti.ioc.value"), t("reports.creds.attempts"), t("reports.ti.ioc.uniqueIps")],
      rows: iocs.credentials.slice(0, 10).map((c) => [`${c.username} / ${c.password}`, fmt(c.attempts), fmt(c.uniqueIps)]),
    },
    {
      title: t("reports.ti.ioc.sshKeys"),
      headers: [t("reports.ti.ioc.fingerprint"), t("reports.ti.ioc.srcIp"), t("reports.ti.ioc.firstSeen")],
      rows: iocs.sshKeys.slice(0, 8).map((k) => [
        `${k.algorithm} ${k.fingerprint}`.slice(0, 60),
        k.srcIp,
        k.firstSeen.slice(0, 16).replace("T", " "),
      ]),
    },
    {
      title: t("reports.ti.ioc.hassh"),
      headers: [t("reports.ti.ioc.value"), t("reports.ti.ioc.client"), t("reports.ti.ioc.sessions"), t("reports.ti.ioc.uniqueIps")],
      rows: iocs.hassh.slice(0, 8).map((h) => [h.hassh, h.sampleClient ?? "-", fmt(h.sessions), fmt(h.uniqueIps)]),
    },
  ]
  return tables.filter((table) => table.rows.length > 0)
}
