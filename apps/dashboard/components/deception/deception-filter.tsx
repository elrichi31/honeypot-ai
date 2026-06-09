"use client"

import { useSearchParams } from "next/navigation"
import { useNavTransitionOptional } from "@/lib/use-nav-transition"
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
  clientSlug: string | null
  clientName: string | null
}

export interface ClientLite {
  slug: string
  name: string
}

// Radix Select forbids an empty-string item value, so "all" is the sentinel for
// "no filter" and is translated to a removed query param.
const ALL = "__all"

/**
 * Two linked dropdowns to scope the deception network view. Each client owns one
 * deception network (its OpenCanary trap nodes), so the client dropdown doubles
 * as the "deception group" filter — picking a client narrows to that group's
 * nodes. The second dropdown then scopes to a single trap node (`?nodeId=`).
 * Defaults to "all" so the global aggregated view stays the default. Mirrors the
 * web-attacks ClientSensorFilter so both pages feel the same.
 */
export function DeceptionFilter({
  clients,
  nodes,
}: {
  clients: ClientLite[]
  nodes: DeceptionNodeLite[]
}) {
  const searchParams = useSearchParams()
  const { pushParams } = useNavTransitionOptional()
  const activeClient = searchParams.get("clientSlug") ?? ""
  const activeNode = searchParams.get("nodeId") ?? ""

  const nodesForClient = activeClient
    ? nodes.filter((n) => n.clientSlug === activeClient)
    : nodes

  const onClient = (value: string) => {
    if (value === ALL) pushParams({}, ["clientSlug", "nodeId"])
    else pushParams({ clientSlug: value }, ["nodeId"])
  }
  const onNode = (value: string) => {
    if (value === ALL) pushParams({}, ["nodeId"])
    else pushParams({ nodeId: value }, [])
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={activeClient || ALL} onValueChange={onClient}>
        <SelectTrigger size="sm" className="w-[180px] bg-muted/30" aria-label="Filtrar por grupo de deception">
          <SelectValue placeholder="Todas las redes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas las redes</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={activeNode || ALL}
        onValueChange={onNode}
        disabled={nodesForClient.length === 0}
      >
        <SelectTrigger size="sm" className="w-[200px] bg-muted/30" aria-label="Filtrar por nodo trampa">
          <SelectValue placeholder="Todos los nodos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los nodos</SelectItem>
          {nodesForClient.map((n) => (
            <SelectItem key={n.sensorId} value={n.sensorId}>
              {n.name}{n.clientName && !activeClient ? ` · ${n.clientName}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
