import type { Group } from "./types"

interface StatsBarProps {
  groups: Group[]
}

export function StatsBar({ groups }: StatsBarProps) {
  const all = groups.flatMap(g => [...g.external, ...g.internal])

  const stats = [
    { label: "Clientes", value: groups.length,                                              color: "text-foreground"  },
    { label: "Internet", value: groups.reduce((s, g) => s + g.external.length, 0),         color: "text-cyan-400"    },
    { label: "Internos", value: groups.reduce((s, g) => s + g.internal.length, 0),         color: "text-violet-400"  },
    { label: "Online",   value: all.filter(s => s.online).length,                          color: "text-emerald-400" },
    { label: "Events",   value: all.reduce((s, x) => s + x.eventsTotal, 0).toLocaleString("en-US"), color: "text-foreground" },
  ]

  return (
    <div className="flex shrink-0 items-center border-b border-border bg-card/80 backdrop-blur-sm">
      {/* Title */}
      <div className="flex shrink-0 flex-col justify-center border-r border-border/50 px-6 py-3">
        <p className="text-sm font-semibold text-foreground leading-none">Network Map</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">Sensor topology</p>
      </div>

      {/* Stats */}
      {stats.map(({ label, value, color }) => (
        <div key={label} className="flex-1 px-4 py-3 text-center border-r border-border/50 last:border-r-0">
          <p className={`text-xl font-semibold ${color}`}>{value}</p>
          <p className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  )
}
