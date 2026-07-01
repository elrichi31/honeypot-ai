import React from "react"
import { View, Text, Svg, Rect, Line, G, Path } from "@react-pdf/renderer"
import { C } from "./pdf-ui"
import type { ReportDailyBucket, ReportHourBucket, ReportLabelCount } from "../types"

const COLORS = [C.indigo, C.purple, C.blue, C.amber, C.green, C.red, "#06b6d4", "#f97316", "#84cc16", "#ec4899"]

interface BarChartProps {
  data: ReportLabelCount[]
  width?: number
  height?: number
  title?: string
  maxBars?: number
  color?: string
}

export function BarChart({ data, width = 240, height = 110, title, maxBars = 10, color }: BarChartProps) {
  const items = data.slice(0, maxBars)
  if (items.length === 0) return null

  const padLeft = 6
  const padRight = 6
  const padTop = title ? 14 : 6
  const padBottom = 28
  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom

  const maxVal = Math.max(...items.map((d) => d.count), 1)
  const barW = Math.max(4, (chartW / items.length) * 0.7)
  const gap = chartW / items.length

  const yTicks = 4
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((maxVal / yTicks) * i))

  return (
    <View style={{ width, marginBottom: 6 }}>
      {title ? (
        <Text style={{ fontSize: 7, color: C.textMuted, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {title}
        </Text>
      ) : null}
      <Svg width={width} height={height - (title ? 0 : 14)}>
        {/* Y grid lines */}
        {tickVals.map((val, i) => {
          const y = padTop + chartH - (val / maxVal) * chartH
          return (
            <G key={i}>
              <Line
                x1={padLeft} y1={y} x2={padLeft + chartW} y2={y}
                stroke={C.grayBorder} strokeWidth={0.4}
              />
            </G>
          )
        })}
        {/* Bars */}
        {items.map((item, i) => {
          const barH = Math.max(1, (item.count / maxVal) * chartH)
          const x = padLeft + i * gap + (gap - barW) / 2
          const y = padTop + chartH - barH
          const barColor = color ?? COLORS[i % COLORS.length]
          return (
            <G key={i}>
              <Rect x={x} y={y} width={barW} height={barH} rx={1.5} fill={barColor} opacity={0.85} />
            </G>
          )
        })}
        {/* X labels */}
        {items.map((item, i) => {
          const x = padLeft + i * gap + gap / 2
          const label = item.label.length > 9 ? item.label.slice(0, 8) + "…" : item.label
          return (
            <G key={i}>
              <Text
                style={{
                  fontSize: 5.5,
                  color: C.textMuted,
                  // @ts-expect-error react-pdf text inside SVG uses x/y
                  x: x,
                  y: padTop + chartH + 8,
                  textAnchor: "middle",
                }}
              >
                {label}
              </Text>
            </G>
          )
        })}
      </Svg>
    </View>
  )
}

interface ActivityTimelineProps {
  data: ReportDailyBucket[]
  width?: number
  height?: number
  color?: string
}

export function ActivityTimeline({ data, width = 500, height = 80, color = C.indigo }: ActivityTimelineProps) {
  if (data.length < 2) return null

  const padLeft = 4
  const padRight = 4
  const padTop = 6
  const padBottom = 18
  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom

  const maxVal = Math.max(...data.map((d) => d.count), 1)
  const step = chartW / (data.length - 1)

  const points = data.map((d, i) => ({
    x: padLeft + i * step,
    y: padTop + chartH - (d.count / maxVal) * chartH,
    d,
  }))

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ")

  const areaD =
    `M ${points[0].x.toFixed(1)} ${(padTop + chartH).toFixed(1)} ` +
    points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") +
    ` L ${points[points.length - 1].x.toFixed(1)} ${(padTop + chartH).toFixed(1)} Z`

  // Show every Nth label to avoid overlap
  const labelEvery = Math.ceil(data.length / 7)

  return (
    <Svg width={width} height={height}>
      {/* Area fill */}
      <Path d={areaD} fill={color} opacity={0.12} />
      {/* Line */}
      <Path d={pathD} stroke={color} strokeWidth={1.2} fill="none" />
      {/* Dots */}
      {points.map((p, i) => (
        <Rect key={i} x={p.x - 1.5} y={p.y - 1.5} width={3} height={3} rx={1.5} fill={color} />
      ))}
      {/* X date labels */}
      {points
        .filter((_, i) => i % labelEvery === 0 || i === points.length - 1)
        .map((p, i) => (
          <Text
            key={i}
            style={{
              fontSize: 5.5,
              color: C.textMuted,
              // @ts-expect-error react-pdf SVG text
              x: p.x,
              y: padTop + chartH + 10,
              textAnchor: "middle",
            }}
          >
            {p.d.date.slice(5)} {/* MM-DD */}
          </Text>
        ))}
    </Svg>
  )
}

interface HourHeatmapProps {
  data: ReportHourBucket[]
  width?: number
}

export function HourHeatmap({ data, width = 500 }: HourHeatmapProps) {
  if (data.length === 0) return null

  const allHours: ReportHourBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: data.find((d) => d.hour === h)?.count ?? 0,
  }))

  const maxVal = Math.max(...allHours.map((d) => d.count), 1)
  const cellW = (width - 20) / 24
  const cellH = 14

  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={{ fontSize: 6.5, color: C.textMuted, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Attack Intensity by Hour (UTC)
      </Text>
      <Svg width={width} height={cellH + 14}>
        {allHours.map((b) => {
          const intensity = b.count / maxVal
          const x = 20 + b.hour * cellW
          // Blue gradient: light at 0, deep indigo at max
          const alpha = 0.08 + intensity * 0.85
          return (
            <G key={b.hour}>
              <Rect
                x={x + 0.5} y={0} width={cellW - 1} height={cellH}
                rx={2}
                fill={C.indigo}
                opacity={alpha}
              />
              <Text
                style={{
                  fontSize: 5,
                  color: intensity > 0.5 ? C.white : C.textMuted,
                  // @ts-expect-error react-pdf SVG text
                  x: x + cellW / 2,
                  y: cellH + 8,
                  textAnchor: "middle",
                }}
              >
                {b.hour.toString().padStart(2, "0")}
              </Text>
            </G>
          )
        })}
      </Svg>
    </View>
  )
}

