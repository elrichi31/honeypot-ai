"use client"

import { useSearchParams } from "next/navigation"
import { useNavTransitionOptional } from "@/lib/use-nav-transition"
import { useT } from "@/components/locale-provider"

type Layer = "all" | "external" | "internal"

export function SensorLayerFilter() {
  const t = useT()
  const searchParams = useSearchParams()
  const { pushParams } = useNavTransitionOptional()
  const active = (searchParams.get("layer") ?? "all") as Layer

  const options: { value: Layer; labelKey: string }[] = [
    { value: "all",      labelKey: "sensors.layer.all" },
    { value: "external", labelKey: "sensors.layer.external" },
    { value: "internal", labelKey: "sensors.layer.internal" },
  ]

  const set = (value: Layer) => {
    if (value === "all") pushParams({}, ["layer"])
    else pushParams({ layer: value }, [])
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/20 p-1">
      {options.map(({ value, labelKey }) => (
        <button
          key={value}
          onClick={() => set(value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            active === value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t(labelKey as Parameters<typeof t>[0])}
        </button>
      ))}
    </div>
  )
}
