export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { ProtocolServicePage } from "../protocol-service-page"

export const metadata: Metadata = { title: "MySQL Service — HoneyTrap" }

export default function MysqlServicePage() {
  return <ProtocolServicePage protocol="mysql" />
}
