import { Lock } from "lucide-react"
import { NODE_H, EXT_Y, INT_LABEL_Y } from "./constants"
import type { Cluster } from "./types"

interface ClusterLayerProps {
  clusters: Cluster[]
  selectedClient: string | null
  onSelect: (key: string) => void
}

const PAD = 16
const EXT_TOP = EXT_Y - NODE_H / 2 - PAD

export function ClusterLayer({ clusters, selectedClient, onSelect }: ClusterLayerProps) {
  return (
    <>
      {clusters.map(cl => {
        const active = selectedClient === cl.key
        return (
          <div key={cl.key}>
            {/* External zone background */}
            <div
              className={`absolute rounded-2xl border transition-colors duration-200 ${
                active ? "border-cyan-400/20 bg-cyan-400/5" : "border-border/20"
              }`}
              style={{
                left:   cl.extX1,
                top:    EXT_TOP,
                width:  cl.extX2 - cl.extX1,
                height: NODE_H + PAD * 2,
                zIndex: 0,
              }}
            />

            {/* Internal zone background */}
            {cl.hasInt && (
              <div
                className={`absolute rounded-2xl border transition-colors duration-200 ${
                  active
                    ? "border-violet-400/30 bg-violet-400/[0.08]"
                    : "border-violet-400/15 bg-violet-400/[0.04]"
                }`}
                style={{
                  left:   cl.intX1,
                  top:    INT_LABEL_Y - 4,
                  width:  cl.intX2 - cl.intX1,
                  height: NODE_H + PAD * 2 + 28,
                  zIndex: 0,
                }}
              />
            )}

            {/* Internal zone label */}
            {cl.hasInt && (
              <div
                className="absolute flex items-center gap-1.5"
                style={{ left: cl.intX1 + 12, top: INT_LABEL_Y + 6, zIndex: 3 }}
              >
                <Lock className="h-3 w-3 text-violet-400/55" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/65">
                  Red Interna
                </span>
              </div>
            )}

            {/* Client name badge */}
            <div
              className="absolute flex justify-center"
              style={{ left: cl.extX1, top: EXT_TOP - 42, width: cl.extX2 - cl.extX1, zIndex: 4 }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onSelect(cl.key) }}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-all ${
                  active
                    ? "border-cyan-400/40 bg-cyan-400/10 text-foreground shadow-[0_0_12px_rgb(34,211,238,0.25)]"
                    : "border-border/60 bg-card/80 text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {cl.name}
              </button>
            </div>
          </div>
        )
      })}
    </>
  )
}
