export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { ProtocolServicePage } from "../protocol-service-page"

export const metadata: Metadata = { title: "MQTT Service — HoneyTrap" }

export default function MqttServicePage() {
  return <ProtocolServicePage protocol="mqtt" />
}
