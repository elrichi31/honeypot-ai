import React from "react"
import { Text, View, StyleSheet } from "@react-pdf/renderer"
import type { ClientReportData } from "../types"
import type { TranslationKey } from "@/lib/i18n/dictionaries"
import { fmt, pct, rate } from "./format"

export type T = (key: TranslationKey, vars?: Record<string, string | number>) => string

export const C = {
  indigo: "#6366f1",
  purple: "#8b5cf6",
  blue: "#2563eb",
  red: "#ef4444",
  green: "#22c55e",
  amber: "#f59e0b",
  gray: "#9ca3af",
  grayLight: "#f3f4f6",
  graySoft: "#f8fafc",
  grayBorder: "#e5e7eb",
  textDark: "#111827",
  textMid: "#374151",
  textMuted: "#6b7280",
  white: "#ffffff",
  coverBg: "#1e1b4b",
}

export const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.textDark,
    paddingTop: 30,
    paddingBottom: 30,
    paddingHorizontal: 30,
    backgroundColor: C.white,
  },
  cover: { backgroundColor: C.coverBg, borderRadius: 10, padding: 24, marginBottom: 16 },
  coverMeta: { fontSize: 8, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: 0.8 },
  coverTitle: { fontSize: 24, fontFamily: "Helvetica-Bold", color: C.white, marginTop: 6 },
  coverSub: { fontSize: 11, color: "#c7d2fe", marginTop: 2 },
  coverKpiRow: { flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" },
  coverKpi: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 6, padding: 9, minWidth: 92 },
  coverKpiVal: { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.white },
  coverKpiLabel: { fontSize: 7, color: "#c7d2fe", marginTop: 2, textTransform: "uppercase" },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 7 },
  sectionBar: { width: 3, height: 14, backgroundColor: C.indigo, borderRadius: 2, marginRight: 7 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  twoCol: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },
  panel: { backgroundColor: C.graySoft, borderRadius: 8, border: `1 solid ${C.grayBorder}`, padding: 10, marginBottom: 8 },
  panelTitle: { fontSize: 7, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  bodyText: { fontSize: 8.5, color: C.textMid, lineHeight: 1.4 },
  bullet: { fontSize: 8.5, color: C.textMid, marginBottom: 4, lineHeight: 1.35 },
  kpiRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  kpiCard: { backgroundColor: C.grayLight, borderRadius: 6, padding: 9, minWidth: 100, flex: 1 },
  kpiLabel: { fontSize: 7, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.45, marginBottom: 3 },
  kpiValue: { fontSize: 15, fontFamily: "Helvetica-Bold", color: C.textDark },
  kpiDeltaPos: { fontSize: 8, color: C.green, marginTop: 2 },
  kpiDeltaNeg: { fontSize: 8, color: C.red, marginTop: 2 },
  kpiMeta: { fontSize: 7.5, color: C.textMuted, marginTop: 2 },
  table: { width: "100%", borderRadius: 5, overflow: "hidden", border: `1 solid ${C.grayBorder}`, marginBottom: 8 },
  tableHeader: { flexDirection: "row", backgroundColor: C.grayLight, borderBottom: `1 solid ${C.grayBorder}` },
  tableRow: { flexDirection: "row", borderBottom: `1 solid ${C.grayLight}` },
  tableRowAlt: { flexDirection: "row", borderBottom: `1 solid ${C.grayLight}`, backgroundColor: "#fafafa" },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4, padding: "5 7" },
  td: { fontSize: 8, color: C.textMid, padding: "5 7" },
  rankedRow: { marginBottom: 7 },
  rankedTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 2 },
  rankedLabel: { fontSize: 8, color: C.textDark, width: "58%" },
  rankedValue: { fontSize: 8, color: C.textMid, width: "18%", textAlign: "right" },
  rankedPct: { fontSize: 8, color: C.textMuted, width: "14%", textAlign: "right" },
  rankedTrack: { height: 8, borderRadius: 4, backgroundColor: C.grayBorder, overflow: "hidden" },
  rankedFill: { height: 8, borderRadius: 4 },
  rankedMeta: { fontSize: 7.5, color: C.textMuted, marginTop: 2 },
  timelineWrap: { marginBottom: 8 },
  timelineRow: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 86 },
  timelineCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  timelineValue: { fontSize: 6, color: C.textMuted, marginBottom: 2 },
  timelineBarWrap: { width: "100%", height: 54, justifyContent: "flex-end", backgroundColor: C.grayLight, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  timelineBar: { width: "100%", backgroundColor: C.indigo, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
  timelineLabel: { fontSize: 6, color: C.textMuted, marginTop: 3, textAlign: "center" },
  ratioRow: { marginBottom: 6 },
  ratioTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  ratioLabel: { fontSize: 8, color: C.textMid },
  ratioValue: { fontSize: 8, color: C.textMid },
  ratioTrack: { height: 10, borderRadius: 4, backgroundColor: C.grayBorder, overflow: "hidden" },
  ratioFill: { height: 10, borderRadius: 4 },
  footer: { borderTop: `1 solid ${C.grayBorder}`, paddingTop: 8, flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  footerText: { fontSize: 7, color: C.gray },
  noData: { fontSize: 8.5, color: C.textMuted, marginBottom: 8 },
})

export function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionBar} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  )
}

