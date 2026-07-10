"use client"

import { useSearchParams } from "next/navigation"
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox"
import { NavTransitionProvider, useNavTransition } from "@/lib/use-nav-transition"
import { useT } from "@/components/locale-provider"
import { LEVEL_STYLES } from "@/lib/attack-types"
import type { RiskLevel } from "@/lib/api"

const PERIODS = ["24h", "7d", "30d", "90d"] as const
type Period = (typeof PERIODS)[number]

const RISK_LEVELS: RiskLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]
const LEVEL_OPTIONS: MultiSelectOption[] = RISK_LEVELS.map((lvl) => ({
  value: lvl,
  label: lvl,
  dotClassName: LEVEL_STYLES[lvl].dot,
}))

function FiltersInner() {
  const t = useT()
  const searchParams = useSearchParams()
  const { pushParams } = useNavTransition()

  const period = (searchParams.get("period") ?? "90d") as Period
  const levels = (searchParams.get("levels") ?? "").split(",").filter(Boolean)

  function setLevels(next: string[]) {
    if (next.length === 0) pushParams({}, ["levels"])
    else pushParams({ levels: next.join(",") })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => pushParams({ period: p })}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              period === p
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`threats.period.${p}`)}
          </button>
        ))}
      </div>

      <MultiSelectCombobox
        label={t("threats.table.level")}
        options={LEVEL_OPTIONS}
        selected={levels}
        onChange={setLevels}
      />
    </div>
  )
}

export function IocFilters() {
  return (
    <NavTransitionProvider>
      <FiltersInner />
    </NavTransitionProvider>
  )
}
