import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sessions — HoneyTrap",
}

export default function SessionsAdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
