import type { Metadata } from "next"
import { forbidCliente } from "@/lib/page-guards"

export const metadata: Metadata = {
  title: "Settings — HoneyTrap",
}

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await forbidCliente()
  return <>{children}</>
}
