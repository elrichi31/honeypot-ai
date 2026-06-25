export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { ProtocolServicePage } from "../protocol-service-page"

export const metadata: Metadata = { title: "SMB Service — HoneyTrap" }

export default function SmbServicePage() {
  return <ProtocolServicePage protocol="smb" />
}
