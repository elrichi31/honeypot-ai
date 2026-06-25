import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Setup — HoneyTrap",
}

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
