"use client"

import dynamic from "next/dynamic"
import { Surface } from "@/components/ui/surface"

const Explorer = dynamic(() => import("./credentials-explorer"), {
  ssr: false,
  loading: () => <Surface className="h-[600px] animate-pulse" />,
})

export function CredentialsExplorerWrapper() {
  return <Explorer />
}
