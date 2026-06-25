export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { ProtocolServicePage } from "../protocol-service-page"

export const metadata: Metadata = { title: "FTP Service — HoneyTrap" }

export default function FtpServicePage() {
  return <ProtocolServicePage protocol="ftp" />
}
