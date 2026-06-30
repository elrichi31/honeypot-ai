// Server-only: React-PDF document component.
// All chart primitives are drawn with react-pdf's <Canvas> (imperative 2D API).
import React from "react"
import {
  Document,
  Page,
  View,
  Text,
  Canvas,
  StyleSheet,
  Font,
} from "@react-pdf/renderer"
import type { ClientReportData } from "./types"
import type { TranslationKey } from "@/lib/i18n/dictionaries"

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  indigo: "#6366f1",
  purple: "#8b5cf6",
  red: "#ef4444",
  green: "#22c55e",
  gray: "#9ca3af",
  grayLight: "#f3f4f6",
  grayBorder: "#e5e7eb",
  textDark: "#111827",
  textMid: "#374151",
  textMuted: "#6b7280",
  white: "#ffffff",
  coverBg: "#1e1b4b",
  coverAccent: "#4338ca",
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: C.textDark, paddingTop: 36, paddingBottom: 36, paddingHorizontal: 36, backgroundColor: C.white },
  cover: { backgroundColor: C.coverBg, borderRadius: 8, padding: 28, marginBottom: 20 },
  coverTitle: { fontSize: 24, fontFamily: "Helvetica-Bold", color: C.white, marginBottom: 4 },
  coverSub: { fontSize: 11, color: "#a5b4fc", marginBottom: 16 },
  coverMeta: { fontSize: 8, color: "#818cf8" },
  coverKpiRow: { flexDirection: "row", gap: 10, marginTop: 16, flexWrap: "wrap" },
  coverKpi: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 6, padding: 10, minWidth: 80, alignItems: "center" },
  coverKpiVal: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.white },
  coverKpiLabel: { fontSize: 7, color: "#c7d2fe", textTransform: "uppercase", marginTop: 2 },

  sectionHeader: { flexDirection: "row", alignItems: "center", marginTop: 18, marginBottom: 8 },
  sectionBar: { width: 3, height: 14, backgroundColor: C.indigo, borderRadius: 2, marginRight: 7 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.textDark, textTransform: "uppercase", letterSpacing: 0.8 },

  kpiRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  kpiCard: { backgroundColor: C.grayLight, borderRadius: 6, padding: 10, minWidth: 90, flex: 1 },
  kpiLabel: { fontSize: 7, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  kpiValue: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.textDark },
  kpiDeltaPos: { fontSize: 8, color: C.green, marginTop: 2 },
  kpiDeltaNeg: { fontSize: 8, color: C.red, marginTop: 2 },

  table: { width: "100%", borderRadius: 5, overflow: "hidden", border: `1 solid ${C.grayBorder}`, marginBottom: 8 },
  tableHeader: { flexDirection: "row", backgroundColor: C.grayLight, borderBottom: `1 solid ${C.grayBorder}` },
  tableRow: { flexDirection: "row", borderBottom: `1 solid ${C.grayLight}` },
  tableRowAlt: { flexDirection: "row", borderBottom: `1 solid ${C.grayLight}`, backgroundColor: "#fafafa" },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4, padding: "5 7" },
  td: { fontSize: 8, color: C.textMid, padding: "5 7" },

  funnelRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  funnelLabel: { fontSize: 8, color: C.textMid, width: 110 },
  funnelTrack: { flex: 1, backgroundColor: C.grayBorder, borderRadius: 3, height: 11, marginHorizontal: 8, overflow: "hidden" },
  funnelFill: { height: 11, borderRadius: 3, backgroundColor: C.indigo },
  funnelValue: { fontSize: 8, color: C.textMid, width: 38, textAlign: "right" },

  legendRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: 8, color: C.textMid },

  footer: { borderTop: `1 solid ${C.grayBorder}`, paddingTop: 8, flexDirection: "row", justifyContent: "space-between", marginTop: 20 },
  footerText: { fontSize: 7, color: C.gray },

  noData: { fontSize: 9, color: C.textMuted, marginBottom: 8 },
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined): string {
  if (n == null) return "—"
  return n.toLocaleString("en-US")
}
function pct(n: number | null | undefined): string {
  if (n == null) return "—"
  return `${n.toFixed(1)}%`
}
function deltaStr(d: number | null | undefined): string | null {
  if (d == null) return null
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`
}

// ── Chart canvas helpers ──────────────────────────────────────────────────────
// react-pdf's Canvas painter is a PDFKit graphics context, NOT a DOM Canvas.
// API: painter.rect(x,y,w,h).fill(color)  /  painter.path(...).fill(color)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PDFPainter = any

function drawBarChart(
  painter: PDFPainter,
  data: { value: number }[],
  w: number,
  h: number,
  color: string,
) {
  if (!data.length) return
  const max = Math.max(...data.map((d) => d.value), 1)
  const gap = 2
  const barW = (w - gap * (data.length - 1)) / data.length
  // background
  painter.rect(0, 0, w, h).fill(C.grayLight)
  data.forEach((d, i) => {
    const barH = Math.max(2, (d.value / max) * (h - 8))
    const x = i * (barW + gap)
    const y = h - 8 - barH
    painter.rect(x, y, barW, barH).fill(color)
  })
}

function drawDonut(
  painter: PDFPainter,
  slices: { value: number; color: string }[],
  size: number,
) {
  const total = slices.reduce((s, d) => s + d.value, 0)
  if (!total) return
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.42
  const ri = size * 0.25
  let angle = -Math.PI / 2
  for (const slice of slices) {
    const sweep = (slice.value / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(angle)
    const y1 = cy + r * Math.sin(angle)
    const x2 = cx + r * Math.cos(angle + sweep)
    const y2 = cy + r * Math.sin(angle + sweep)
    const ix1 = cx + ri * Math.cos(angle + sweep)
    const iy1 = cy + ri * Math.sin(angle + sweep)
    const ix2 = cx + ri * Math.cos(angle)
    const iy2 = cy + ri * Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0
    painter
      .path(
        `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ri} ${ri} 0 ${large} 0 ${ix2} ${iy2} Z`,
      )
      .fill(slice.color)
    angle += sweep
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionBar} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  )
}

function KpiCard({ label, value, delta }: { label: string; value: string; delta?: string | null }) {
  const d = delta
  return (
    <View style={s.kpiCard}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {d && <Text style={d.startsWith("-") ? s.kpiDeltaNeg : s.kpiDeltaPos}>{d}</Text>}
    </View>
  )
}

function SimpleTable({
  headers,
  rows,
  widths,
}: {
  headers: string[]
  rows: string[][]
  widths?: string[]
}) {
  return (
    <View style={s.table}>
      <View style={s.tableHeader}>
        {headers.map((h, i) => (
          <Text key={i} style={[s.th, widths ? { width: widths[i] } : { flex: 1 }]}>{h}</Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={ri % 2 === 0 ? s.tableRow : s.tableRowAlt}>
          {row.map((cell, ci) => (
            <Text key={ci} style={[s.td, widths ? { width: widths[ci] } : { flex: 1 }]}>{cell}</Text>
          ))}
        </View>
      ))}
    </View>
  )
}

function FunnelBar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = `${Math.max(4, Math.round((value / Math.max(max, 1)) * 100))}%`
  return (
    <View style={s.funnelRow}>
      <Text style={s.funnelLabel}>{label}</Text>
      <View style={s.funnelTrack}>
        <View style={[s.funnelFill, { width: w }]} />
      </View>
      <Text style={s.funnelValue}>{fmt(value)}</Text>
    </View>
  )
}

// ── Main document component ───────────────────────────────────────────────────

export function ReportDocument({ data, t }: { data: ClientReportData; t: T }) {
  const { meta, overview, kpiTrends, timeline, mitre, botRatio, insights, geo, topCredentials } = data

  const totalTechniques = mitre.tactics.reduce((s, tac) => s + tac.techniques.length, 0)
  const generatedDate = new Date(meta.generatedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  })

  // Timeline data (primary protocol, last 28 buckets)
  const primaryProtocol = timeline.activeProtocols[0] ?? "ssh"
  const timelineData = timeline.buckets.slice(-28).map((b) => ({
    value: typeof b[primaryProtocol] === "number" ? (b[primaryProtocol] as number) : 0,
  }))

  // MITRE rows (top 15)
  const mitreRows = mitre.tactics
    .flatMap((tac) => tac.techniques.slice(0, 5).map((tech) => [tac.tactic, `${tech.id} — ${tech.name}`, fmt(tech.count)]))
    .slice(0, 15)

  // Credential rows (top 10)
  const credRows = topCredentials.slice(0, 10).map((c) => [
    c.username ?? "—",
    c.password ?? "—",
    fmt(c.attempts),
    fmt(c.successCount),
  ])

  // Recurring IPs (top 8)
  const recurringRows = insights.recurringIps.slice(0, 8).map((ip) => [
    ip.srcIp,
    fmt(ip.totalSessions),
    fmt(ip.credentialCount),
    ip.lastSeen ? new Date(ip.lastSeen).toLocaleDateString("en-US") : "—",
  ])

  // Geo rows (top 12)
  const geoData = geo.slice(0, 12)
  const geoRows = geoData.map((g) => [g.country.slice(0, 30), fmt(g.count)])

  const funnel = insights.funnel
  const hasWeb = (overview.web.hits ?? 0) > 0

  return (
    <Document title={`Security Report — ${meta.clientName}`} author="HoneyTrap Platform">
      <Page size="A4" style={s.page}>

        {/* ── Cover ── */}
        <View style={s.cover}>
          <Text style={s.coverMeta}>Security Report · HoneyTrap Platform</Text>
          <Text style={s.coverTitle}>{meta.clientName}</Text>
          <Text style={s.coverSub}>{meta.periodLabel}</Text>
          <Text style={s.coverMeta}>{t("reports.footer.generated")}: {generatedDate}</Text>
          <View style={s.coverKpiRow}>
            {[
              { val: fmt(kpiTrends.events.current), label: t("reports.kpi.events") },
              { val: fmt(kpiTrends.uniqueIps.current), label: t("reports.kpi.uniqueIps") },
              { val: String(mitre.tactics.length), label: t("reports.kpi.mitreTactics") },
              { val: pct(botRatio.botPct), label: t("reports.kpi.botPct") },
            ].map((k, i) => (
              <View key={i} style={s.coverKpi}>
                <Text style={s.coverKpiVal}>{k.val}</Text>
                <Text style={s.coverKpiLabel}>{k.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Executive Summary ── */}
        <SectionHeader title={t("reports.section.executive")} />
        <View style={s.kpiRow}>
          <KpiCard label={t("reports.kpi.events")} value={fmt(kpiTrends.events.current)} delta={deltaStr(kpiTrends.events.deltaPct)} />
          <KpiCard label={t("reports.kpi.sessions")} value={fmt(kpiTrends.sshSessions.current)} delta={deltaStr(kpiTrends.sshSessions.deltaPct)} />
          <KpiCard label={t("reports.kpi.uniqueIps")} value={fmt(kpiTrends.uniqueIps.current)} delta={deltaStr(kpiTrends.uniqueIps.deltaPct)} />
          <KpiCard label={t("reports.kpi.webHits")} value={fmt(kpiTrends.webHits.current)} delta={deltaStr(kpiTrends.webHits.deltaPct)} />
          <KpiCard label={t("reports.kpi.successLogins")} value={fmt(overview.ssh.successfulLogins)} />
          <KpiCard label={t("reports.kpi.mitreTactics")} value={fmt(mitre.tactics.length)} />
          <KpiCard label={t("reports.kpi.mitreTechniques")} value={fmt(totalTechniques)} />
        </View>

        {/* ── Timeline chart ── */}
        <SectionHeader title={t("reports.section.timeline")} />
        <Canvas
          style={{ width: "100%", height: 90, marginBottom: 10 }}
          paint={(painter, w, h) => {
            drawBarChart(painter, timelineData, w, h, C.indigo)
            return null
          }}
        />

        {/* ── MITRE ── */}
        <SectionHeader title={t("reports.section.threats")} />
        {mitreRows.length > 0
          ? <SimpleTable
              headers={[t("reports.mitre.tactic"), t("reports.mitre.techniques"), t("reports.mitre.hits")]}
              rows={mitreRows}
              widths={["30%", "55%", "15%"]}
            />
          : <Text style={s.noData}>{t("reports.noActivity")}</Text>
        }

        {/* ── Credentials ── */}
        <SectionHeader title={t("reports.section.credentials")} />
        {credRows.length > 0
          ? <SimpleTable
              headers={[t("reports.creds.username"), t("reports.creds.password"), t("reports.creds.attempts"), t("reports.creds.successes")]}
              rows={credRows}
              widths={["28%", "28%", "22%", "22%"]}
            />
          : <Text style={s.noData}>{t("reports.noActivity")}</Text>
        }

        {/* ── Reconnaissance ── */}
        <SectionHeader title={t("reports.section.reconnaissance")} />
        <FunnelBar label={t("reports.funnel.connections")} value={funnel.connections} max={funnel.connections} />
        <FunnelBar label={t("reports.funnel.authAttempts")} value={funnel.authAttempts} max={funnel.connections} />
        <FunnelBar label={t("reports.funnel.loginSuccess")} value={funnel.loginSuccess} max={funnel.connections} />
        <FunnelBar label={t("reports.funnel.commands")} value={funnel.commands} max={funnel.connections} />
        <FunnelBar label={t("reports.funnel.compromise")} value={funnel.highSignalCompromise} max={funnel.connections} />

        {recurringRows.length > 0 && (
          <>
            <Text style={[s.kpiLabel, { marginTop: 10, marginBottom: 5 }]}>{t("reports.creds.recurringIps")}</Text>
            <SimpleTable
              headers={["IP", "Sessions", "Credentials", "Last Seen"]}
              rows={recurringRows}
              widths={["35%", "20%", "25%", "20%"]}
            />
          </>
        )}

        {/* ── Geo ── */}
        <SectionHeader title={t("reports.section.geo")} />
        {geoData.length > 0 ? (
          <>
            <Canvas
              style={{ width: "100%", height: 80, marginBottom: 6 }}
              paint={(painter, w, h) => {
                drawBarChart(painter, geoData.map((g) => ({ value: g.count })), w, h, C.purple)
                return null
              }}
            />
            <SimpleTable
              headers={["Country / IP", "Count"]}
              rows={geoRows}
              widths={["75%", "25%"]}
            />
          </>
        ) : (
          <Text style={s.noData}>{t("reports.noActivity")}</Text>
        )}

        {/* ── Classification ── */}
        <SectionHeader title={t("reports.section.classification")} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 10 }}>
          <Canvas
            style={{ width: 90, height: 90 }}
            paint={(painter, w, h) => {
              drawDonut(painter, [
                { value: botRatio.bot, color: C.red },
                { value: botRatio.human, color: C.green },
                { value: botRatio.unknown, color: C.gray },
              ], Math.min(w, h))
              return null
            }}
          />
          <View>
            <View style={s.legendRow}>
              <View style={[s.legendDot, { backgroundColor: C.red }]} />
              <Text style={s.legendText}>{t("reports.chart.bot")}: {fmt(botRatio.bot)} ({pct(botRatio.botPct)})</Text>
            </View>
            <View style={s.legendRow}>
              <View style={[s.legendDot, { backgroundColor: C.green }]} />
              <Text style={s.legendText}>{t("reports.chart.human")}: {fmt(botRatio.human)} ({pct(botRatio.humanPct)})</Text>
            </View>
            <View style={s.legendRow}>
              <View style={[s.legendDot, { backgroundColor: C.gray }]} />
              <Text style={s.legendText}>{t("reports.chart.unknown")}: {fmt(botRatio.unknown)}</Text>
            </View>
          </View>
        </View>

        {/* ── Web (optional) ── */}
        {hasWeb && (
          <>
            <SectionHeader title={t("reports.section.web")} />
            <View style={s.kpiRow}>
              <KpiCard label="Total Hits" value={fmt(overview.web.hits)} />
              <KpiCard label="Unique IPs" value={fmt(overview.web.uniqueIps)} />
              <KpiCard label="Top Attack Type" value={overview.web.topAttackType ?? "—"} />
            </View>
          </>
        )}

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text style={s.footerText}>{t("reports.footer.confidential")}</Text>
          <Text style={s.footerText}>HoneyTrap Platform · {meta.generatedAt.slice(0, 10)}</Text>
        </View>

      </Page>
    </Document>
  )
}
