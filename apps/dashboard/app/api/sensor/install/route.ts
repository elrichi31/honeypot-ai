import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"

const REGISTRY = "ghcr.io/elrichi31/honeypot-ai"
const RAW_BASE = "https://raw.githubusercontent.com/elrichi31/honeypot-ai/master"

export type ServiceKey = "ssh" | "http" | "ftp" | "mysql" | "port"
export const ALL_SERVICES: ServiceKey[] = ["ssh", "http", "ftp", "mysql", "port"]

async function resolveIngestUrl(): Promise<string | null> {
  if (process.env.SENSOR_INGEST_URL) return process.env.SENSOR_INGEST_URL
  const configured = process.env.NEXT_PUBLIC_API_URL ?? ""
  if (configured && !configured.includes("localhost") && !configured.includes("127.0.0.1")) {
    return configured
  }
  try {
    const res = await fetch("https://api.ipify.org?format=text", { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error()
    return `http://${(await res.text()).trim()}:3000`
  } catch {
    return null
  }
}

const HEADER = (ingestUrl: string, secret: string, clientSlug = "", clientName = "") => [
  "x-service-defaults: &service-defaults",
  "  restart: unless-stopped",
  "  init: true",
  "  security_opt:",
  "    - no-new-privileges:true",
  "  cap_drop:",
  "    - ALL",
  "",
  "x-json-logging: &json-logging",
  "  driver: json-file",
  "  options:",
  '    max-size: "10m"',
  '    max-file: "5"',
  "",
  "x-ingest: &ingest",
  `  INGEST_API_URL: "${ingestUrl}"`,
  `  INGEST_SHARED_SECRET: "${secret}"`,
  ...(clientSlug ? [`  CLIENT_SLUG: "${clientSlug}"`, `  CLIENT_NAME: "${clientName || clientSlug}"`] : []),
  "",
  "services:",
]

const SSH_BLOCK = [
  "  cowrie:",
  "    <<: *service-defaults",
  "    logging: *json-logging",
  `    image: ${REGISTRY}/cowrie:latest`,
  "    container_name: cowrie",
  "    ports:",
  '      - "22:2222"',
  '      - "2222:2222"',
  "    volumes:",
  "      - cowrie_var:/cowrie/cowrie-git/var",
  "      - ./cowrie.cfg:/cowrie/cowrie-git/etc/cowrie.cfg:ro",
  "      - ./userdb.txt:/cowrie/cowrie-git/etc/userdb.txt:ro",
  "    networks:",
  "      - edge",
  "    pids_limit: 256",
  "",
  "  cowrie-beacon:",
  "    <<: *service-defaults",
  "    logging: *json-logging",
  "    image: python:3.12-alpine",
  "    container_name: cowrie-beacon",
  "    environment:",
  "      <<: *ingest",
  "      SENSOR_ID: cowrie-ssh-01",
  '      SENSOR_NAME: "SSH Honeypot (Cowrie)"',
  '      SENSOR_IP: ""',
  "      SENSOR_PROTOCOL: ssh",
  "      SENSOR_VERSION: cowrie",
  '      SENSOR_PORTS: "22 2222"',
  '      SENSOR_PROBE_PORTS: "2222 2222"',
  "      SENSOR_HOST: cowrie",
  "    volumes:",
  "      - ./heartbeat.py:/heartbeat.py:ro",
  '    command: ["python3", "/heartbeat.py"]',
  "    networks:",
  "      - edge",
  "    pids_limit: 16",
  "",
  "  vector:",
  "    <<: *service-defaults",
  "    logging: *json-logging",
  "    image: timberio/vector:0.40.0-alpine",
  "    container_name: vector",
  "    depends_on:",
  "      - cowrie",
  "    volumes:",
  "      - cowrie_var:/cowrie/cowrie-git/var:ro",
  "      - suricata_logs:/tmp/suricata-logs:ro",
  "      - falco_logs:/var/log/falco:ro",
  "      - ./cowrie.toml:/etc/vector/cowrie.toml:ro",
  "      - ./suricata.toml:/etc/vector/suricata.toml:ro",
  "      - ./falco.toml:/etc/vector/falco.toml:ro",
  "      - vector_data:/var/lib/vector",
  '    command: ["--config", "/etc/vector/cowrie.toml", "--config", "/etc/vector/suricata.toml", "--config", "/etc/vector/falco.toml"]',
  "    environment:",
  "      <<: *ingest",
  "      COWRIE_LOG_PATH: /cowrie/cowrie-git/var/log/cowrie/cowrie.json",
  "      SENSOR_ID: cowrie-ssh-01",
  "      SURICATA_SENSOR_ID: suricata-01",
  "      FALCO_SENSOR_ID: falco-01",
  "    networks:",
  "      - edge",
  "    pids_limit: 128",
]

const FALCO_BLOCK = [
  "  falco:",
  "    image: falcosecurity/falco-no-driver:latest",
  "    container_name: falco",
  "    restart: unless-stopped",
  "    init: true",
  "    privileged: true",
  "    pid: host",
  "    volumes:",
  "      - /proc:/host/proc:ro",
  "      - /sys:/host/sys:ro",
  "      - ./falco.yaml:/etc/falco/falco.yaml:ro",
  "      - falco_logs:/var/log/falco",
  "    pids_limit: 128",
]

const SURICATA_BLOCK = [
  "  suricata:",
  "    logging: *json-logging",
  "    image: jasonish/suricata:latest",
  "    container_name: suricata",
  "    restart: unless-stopped",
  "    init: true",
  "    network_mode: host",
  "    cap_add:",
  "      - NET_ADMIN",
  "      - NET_RAW",
  "      - SYS_NICE",
  "      - SETPCAP",
  "      - SETUID",
  "      - SETGID",
  "    environment:",
  '      SURICATA_INTERFACE: "${SURICATA_INTERFACE:-eth0}"',
  "    volumes:",
  "      - suricata_logs:/tmp/suricata-logs",
  "    pids_limit: 256",
]

const VECTOR_ONLY_BLOCK = [
  "  vector:",
  "    image: timberio/vector:0.40.0-alpine",
  "    container_name: vector",
  "    restart: unless-stopped",
  "    init: true",
  "    security_opt:",
  "      - no-new-privileges:true",
  "    cap_drop:",
  "      - ALL",
  "    logging: *json-logging",
  "    volumes:",
  "      - suricata_logs:/tmp/suricata-logs:ro",
  "      - falco_logs:/var/log/falco:ro",
  "      - ./suricata.toml:/etc/vector/suricata.toml:ro",
  "      - ./falco.toml:/etc/vector/falco.toml:ro",
  "      - vector_data:/var/lib/vector",
  '    command: ["--config", "/etc/vector/suricata.toml", "--config", "/etc/vector/falco.toml"]',
  "    environment:",
  "      <<: *ingest",
  "      SURICATA_SENSOR_ID: suricata-01",
  "      FALCO_SENSOR_ID: falco-01",
  "    networks:",
  "      - edge",
  "    pids_limit: 128",
]

const HTTP_BLOCK = [
  "  web-honeypot:",
  "    <<: *service-defaults",
  "    logging: *json-logging",
  `    image: ${REGISTRY}/web-honeypot:latest`,
  "    container_name: web-honeypot",
  "    environment:",
  "      <<: *ingest",
  '      PORT: "8080"',
  "      SENSOR_ID: web-01",
  '      SENSOR_NAME: "Web Honeypot"',
  '      SENSOR_IP: ""',
  "      SENSOR_HOST: web-honeypot",
  '      SENSOR_PORTS: "80 8443"',
  '      SENSOR_PROBE_PORTS: "8080 8080"',
  "    ports:",
  '      - "80:8080"',
  '      - "8443:8080"',
  "    read_only: true",
  "    networks:",
  "      - edge",
  "    tmpfs:",
  "      - /tmp",
  "    pids_limit: 128",
]

const FTP_BLOCK = [
  "  ftp-honeypot:",
  "    <<: *service-defaults",
  "    logging: *json-logging",
  `    image: ${REGISTRY}/ftp-honeypot:latest`,
  "    container_name: ftp-honeypot",
  "    environment:",
  "      <<: *ingest",
  '      PORT: "21"',
  '      DST_PORT: "21"',
  "      SENSOR_ID: ftp-01",
  '      SENSOR_NAME: "FTP Honeypot"',
  '      SENSOR_IP: ""',
  "    ports:",
  '      - "21:21"',
  "    networks:",
  "      - edge",
  "    pids_limit: 128",
]

const MYSQL_BLOCK = [
  "  mysql-honeypot:",
  "    <<: *service-defaults",
  "    logging: *json-logging",
  `    image: ${REGISTRY}/mysql-honeypot:latest`,
  "    container_name: mysql-honeypot",
  "    environment:",
  "      <<: *ingest",
  '      PORT: "3306"',
  '      DST_PORT: "3306"',
  "      SENSOR_ID: mysql-01",
  '      SENSOR_NAME: "MySQL Honeypot"',
  '      SENSOR_IP: ""',
  "    ports:",
  '      - "3306:3306"',
  "    networks:",
  "      - edge",
  "    pids_limit: 128",
]

const PORT_BLOCK = [
  "  port-honeypot:",
  "    <<: *service-defaults",
  "    logging: *json-logging",
  `    image: ${REGISTRY}/port-honeypot:latest`,
  "    container_name: port-honeypot",
  "    environment:",
  "      <<: *ingest",
  '      PORTS: "1433 2375 3389 4444 5900 6379 8888 9090 9200 27017"',
  "      SENSOR_ID: port-01",
  '      SENSOR_NAME: "Port Honeypot"',
  '      SENSOR_IP: ""',
  "    ports:",
  '      - "1433:1433"',
  '      - "2375:2375"',
  '      - "3389:3389"',
  '      - "4444:4444"',
  '      - "5900:5900"',
  '      - "6379:6379"',
  '      - "8888:8888"',
  '      - "9090:9090"',
  '      - "9200:9200"',
  '      - "27017:27017"',
  "    networks:",
  "      - edge",
  "    pids_limit: 256",
]

function buildCompose(
  ingestUrl: string,
  secret: string,
  services: ServiceKey[],
  clientSlug = "",
  clientName = "",
): string {
  const blocks: string[][] = [HEADER(ingestUrl, secret, clientSlug, clientName)]

  if (services.includes("ssh"))   blocks.push(SSH_BLOCK,   [""])
  if (services.includes("http"))  blocks.push(HTTP_BLOCK,  [""])
  if (services.includes("ftp"))   blocks.push(FTP_BLOCK,   [""])
  if (services.includes("mysql")) blocks.push(MYSQL_BLOCK, [""])
  if (services.includes("port"))  blocks.push(PORT_BLOCK,  [""])

  // Suricata + Falco always included — IDS/IPS regardless of honeypot selection
  blocks.push([""], SURICATA_BLOCK)
  blocks.push([""], FALCO_BLOCK)

  // If SSH (vector) is not included, add a standalone vector for Suricata + Falco
  if (!services.includes("ssh")) {
    blocks.push([""], VECTOR_ONLY_BLOCK)
  }

  const volumeLines = ["volumes:"]
  if (services.includes("ssh")) {
    volumeLines.push("  cowrie_var:", "  vector_data:")
  } else {
    volumeLines.push("  vector_data:")
  }
  volumeLines.push("  suricata_logs:")
  volumeLines.push("  falco_logs:")

  return [...blocks.flat(), "", ...volumeLines, "", "networks:", "  edge:", "    driver: bridge"].join("\n")
}

function buildScript(
  ingestUrl: string,
  secret: string,
  services: ServiceKey[],
  clientSlug = "",
  clientName = "",
): string {
  const compose = buildCompose(ingestUrl, secret, services, clientSlug, clientName)
  const needsCowrieFiles = services.includes("ssh")

  const configDownloads = [
    ...(needsCowrieFiles
      ? [
          `curl -fsSL "$RAW/sensors/cowrie/heartbeat.py" -o heartbeat.py`,
          `curl -fsSL "$RAW/sensors/cowrie/cowrie.cfg"   -o cowrie.cfg`,
          `curl -fsSL "$RAW/sensors/cowrie/userdb.txt"   -o userdb.txt`,
          `curl -fsSL "$RAW/vector/cowrie.toml"          -o cowrie.toml`,
        ]
      : []),
    `curl -fsSL "$RAW/vector/suricata.toml"            -o suricata.toml`,
    `curl -fsSL "$RAW/vector/falco.toml"               -o falco.toml`,
    `curl -fsSL "$RAW/sensors/falco/falco.yaml"        -o falco.yaml`,
  ].join("\n")

  const clientLine = clientSlug ? `# Client: ${clientName || clientSlug} (${clientSlug})` : ""

  const sshPortStep = services.includes("ssh")
    ? `
# Move real sshd to port 8022 so Cowrie can claim port 22
if ss -tlnp | grep -q ':22 '; then
  echo "==> Moving sshd to port 8022 to free port 22 for Cowrie..."
  sed -i 's/^#*Port .*/Port 8022/' /etc/ssh/sshd_config
  # Handle systemd socket activation (Ubuntu 22+)
  SOCKET_DROP="/etc/systemd/system/ssh.socket.d"
  mkdir -p "$SOCKET_DROP"
  cat > "$SOCKET_DROP/override.conf" << 'EOF'
[Socket]
ListenStream=
ListenStream=8022
EOF
  systemctl daemon-reload
  systemctl restart ssh.socket 2>/dev/null || systemctl restart sshd 2>/dev/null || true
  echo "    sshd is now on port 8022. Reconnect with: ssh <user>@<host> -p 8022"
fi
`
    : ""

  return `#!/usr/bin/env bash
# Honeypot sensor installer — generated by dashboard
# Sensors: ${services.join(", ")} + Suricata IDS + Falco
${clientLine}
# Run as root or with sudo: bash install-sensor.sh
set -euo pipefail

DIR="/opt/honeypot-sensor"
RAW="${RAW_BASE}"

echo "==> Honeypot sensor installer (${services.join(", ")} + Suricata IDS + Falco)"
${sshPortStep}
# Detect the default public-facing network interface for Suricata
SURICATA_INTERFACE=$(ip route 2>/dev/null | grep '^default' | awk '{print $5}' | head -1)
if [ -z "$SURICATA_INTERFACE" ]; then
  SURICATA_INTERFACE="eth0"
fi
echo "==> Suricata will monitor interface: $SURICATA_INTERFACE"
export SURICATA_INTERFACE

if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

if ! docker compose version &>/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin 2>/dev/null || true
fi

mkdir -p "$DIR"
cd "$DIR"

echo "==> Downloading config files..."
${configDownloads}

echo "==> Writing docker-compose.yml..."
cat > docker-compose.yml << 'ENDOFCOMPOSE'
${compose}
ENDOFCOMPOSE

echo "==> Pulling images..."
docker compose pull

echo "==> Starting services..."
SURICATA_INTERFACE="$SURICATA_INTERFACE" docker compose up -d

echo ""
echo "Sensor deployed. It will appear in /sensors within 60 seconds."
echo "Suricata IDS is running on interface: $SURICATA_INTERFACE"
`
}

export async function GET(req: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const p = req.nextUrl.searchParams
  const param = p.get("services") ?? ""
  const clientSlug = p.get("clientSlug")?.trim() ?? ""
  const clientName = p.get("clientName")?.trim() ?? ""

  const requested = param
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ServiceKey => (ALL_SERVICES as string[]).includes(s))
  const services: ServiceKey[] = requested.length > 0 ? requested : [...ALL_SERVICES]

  const ingestUrl = await resolveIngestUrl()
  if (!ingestUrl) {
    return NextResponse.json(
      { error: "Could not resolve ingest URL. Set SENSOR_INGEST_URL in your .env" },
      { status: 500 },
    )
  }

  const secret = process.env.INGEST_SHARED_SECRET ?? ""
  if (!secret) {
    return NextResponse.json({ error: "INGEST_SHARED_SECRET is not set" }, { status: 500 })
  }

  const suffix = clientSlug
    ? `${clientSlug}-${services.join("-")}`
    : services.length === ALL_SERVICES.length
      ? "all"
      : services.join("-")

  const filename = `install-sensor-${suffix}.sh`

  await logAudit({
    action: "DOWNLOAD",
    resource: "SENSOR",
    resourceName: filename,
    details: { filename, services, clientSlug: clientSlug || null },
    request: req,
  })

  return new NextResponse(buildScript(ingestUrl, secret, services, clientSlug, clientName), {
    headers: {
      "Content-Type": "text/x-sh; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
