import {
  ALL_SERVICES,
  deceptionBlock,
  ftpBlock,
  headerBlock,
  httpBlock,
  internalCanaryBlock,
  intHttpBlock,
  intMysqlBlock,
  intSmbBlock,
  intSshBlock,
  mysqlBlock,
  portBlock,
  smbBlock,
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
  rawBase = "",
): string {
  const isInternalCanary = services.includes("internal-canary")
  const blocks = selectedServiceBlocks(services, deployId, registry, rawBase)
  const volumeLines = buildVolumeLines(services)
  // Internal canary is a standalone LAN deploy — no Suricata (no internet iface)
  // and no standard edge network.
  const extraBlocks = isInternalCanary ? [] : [suricataBlock(registry), ...standaloneVectorBlock(services, deployId)]
  return [
    headerBlock(ingestUrl, secret, clientSlug, clientName),
    ...blocks,
    ...extraBlocks,
    volumeLines,
    buildNetworks(services),
  ].join("\n\n")
}

function selectedServiceBlocks(services: ServiceKey[], deployId: string, registry: string, rawBase: string) {
  // Internal canary is a fully standalone compose — mutually exclusive with all
  // other services which are internet-facing DMZ sensors.
  if (services.includes("internal-canary")) {
    return [internalCanaryBlock(deployId, registry)]
  }
  // Internal deception nodes — a single VM with the LAN IP, no Suricata/edge net.
  const isInternal = services.some(s => (s as string).startsWith("int-"))
  if (isInternal) {
    const blocks: string[] = []
    if (services.includes("int-smb"))   blocks.push(intSmbBlock(deployId, registry))
    if (services.includes("int-mysql")) blocks.push(intMysqlBlock(deployId, registry))
    if (services.includes("int-ssh"))   blocks.push(intSshBlock(deployId, registry))
    if (services.includes("int-http"))  blocks.push(intHttpBlock(deployId, registry))
    return blocks
  }
  const withDeception = services.includes("deception")
  const blocks: string[] = []
  // When deception is on, cowrie must also join deception_net at 10.0.1.100 so
  // attackers can pivot from the SSH honeypot into the internal trap nodes.
  if (services.includes("ssh")) blocks.push(attachCowrieToDeception(sshBlock(deployId, registry), withDeception))
  if (services.includes("http")) blocks.push(httpBlock(deployId, registry))
  if (services.includes("ftp")) blocks.push(ftpBlock(deployId, registry))
  if (services.includes("mysql")) blocks.push(mysqlBlock(deployId, registry))
  if (services.includes("port")) blocks.push(portBlock(deployId, registry))
  if (services.includes("smb")) blocks.push(smbBlock(deployId, rawBase))
  if (withDeception) blocks.push(deceptionBlock(deployId, registry))
  return blocks
}

// Rewrite cowrie's `networks: - edge` to also attach deception_net with a fixed
// IP. Only the cowrie service block uses that exact `- edge` line followed by
// `pids_limit: 256`, so the replace is unambiguous within the ssh block.
function attachCowrieToDeception(sshBlockText: string, withDeception: boolean): string {
  if (!withDeception) return sshBlockText
  return sshBlockText.replace(
    `    networks:
      - edge
    pids_limit: 256`,
    `    networks:
      edge:
      deception_net:
        ipv4_address: 10.0.1.100
    pids_limit: 256`,
  )
}

function standaloneVectorBlock(services: ServiceKey[], deployId: string) {
  return services.includes("ssh") ? [] : [vectorOnlyBlock(deployId)]
}

function buildVolumeLines(services: ServiceKey[]) {
  if (services.includes("internal-canary")) {
    return [
      "volumes:",
      "  ic_cowrie_var:",
      "  ic_vector_data:",
      "  ic_opencanary_logs:",
      "  ic_opencanary_shipper_state:",
    ].join("\n")
  }
  const volumes = ["volumes:"]
  if (services.includes("ssh")) volumes.push("  cowrie_var:")
  volumes.push("  vector_data:", "  suricata_logs:")
  if (services.includes("smb")) volumes.push("  smb_share:", "  smb_captures:")
  if (services.includes("deception")) volumes.push("  opencanary_logs:", "  opencanary_shipper_state:")
  return volumes.join("\n")
}

function buildNetworks(services: ServiceKey[]) {
  if (services.includes("internal-canary")) {
    return `networks:
  ic_net:
    driver: bridge`
  }
  const base = `networks:
  edge:
    driver: bridge`
  if (!services.includes("deception")) return base
  // Internal deception subnet — fixed IPs (10.0.1.x) match cowrie's /etc/hosts.
  return `${base}
  deception_net:
    driver: bridge
    ipam:
      config:
        - subnet: 10.0.1.0/24
          gateway: 10.0.1.1`
}
