// Server-only: builds the complete A4 HTML string for the PDF report.
// Charts are hand-written SVG so we avoid pulling recharts into server context.
import type { ClientReportData } from "./types"
import type { TranslationKey } from "@/lib/i18n/dictionaries"

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string

// ── SVG chart helpers ─────────────────────────────────────────────────────────

function barChart(
  data: { label: string; value: number }[],
  opts: { width?: number; height?: number; color?: string } = {},
): string {
  const { width = 520, height = 160, color = "#6366f1" } = opts
  if (!data.length) return `<p style="color:#6b7280;font-size:12px">—</p>`
  const max = Math.max(...data.map((d) => d.value), 1)
  const barW = Math.floor((width - (data.length - 1) * 4) / data.length)
  const bars = data
    .map((d, i) => {
      const h = Math.max(4, Math.round((d.value / max) * (height - 28)))
      const x = i * (barW + 4)
      const y = height - 24 - h
      const labelX = x + barW / 2
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="2" fill="${color}" opacity="0.85"/>
        <text x="${labelX}" y="${height - 8}" text-anchor="middle" font-size="9" fill="#9ca3af">${d.label}</text>`
    })
    .join("")
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`
}

function donutChart(
  slices: { label: string; value: number; color: string }[],
  size = 120,
): string {
  const total = slices.reduce((s, d) => s + d.value, 0)
  if (!total) return `<p style="color:#6b7280;font-size:12px">—</p>`
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.36
  const ri = size * 0.22
  let angle = -Math.PI / 2
  const paths: string[] = []
  for (const slice of slices) {
    const sweep = (slice.value / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(angle)
    const y1 = cy + r * Math.sin(angle)
    const x2 = cx + r * Math.cos(angle + sweep)
    const y2 = cy + r * Math.sin(angle + sweep)
    const ix1 = cx + ri * Math.cos(angle)
    const iy1 = cy + ri * Math.sin(angle)
    const ix2 = cx + ri * Math.cos(angle + sweep)
    const iy2 = cy + ri * Math.sin(angle + sweep)
    const large = sweep > Math.PI ? 1 : 0
    paths.push(
      `<path d="M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${ri},${ri} 0 ${large},0 ${ix1},${iy1} Z" fill="${slice.color}" opacity="0.9"/>`,
    )
    angle += sweep
  }
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${paths.join("")}</svg>`
}

// ── Section renderers ─────────────────────────────────────────────────────────

function kpiCard(label: string, value: string, delta?: string | null): string {
  const deltaHtml = delta
    ? `<div style="font-size:11px;color:${delta.startsWith("-") ? "#ef4444" : "#22c55e"};margin-top:2px">${delta}</div>`
    : ""
  return `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;min-width:120px;flex:1">
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">${label}</div>
      <div style="font-size:22px;font-weight:700;color:#111827">${value}</div>
      ${deltaHtml}
    </div>`
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—"
  return n.toLocaleString("en-US")
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—"
  return `${n.toFixed(1)}%`
}

function delta(d: number | null | undefined): string | null {
  if (d == null) return null
  const sign = d >= 0 ? "+" : ""
  return `${sign}${d.toFixed(1)}%`
}

function sectionHeader(title: string): string {
  return `
    <div style="margin:32px 0 12px;display:flex;align-items:center;gap:10px">
      <div style="width:4px;height:20px;background:#6366f1;border-radius:2px;flex-shrink:0"></div>
      <h2 style="margin:0;font-size:15px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:0.04em">${title}</h2>
    </div>`
}

function table(headers: string[], rows: string[][]): string {
  const ths = headers
    .map(
      (h) =>
        `<th style="text-align:left;padding:7px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #e5e7eb">${h}</th>`,
    )
    .join("")
  const trs = rows
    .map(
      (row, ri) =>
        `<tr style="background:${ri % 2 === 0 ? "#fff" : "#f9fafb"}">${row
          .map((cell) => `<td style="padding:7px 10px;font-size:12px;color:#374151;border-bottom:1px solid #f3f4f6">${cell}</td>`)
          .join("")}</tr>`,
    )
    .join("")
  return `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export function renderReportHtml(data: ClientReportData, t: T): string {
  const { meta, overview, kpiTrends, timeline, mitre, botRatio, insights, geo, topCredentials } = data

  // ── KPI section ──
  const totalTechniques = mitre.tactics.reduce((s, tac) => s + tac.techniques.length, 0)
  const kpis = `
    <div style="display:flex;flex-wrap:wrap;gap:10px">
      ${kpiCard(t("reports.kpi.events"), fmt(kpiTrends.events.current), delta(kpiTrends.events.deltaPct))}
      ${kpiCard(t("reports.kpi.sessions"), fmt(kpiTrends.sshSessions.current), delta(kpiTrends.sshSessions.deltaPct))}
      ${kpiCard(t("reports.kpi.uniqueIps"), fmt(kpiTrends.uniqueIps.current), delta(kpiTrends.uniqueIps.deltaPct))}
      ${kpiCard(t("reports.kpi.webHits"), fmt(kpiTrends.webHits.current), delta(kpiTrends.webHits.deltaPct))}
      ${kpiCard(t("reports.kpi.successLogins"), fmt(overview.ssh.successfulLogins))}
      ${kpiCard(t("reports.kpi.mitreTactics"), fmt(mitre.tactics.length))}
      ${kpiCard(t("reports.kpi.mitreTechniques"), fmt(totalTechniques))}
    </div>`

  // ── Timeline chart ──
  const activeProtocols = timeline.activeProtocols.slice(0, 1)
  const primaryProtocol = activeProtocols[0] ?? "ssh"
  const timelineData = timeline.buckets.slice(-30).map((b) => ({
    label: typeof b["label"] === "string" ? (b["label"] as string).slice(5) : "",
    value: typeof b[primaryProtocol] === "number" ? (b[primaryProtocol] as number) : 0,
  }))
  const timelineChart = barChart(timelineData, { width: 520, height: 140, color: "#6366f1" })

  // ── Bot/Human donut ──
  const donut = donutChart(
    [
      { label: t("reports.chart.bot"), value: botRatio.bot, color: "#ef4444" },
      { label: t("reports.chart.human"), value: botRatio.human, color: "#22c55e" },
      { label: t("reports.chart.unknown"), value: botRatio.unknown, color: "#9ca3af" },
    ],
    120,
  )

  // ── Geo bar chart ──
  const geoChart = barChart(
    geo.slice(0, 12).map((g) => ({ label: g.country.slice(0, 15), value: g.count })),
    { width: 520, height: 140, color: "#8b5cf6" },
  )

  // ── MITRE table ──
  const mitreRows = mitre.tactics.flatMap((tac) =>
    tac.techniques.slice(0, 5).map((tech) => [tac.tactic, `${tech.id} — ${tech.name}`, fmt(tech.count)]),
  ).slice(0, 20)

  // ── Funnel ──
  const funnel = insights.funnel
  const funnelMax = Math.max(funnel.connections, 1)
  function funnelBar(label: string, value: number): string {
    const w = Math.max(6, Math.round((value / funnelMax) * 100))
    return `
      <div style="display:flex;align-items:center;gap:10px;margin:4px 0">
        <div style="font-size:11px;color:#374151;width:160px;flex-shrink:0">${label}</div>
        <div style="background:#e5e7eb;border-radius:4px;flex:1;height:16px;overflow:hidden">
          <div style="width:${w}%;background:#6366f1;height:16px;border-radius:4px;opacity:0.85"></div>
        </div>
        <div style="font-size:11px;color:#374151;width:50px;text-align:right">${fmt(value)}</div>
      </div>`
  }

  // ── Credentials table ──
  const credRows = topCredentials.slice(0, 10).map((c) => [
    c.username ?? "—",
    c.password ?? "—",
    fmt(c.attempts),
    fmt(c.successCount),
  ])

  // ── Recurring IPs ──
  const recurringRows = insights.recurringIps.slice(0, 8).map((ip) => [
    ip.srcIp,
    fmt(ip.totalSessions),
    fmt(ip.credentialCount),
    ip.firstSeen ? new Date(ip.firstSeen).toLocaleDateString("en-US") : "—",
    ip.lastSeen ? new Date(ip.lastSeen).toLocaleDateString("en-US") : "—",
  ])

  // ── Command patterns ──
  const cmdRows = insights.commandPatterns.slice(0, 8).map((c) => [
    `<code style="font-size:10px;background:#f3f4f6;padding:2px 4px;border-radius:3px">${c.sequence.replace(/</g, "&lt;").slice(0, 80)}</code>`,
    fmt(c.sessions),
    fmt(c.uniqueIps),
  ])

  // ── Web section (only if web activity) ──
  const hasWeb = (overview.web.hits ?? 0) > 0
  const webSection = hasWeb
    ? `${sectionHeader(t("reports.section.web"))}
       <div style="display:flex;gap:14px;flex-wrap:wrap">
         ${kpiCard("Total Hits", fmt(overview.web.hits))}
         ${kpiCard("Unique IPs", fmt(overview.web.uniqueIps))}
         ${kpiCard("Top Attack Type", overview.web.topAttackType ?? "—")}
       </div>`
    : ""

  // ── Full HTML ──────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: #fff; color: #111827; font-size: 13px; line-height: 1.5; }
  @page { size: A4; margin: 18mm 18mm 20mm 18mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  .page-break { page-break-before: always; }
  code { font-family: 'SFMono-Regular', Consolas, monospace; }
</style>
</head>
<body>

<!-- ── Cover ──────────────────────────────────────────────────────────────── -->
<div style="min-height:200px;background:linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#4338ca 100%);border-radius:12px;padding:40px 44px;color:#fff;margin-bottom:28px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.7;margin-bottom:8px">Security Report</div>
      <h1 style="font-size:30px;font-weight:800;margin-bottom:4px">${meta.clientName}</h1>
      <div style="font-size:14px;opacity:0.8">${meta.periodLabel}</div>
    </div>
    <div style="text-align:right;opacity:0.7;font-size:11px">
      <div style="margin-bottom:3px">${t("reports.footer.generated")}: ${new Date(meta.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
      <div style="font-size:10px;margin-top:6px;opacity:0.6">HoneyTrap Platform</div>
    </div>
  </div>
  <div style="margin-top:28px;display:flex;gap:28px;flex-wrap:wrap">
    <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:12px 20px;min-width:100px;text-align:center">
      <div style="font-size:26px;font-weight:700">${fmt(kpiTrends.events.current)}</div>
      <div style="font-size:10px;opacity:0.75;text-transform:uppercase;letter-spacing:0.05em">${t("reports.kpi.events")}</div>
    </div>
    <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:12px 20px;min-width:100px;text-align:center">
      <div style="font-size:26px;font-weight:700">${fmt(kpiTrends.uniqueIps.current)}</div>
      <div style="font-size:10px;opacity:0.75;text-transform:uppercase;letter-spacing:0.05em">${t("reports.kpi.uniqueIps")}</div>
    </div>
    <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:12px 20px;min-width:100px;text-align:center">
      <div style="font-size:26px;font-weight:700">${mitre.tactics.length}</div>
      <div style="font-size:10px;opacity:0.75;text-transform:uppercase;letter-spacing:0.05em">${t("reports.kpi.mitreTactics")}</div>
    </div>
    <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:12px 20px;min-width:100px;text-align:center">
      <div style="font-size:26px;font-weight:700">${pct(botRatio.botPct)}</div>
      <div style="font-size:10px;opacity:0.75;text-transform:uppercase;letter-spacing:0.05em">${t("reports.kpi.botPct")}</div>
    </div>
  </div>
</div>

<!-- ── Executive Summary ───────────────────────────────────────────────────── -->
${sectionHeader(t("reports.section.executive"))}
${kpis}

<!-- ── Timeline ───────────────────────────────────────────────────────────── -->
${sectionHeader(t("reports.section.timeline"))}
<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px">
  <div style="font-size:11px;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em">${t("reports.chart.activity")}</div>
  ${timelineChart}
</div>

<!-- ── Threat Intelligence ────────────────────────────────────────────────── -->
${sectionHeader(t("reports.section.threats"))}
${mitreRows.length
    ? table(
        [t("reports.mitre.tactic"), t("reports.mitre.techniques"), t("reports.mitre.hits")],
        mitreRows,
      )
    : `<p style="color:#6b7280;font-size:12px">${t("reports.noActivity")}</p>`}

<!-- ── Credentials ────────────────────────────────────────────────────────── -->
${sectionHeader(t("reports.section.credentials"))}
<h3 style="font-size:12px;color:#6b7280;margin-bottom:8px;font-weight:600">${t("reports.creds.topPairs")}</h3>
${credRows.length
    ? table(
        [t("reports.creds.username"), t("reports.creds.password"), t("reports.creds.attempts"), t("reports.creds.successes")],
        credRows,
      )
    : `<p style="color:#6b7280;font-size:12px">${t("reports.noActivity")}</p>`}

<!-- ── Reconnaissance ─────────────────────────────────────────────────────── -->
${sectionHeader(t("reports.section.reconnaissance"))}
<div style="margin-bottom:14px">
  <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">${t("reports.chart.funnel")}</div>
  ${funnelBar(t("reports.funnel.connections"), funnel.connections)}
  ${funnelBar(t("reports.funnel.authAttempts"), funnel.authAttempts)}
  ${funnelBar(t("reports.funnel.loginSuccess"), funnel.loginSuccess)}
  ${funnelBar(t("reports.funnel.commands"), funnel.commands)}
  ${funnelBar(t("reports.funnel.compromise"), funnel.highSignalCompromise)}
</div>

${cmdRows.length ? `
<h3 style="font-size:12px;color:#374151;margin-bottom:8px;font-weight:600">Top Command Patterns</h3>
${table(["Command Sequence", "Sessions", "Unique IPs"], cmdRows)}` : ""}

${recurringRows.length ? `
<h3 style="font-size:12px;color:#374151;margin:14px 0 8px;font-weight:600">${t("reports.creds.recurringIps")}</h3>
${table(["IP", "Sessions", "Credentials", "First Seen", "Last Seen"], recurringRows)}` : ""}

<!-- ── Geo ────────────────────────────────────────────────────────────────── -->
${sectionHeader(t("reports.section.geo"))}
<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px">
  <div style="font-size:11px;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em">${t("reports.chart.geo")}</div>
  ${geoChart}
</div>

<!-- ── Classification ────────────────────────────────────────────────────── -->
${sectionHeader(t("reports.section.classification"))}
<div style="display:flex;align-items:center;gap:28px">
  ${donut}
  <div style="display:flex;flex-direction:column;gap:8px">
    <div style="display:flex;align-items:center;gap:8px">
      <div style="width:12px;height:12px;border-radius:50%;background:#ef4444;flex-shrink:0"></div>
      <span style="font-size:12px">${t("reports.chart.bot")}: <strong>${fmt(botRatio.bot)}</strong> (${pct(botRatio.botPct)})</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <div style="width:12px;height:12px;border-radius:50%;background:#22c55e;flex-shrink:0"></div>
      <span style="font-size:12px">${t("reports.chart.human")}: <strong>${fmt(botRatio.human)}</strong> (${pct(botRatio.humanPct)})</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <div style="width:12px;height:12px;border-radius:50%;background:#9ca3af;flex-shrink:0"></div>
      <span style="font-size:12px">${t("reports.chart.unknown")}: <strong>${fmt(botRatio.unknown)}</strong></span>
    </div>
  </div>
</div>

${webSection}

<!-- ── Footer ─────────────────────────────────────────────────────────────── -->
<div style="margin-top:40px;border-top:1px solid #e5e7eb;padding-top:12px;display:flex;justify-content:space-between;color:#9ca3af;font-size:10px">
  <span>${t("reports.footer.confidential")}</span>
  <span>HoneyTrap Platform · ${new Date(meta.generatedAt).toISOString().slice(0, 10)}</span>
</div>

</body>
</html>`
}
