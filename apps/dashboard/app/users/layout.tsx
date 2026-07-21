import type { Metadata } from "next"
import { forbidCliente } from "@/lib/page-guards"

export const metadata: Metadata = {
  title: "Users — HoneyTrap",
}

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  await forbidCliente()
  return <>{children}</>
}