interface HorizontalBarChartProps {
  data: ReportLabelCount[]
  width?: number
  maxBars?: number
  title?: string
}

export function HorizontalBarChart({ data, width = 240, maxBars = 8, title }: HorizontalBarChartProps) {
  const items = data.slice(0, maxBars)
  if (items.length === 0) return null

  const maxVal = Math.max(...items.map((d) => d.count), 1)
  const barH = 9
  const gap = 3
  const labelW = 80
  const barAreaW = width - labelW - 36
  const totalH = items.length * (barH + gap) + (title ? 14 : 4)

  return (
    <View style={{ width, marginBottom: 6 }}>
      {title ? (
        <Text style={{ fontSize: 7, color: C.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {title}
        </Text>
      ) : null}
      <Svg width={width} height={totalH - (title ? 14 : 4)}>
        {items.map((item, i) => {
          const filledW = Math.max(2, (item.count / maxVal) * barAreaW)
          const y = i * (barH + gap)
          const label = item.label.length > 13 ? item.label.slice(0, 12) + "…" : item.label
          const barColor = COLORS[i % COLORS.length]
          return (
            <G key={i}>
              {/* Background track */}
              <Rect x={labelW} y={y + 1} width={barAreaW} height={barH - 2} rx={2} fill={C.grayLight} />
              {/* Filled bar */}
              <Rect x={labelW} y={y + 1} width={filledW} height={barH - 2} rx={2} fill={barColor} opacity={0.85} />
              {/* Label */}
              <Text
                style={{
                  fontSize: 6,
                  color: C.textMid,
                  // @ts-expect-error react-pdf SVG text
                  x: labelW - 3,
                  y: y + barH - 2,
                  textAnchor: "end",
                }}
              >
                {label}
              </Text>
              {/* Value */}
              <Text
                style={{
                  fontSize: 6,
                  color: C.textMuted,
                  // @ts-expect-error react-pdf SVG text
                  x: labelW + filledW + 3,
                  y: y + barH - 2,
                }}
              >
                {item.count.toLocaleString()}
              </Text>
            </G>
          )
        })}
      </Svg>
    </View>
  )
}
