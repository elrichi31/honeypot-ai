import type { Metadata } from "next"
import { forbidCliente } from "@/lib/page-guards"

export const metadata: Metadata = {
  title: "Sessions — HoneyTrap",
}

export default async function SessionsAdminLayout({ children }: { children: React.ReactNode }) {
  await forbidCliente()
  return <>{children}</>
}
