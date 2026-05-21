type Props = { data: Record<string, unknown> }

export function JsonTree({ data }: Props) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== "" && v !== undefined)
  if (entries.length === 0) return <span className="text-muted-foreground/50 text-[11px]">empty</span>
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {entries.map(([k, v]) => {
        const val = v !== null && typeof v === "object" ? JSON.stringify(v) : String(v)
        return (
          <>
            <span key={`k-${k}`} className="text-muted-foreground/60 select-none whitespace-nowrap">#{k}</span>
            <span key={`v-${k}`} className="text-foreground/80 break-all">{val}</span>
          </>
        )
      })}
    </div>
  )
}
