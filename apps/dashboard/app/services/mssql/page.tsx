export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { ProtocolServicePage } from "../protocol-service-page"

export const metadata: Metadata = { title: "MSSQL Service — HoneyTrap" }

export default function MssqlServicePage() {
  return <ProtocolServicePage protocol="mssql" />
}