export function KpiCard({ label, value, delta, meta }: { label: string; value: string; delta?: string | null; meta?: string }) {
  return (
    <View style={s.kpiCard}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {delta ? <Text style={delta.startsWith("-") ? s.kpiDeltaNeg : s.kpiDeltaPos}>{delta}</Text> : null}
      {meta ? <Text style={s.kpiMeta}>{meta}</Text> : null}
    </View>
  )
}

export function SimpleTable({
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
        {headers.map((header, index) => (
          <Text key={index} style={[s.th, widths ? { width: widths[index] } : { flex: 1 }]}>{header}</Text>
        ))}
      </View>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={rowIndex % 2 === 0 ? s.tableRow : s.tableRowAlt}>
          {row.map((cell, cellIndex) => (
            <Text key={cellIndex} style={[s.td, widths ? { width: widths[cellIndex] } : { flex: 1 }]}>{cell}</Text>
          ))}
        </View>
      ))}
    </View>
  )
}

export function RankedBars({
  items,
  color,
}: {
  items: Array<{ label: string; value: number; pct?: number; meta?: string }>
  color: string
}) {
  const max = Math.max(...items.map((item) => item.value), 1)
  return (
    <View>
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={s.rankedRow}>
          <View style={s.rankedTop}>
            <Text style={s.rankedLabel}>{item.label}</Text>
            <Text style={s.rankedValue}>{fmt(item.value)}</Text>
            <Text style={s.rankedPct}>{item.pct == null ? "" : pct(item.pct)}</Text>
          </View>
          <View style={s.rankedTrack}>
            <View style={[s.rankedFill, { width: `${Math.max(4, (item.value / max) * 100)}%`, backgroundColor: color }]} />
          </View>
          {item.meta ? <Text style={s.rankedMeta}>{item.meta}</Text> : null}
        </View>
      ))}
    </View>
  )
}

export function TimelineChart({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(...items.map((item) => item.value), 1)
  return (
    <View style={s.timelineWrap}>
      <View style={s.timelineRow}>
        {items.map((item, index) => (
          <View key={`${item.label}-${index}`} style={s.timelineCol}>
            <Text style={s.timelineValue}>{fmt(item.value)}</Text>
            <View style={s.timelineBarWrap}>
              <View style={[s.timelineBar, { height: Math.max(2, (item.value / max) * 54) }]} />
            </View>
            <Text style={s.timelineLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export function RatioBar({ label, value, total, color, meta }: { label: string; value: number; total: number; color: string; meta?: string }) {
  const width = total > 0 ? Math.max(4, (value / total) * 100) : 4
  return (
    <View style={s.ratioRow}>
      <View style={s.ratioTop}>
        <Text style={s.ratioLabel}>{label}</Text>
        <Text style={s.ratioValue}>{fmt(value)} ({rate(value, total)}){meta ? ` - ${meta}` : ""}</Text>
      </View>
      <View style={s.ratioTrack}>
        <View style={[s.ratioFill, { width: `${width}%`, backgroundColor: color }]} />
      </View>
    </View>
  )
}

export function Footer({ data, t }: { data: ClientReportData; t: T }) {
  return (
    <View style={s.footer}>
      <Text style={s.footerText}>{t("reports.footer.confidential")}</Text>
      <Text style={s.footerText}>HoneyTrap Platform - {data.meta.generatedAt.slice(0, 10)}</Text>
    </View>
  )
}
