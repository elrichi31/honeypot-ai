import {
  ALL_SERVICES,
  ftpBlock,
  headerBlock,
  httpBlock,
  mysqlBlock,
  portBlock,
  sshBlock,
  suricataBlock,
  vectorOnlyBlock,
  type ServiceKey,
} from "@/lib/sensor-compose-blocks"

const DEFAULT_REGISTRY = process.env.SENSOR_REGISTRY ?? "ghcr.io/elrichi31/honeypot-ai"

export { ALL_SERVICES, type ServiceKey }

export function genDeployId(): string {
  return Math.random().toString(36).slice(2, 8)
}

export function buildCompose(
  deployId: string,
  ingestUrl: string,
  secret: string,
  services: ServiceKey[] = ALL_SERVICES,
  registry = DEFAULT_REGISTRY,
  clientSlug = "",
  clientName = "",
): string {
  const blocks = selectedServiceBlocks(services, deployId, registry)
  const volumeLines = buildVolumeLines(services)
  return [
    headerBlock(ingestUrl, secret, clientSlug, clientName),
    ...blocks,
    suricataBlock(),
    ...standaloneVectorBlock(services, deployId),
    volumeLines,
    NETWORKS,
  ].join("\n\n")
}

function selectedServiceBlocks(services: ServiceKey[], deployId: string, registry: string) {
  const blocks: string[] = []
  if (services.includes("ssh")) blocks.push(sshBlock(deployId, registry))
  if (services.includes("http")) blocks.push(httpBlock(deployId, registry))
  if (services.includes("ftp")) blocks.push(ftpBlock(deployId, registry))
  if (services.includes("mysql")) blocks.push(mysqlBlock(deployId, registry))
  if (services.includes("port")) blocks.push(portBlock(deployId, registry))
  return blocks
}

function standaloneVectorBlock(services: ServiceKey[], deployId: string) {
  return services.includes("ssh") ? [] : [vectorOnlyBlock(deployId)]
}

function buildVolumeLines(services: ServiceKey[]) {
  const volumes = ["volumes:"]
  if (services.includes("ssh")) volumes.push("  cowrie_var:")
  volumes.push("  vector_data:", "  suricata_logs:")
  return volumes.join("\n")
}

const NETWORKS = `networks:
  edge:
    driver: bridge`
