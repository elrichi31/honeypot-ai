"use client"

import { useSearchParams } from "next/navigation"
import { useNavTransitionOptional } from "@/lib/use-nav-transition"
import { useT } from "@/components/locale-provider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface DeceptionNodeLite {
  sensorId: string
  name: string
}

// Radix Select forbids an empty-string item value, so "all" is the sentinel for
// "no filter" and is translated to a removed query param.
const ALL = "__all"

/**
 * Scopes the event/portscan tables of one client's deception view to a single
 * trap node (`?nodeId=`). The client dropdown this used to carry is gone: the
 * /deception index is the client selector now.
 */
export function DeceptionNodeFilter({ nodes }: { nodes: DeceptionNodeLite[] }) {
  const t = useT()
  const searchParams = useSearchParams()
  const { pushParams } = useNavTransitionOptional()
  const activeNode = searchParams.get("nodeId") ?? ""

  const onNode = (value: string) => {
    if (value === ALL) pushParams({}, ["nodeId"])
    else pushParams({ nodeId: value }, [])
  }

  return (
    <Select value={activeNode || ALL} onValueChange={onNode} disabled={nodes.length === 0}>
      <SelectTrigger size="sm" className="w-[220px] bg-muted/30" aria-label={t("deception.detail.filter")}>
        <SelectValue placeholder={t("deception.detail.filter.all")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t("deception.detail.filter.all")}</SelectItem>
        {nodes.map((n) => (
          <SelectItem key={n.sensorId} value={n.sensorId}>{n.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
