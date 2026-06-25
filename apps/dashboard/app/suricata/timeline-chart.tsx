"use client"

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"
import type { Stats, Range } from "./types"

export default function TimelineChart({ data, range }: { data: Stats["timeline"]; range: Range }) {
  const tz = useTimezone()
  if (!data.length) return null
  const dateOpts: Intl.DateTimeFormatOptions = range === "24h"
    ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
    : { month: "2-digit", day: "2-digit" }
  const chartData = data.map(d => ({
    label: formatInTimezone(d.bucket, tz, dateOpts),
    threats: d.threats,
    noise: d.total - d.threats,
  }))
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={chartData} barSize={range === "30d" ? 6 : 4} barGap={1}>
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#6b7280" }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} width={32} />
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: "#94a3b8" }}
        />
        <Bar dataKey="threats" stackId="a" fill="#f97316" name="Threats" radius={[0,0,0,0]} />
        <Bar dataKey="noise"   stackId="a" fill="#334155" name="Noise"   radius={[2,2,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
