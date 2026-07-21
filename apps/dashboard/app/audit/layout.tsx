import type { Metadata } from "next"
import { forbidCliente } from "@/lib/page-guards"

export const metadata: Metadata = {
  title: "Audit Log — HoneyTrap",
}

export default async function AuditLayout({ children }: { children: React.ReactNode }) {
  await forbidCliente()
  return <>{children}</>
}
