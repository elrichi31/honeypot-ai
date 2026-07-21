import type { Metadata } from "next"
import { forbidCliente } from "@/lib/page-guards"

export const metadata: Metadata = {
  title: "Monitoring — HoneyTrap",
}

export default async function MonitoringLayout({ children }: { children: React.ReactNode }) {
  await forbidCliente()
  return <>{children}</>
}
