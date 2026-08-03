import { buildCompose, type ServiceKey } from "@/lib/sensor-compose-builder"

export function buildScript(
  deployId: string,
  ingestUrl: string,
  secret: string,
  rawBase: string,
  registry: string,
  services: ServiceKey[],
  clientSlug = "",
  clientName = "",
): string {
  const compose = buildCompose(deployId, ingestUrl, secret, services, registry, clientSlug, clientName, rawBase)
  return SCRIPT_TEMPLATE
    .replaceAll("{{services}}", services.join(", "))
    .replaceAll("{{idsNote}}", hasSuricata(services) ? " + Suricata IDS" : "")
    .replaceAll("{{suricataIfaceEcho}}", hasSuricata(services)
      ? `echo "==> Suricata will monitor interface: $SURICATA_INTERFACE"\n`
      : "")
    .replaceAll("{{suricataRunningEcho}}", hasSuricata(services)
      ? `echo "Suricata IDS is running on interface: $SURICATA_INTERFACE"`
      : "")
    .replaceAll("{{clientLine}}", clientLine(clientSlug, clientName))
    .replaceAll("{{rawBase}}", rawBase)
    .replaceAll("{{sshPortStep}}", sshPortStep(services))
    .replaceAll("{{configDownloads}}", configDownloadLines(services))
    .replaceAll("{{controlPlaneNote}}", controlPlaneNote(services))
    .replaceAll("{{sensorMeta}}", sensorMeta(deployId, ingestUrl, secret, services, clientSlug, clientName))
    .replaceAll("{{compose}}", compose)
}

// Everything the installer drops on a host besides docker-compose.yml: the
// files mounted into containers, and the helper commands themselves. Together
// with the compose this is the whole install, so sensor-update can reach every
// part of it without a reinstall.
export const HELPER_NAMES = ["sensor-status", "sensor-test", "sensor-update", "sensor-uninstall"]

// "<destination> <url>" per line. Config files come from the public raw host;
// helpers are generated per deploy, so the caller supplies their URL — it has to
// carry the same identity params the helper route needs to build them.
export function refreshManifest(
  services: ServiceKey[], rawBase: string, helperUrl: (name: string) => string,
) {
  const files = [...configDownloadLines(services).matchAll(/curl -fsSL "\$RAW\/(\S+?)"\s+-o (\S+)/g)]
    .map(m => `${m[2]} ${rawBase}/${m[1]}`)
  const helpers = HELPER_NAMES.map(n => `${n} ${helperUrl(n)}`)
  // Trailing newline is load-bearing: "while read" drops a final line that has
  // none, and the last helper would never be fetched.
  return [...files, ...helpers].join("\n") + "\n"
}

// Pulls one helper back out of a built install script. Cheaper than splitting
// SCRIPT_TEMPLATE apart, and it cannot drift from what the installer writes.
export function helperScript(script: string, name: string): string | null {
  if (!HELPER_NAMES.includes(name)) return null
  const match = script.match(new RegExp(`cat > "\\$DIR/${name}" << '(ENDOF\\w+)'\\n([\\s\\S]*?)\\n\\1`))
  return match ? match[2] : null
}

// Single-quoted so the values are literal to the shell that sources this.
function sensorMeta(
  deployId: string, ingestUrl: string, secret: string, services: ServiceKey[], clientSlug: string, clientName: string,
) {
  const quote = (v: string) => `'${v.replaceAll("'", "'\\''")}'`
  return [
    `DEPLOY_ID=${quote(deployId)}`,
    `SERVICES=${quote(services.join(","))}`,
    `CLIENT_SLUG=${quote(clientSlug)}`,
    `CLIENT_NAME=${quote(clientName)}`,
    `INGEST_API_URL=${quote(ingestUrl)}`,
    // Already sitting in docker-compose.yml beside it; the file is chmod 600.
    `INGEST_SECRET=${quote(secret)}`,
  ].join("\n")
}

// Standalone LAN deploys (internal-canary, int-* nodes) carry no Suricata:
// there's no internet-facing interface to sniff.
function hasSuricata(services: ServiceKey[]) {
  return !services.includes("internal-canary") && !services.some(s => (s as string).startsWith("int-"))
}

function clientLine(clientSlug: string, clientName: string) {
  return clientSlug ? `# Client: ${clientName || clientSlug} (${clientSlug})` : ""
}

function configDownloadLines(services: ServiceKey[]) {
  if (services.includes("internal-canary")) return internalCanaryDownloadLines()
  if (services.some(s => (s as string).startsWith("int-"))) return internalNodesDownloadLines(services)
  return [
    ...cowrieDownloadLines(services),
    ...httpDownloadLines(services),
    ...controlAgentDownloadLines(services),
    ...persistedConfigDownloadLines(services),
    `curl -fsSL "$RAW/vector/suricata.toml"            -o suricata.toml`,
    ...vectorConfigDownloadLines(services),
    ...deceptionDownloadLines(services),
  ].join("\n")
}

// int-* LAN nodes: no suricata config (no vector suricata source), but the same
// shipper configs the external deploy uses — without these the honeypots run and
// heartbeat, yet no event ever reaches ingest (see sensor-event-shipping.md).
function internalNodesDownloadLines(services: ServiceKey[]) {
  const lines: string[] = []
  if (services.includes("int-ssh")) {
    lines.push(
      `curl -fsSL "$RAW/sensors/cowrie/heartbeat.py"      -o heartbeat.py`,
      `curl -fsSL "$RAW/sensors/_shared/control_agent.py" -o control_agent.py`,
      `curl -fsSL "$RAW/vector/cowrie.toml"               -o cowrie.toml`,
    )
  }
  if (services.includes("int-smb") || services.includes("int-mysql")) {
    lines.push(`curl -fsSL "$RAW/vector/protocol.toml"              -o protocol.toml`)
  }
  if (services.includes("int-http")) {
    lines.push(`curl -fsSL "$RAW/vector/web-honeypot.toml"          -o web-honeypot.toml`)
  }
  return lines.join("\n")
}

function internalCanaryDownloadLines() {
  return [
    `mkdir -p internal-canary`,
    `curl -fsSL "$RAW/sensors/cowrie/heartbeat.py"                              -o internal-canary/heartbeat.py`,
    `curl -fsSL "$RAW/sensors/cowrie/cowrie.cfg"                                -o internal-canary/cowrie.cfg`,
    `curl -fsSL "$RAW/sensors/cowrie/userdb.txt"                                -o internal-canary/userdb.txt`,
    `curl -fsSL "$RAW/vector/cowrie.toml"                                       -o internal-canary/cowrie.toml`,
    `curl -fsSL "$RAW/sensors/opencanary/configs/internal-canary-smb.json"      -o internal-canary/opencanary-smb.json`,
    `curl -fsSL "$RAW/sensors/opencanary/configs/internal-canary-db.json"       -o internal-canary/opencanary-db.json`,
    `curl -fsSL "$RAW/sensors/opencanary/configs/internal-canary-web.json"      -o internal-canary/opencanary-web.json`,
    `curl -fsSL "$RAW/sensors/opencanary/shipper.py"                            -o internal-canary/shipper.py`,
  ].join("\n")
}

function deceptionDownloadLines(services: ServiceKey[]) {
  if (!services.includes("deception")) return []
  const nodes = ["fake-dc", "fake-intranet", "fake-db", "fake-db-replica", "fake-cache"]
  return [
    `mkdir -p opencanary`,
    ...nodes.map(n => `curl -fsSL "$RAW/sensors/opencanary/configs/${n}.json" -o opencanary/${n}.json`),
    `curl -fsSL "$RAW/sensors/opencanary/shipper.py" -o opencanary/shipper.py`,
  ]
}

function cowrieDownloadLines(services: ServiceKey[]) {
  if (!services.includes("ssh")) return []
  return [
    // No cowrie.cfg / userdb.txt: both come from the image defaults and are then
    // replaced at runtime by whatever the dashboard config says (beacon -> /signal).
    `curl -fsSL "$RAW/sensors/cowrie/heartbeat.py" -o heartbeat.py`,
    `curl -fsSL "$RAW/vector/cowrie.toml"          -o cowrie.toml`,
  ]
}

function httpDownloadLines(services: ServiceKey[]) {
  if (!services.includes("http")) return []
  return [`curl -fsSL "$RAW/sensors/web-honeypot/heartbeat.py" -o web-heartbeat.py`]
}

// Vector shipper configs for the file-logging honeypots. protocol.toml covers
// port/ftp/mysql/smb; web-honeypot.toml covers http. Suricata's config is always
// downloaded separately. Without these the events never leave the host.
const PROTOCOL_TOML_SERVICES: ServiceKey[] = ["port", "ftp", "mysql", "smb"]

function vectorConfigDownloadLines(services: ServiceKey[]) {
  const lines: string[] = []
  if (services.some(s => PROTOCOL_TOML_SERVICES.includes(s))) {
    lines.push(`curl -fsSL "$RAW/vector/protocol.toml"            -o protocol.toml`)
  }
  if (services.includes("http")) {
    lines.push(`curl -fsSL "$RAW/vector/web-honeypot.toml"        -o web-honeypot.toml`)
  }
  return lines
}

// Shared control-plane agent (status.get / config.apply) — same file used by
// every beacon/sensor process, "copy don't import" convention. Only needed
// when a sensor with an in-process or sidecar agent is going to run.
// (smb-honeypot's own template ADDs this file at build time instead, since
// its remote-install path already fetches app.py the same way.)
const CONTROL_AGENT_SERVICES: ServiceKey[] = ["ssh", "http", "port", "ftp", "mysql"]

function controlAgentDownloadLines(services: ServiceKey[]) {
  if (!services.some(s => CONTROL_AGENT_SERVICES.includes(s))) return []
  return [`curl -fsSL "$RAW/sensors/_shared/control_agent.py" -o control_agent.py`]
}

// config.apply's restart-based apply (port/ftp/mysql only — smb ADDs it at
// build time same as control_agent.py; ssh/http have their own apply
// mechanisms and never read this file).
const PERSISTED_CONFIG_SERVICES: ServiceKey[] = ["port", "ftp", "mysql"]

function persistedConfigDownloadLines(services: ServiceKey[]) {
  if (!services.some(s => PERSISTED_CONFIG_SERVICES.includes(s))) return []
  return [`curl -fsSL "$RAW/sensors/_shared/persisted_config.py" -o persisted_config.py`]
}

// Rebanada 8h: the beacon(s)/sensor(s) auto-enroll their own control
// credential on first boot (trading the shared ingest token for a per-sensor
// one via POST /sensors/control/enroll, once their heartbeat has registered
// them) — no manual credential step needed anymore. Nothing to print here.
function controlPlaneNote(_services: ServiceKey[]): string {
  return ""
}

function sshPortStep(services: ServiceKey[]) {
  // Internal canary: cowrie claims port 22 on a dedicated VM — no real sshd to move.
  if (services.includes("internal-canary")) return ""
  // int-ssh publishes 22 on the LAN VM just like the external cowrie does, so the
  // host's own sshd has to move out of the way or the container can't bind.
  return services.includes("ssh") || services.includes("int-ssh") ? SSH_PORT_STEP : ""
}

const SSH_PORT_STEP = `
# Move real sshd to port 8022 so Cowrie can claim port 22.
# Opens 8022 first, verifies it responds, then closes 22 — so a failure
# at any step leaves SSH accessible and the backup restores the original state.
# On a re-run port 22 is held by Cowrie, not sshd — without the 8022 check the
# step runs again and overwrites the backup with the already-moved config,
# leaving sensor-uninstall unable to restore the original port.
if ss -tlnp | grep -q ':22 ' && ! ss -tlnp | grep -q ':8022 '; then
  echo "==> Moving sshd to port 8022 to free port 22 for Cowrie..."

  [ -f /etc/ssh/sshd_config.pre-honeypot ] || cp /etc/ssh/sshd_config /etc/ssh/sshd_config.pre-honeypot

  _ssh_rollback() {
    echo "ERROR: sshd port move failed — restoring original config..." >&2
    cp /etc/ssh/sshd_config.pre-honeypot /etc/ssh/sshd_config
    rm -f /etc/systemd/system/ssh.socket.d/override.conf
    systemctl daemon-reload
    systemctl restart ssh.socket 2>/dev/null || systemctl restart sshd 2>/dev/null || true
    echo "    Original sshd config restored. SSH still on port 22." >&2
  }

  # Open 8022 in the firewall BEFORE changing the port (so we don't lock ourselves out)
  if command -v ufw &>/dev/null && ufw status | grep -q 'active'; then
    ufw allow 8022/tcp comment 'sshd moved by honeypot installer' 2>/dev/null || true
  fi

  sed -i 's/^#*Port .*/Port 8022/' /etc/ssh/sshd_config
  SOCKET_DROP="/etc/systemd/system/ssh.socket.d"
  mkdir -p "$SOCKET_DROP"
  # Both families explicitly: a bare "ListenStream=8022" binds a single socket
  # that on a bindv6only=1 host serves IPv6 only, so every IPv4 client gets
  # "Connection refused" — a silent lockout on a LAN box reached over IPv4.
  cat > "$SOCKET_DROP/override.conf" << 'EOF'
[Socket]
ListenStream=
ListenStream=0.0.0.0:8022
ListenStream=[::]:8022
EOF
  systemctl daemon-reload
  if ! systemctl restart ssh.socket 2>/dev/null && ! systemctl restart sshd 2>/dev/null; then
    _ssh_rollback
    exit 1
  fi

  # Verify sshd answers over IPv4 before declaring success. Grepping for
  # ":8022 " is not enough: an IPv6-only listener matches it while every IPv4
  # client is still refused.
  _SSH_VERIFIED=false
  for _i in 1 2 3 4 5; do
    if ss -tlnp | grep -qE '(0\\.0\\.0\\.0|\\*):8022 '; then
      _SSH_VERIFIED=true
      break
    fi
    sleep 1
  done

  if [ "$_SSH_VERIFIED" = "false" ]; then
    echo "ERROR: sshd did not come up on port 8022 (IPv4) after restart." >&2
    _ssh_rollback
    exit 1
  fi

  echo "    sshd is now on port 8022. Reconnect with: ssh <user>@<host> -p 8022"
  echo "    Original config backed up at: /etc/ssh/sshd_config.pre-honeypot"
fi
`

const SCRIPT_TEMPLATE = `#!/usr/bin/env bash
# Honeypot sensor installer - generated by dashboard
# Sensors: {{services}}{{idsNote}}
{{clientLine}}
# Run as root or with sudo: bash install-sensor.sh
set -euo pipefail

# Report exactly which step failed instead of dying silently
trap 'rc=$?; echo ""; echo "ERROR: install failed at line $LINENO (exit $rc): $BASH_COMMAND" >&2; echo "Sensor was NOT deployed. Fix the error above and re-run." >&2; exit $rc' ERR

DIR="/opt/honeypot-sensor"
RAW="{{rawBase}}"

# Re-exec under sudo if not root: the install writes to /opt and manages
# Docker + sshd, all of which need root. Running as a normal user otherwise
# fails later with a cryptic "curl: (23) ... write" when it can't write $DIR.
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo &>/dev/null; then
    echo "==> Re-running with sudo (root required to write $DIR and manage Docker)..."
    exec sudo -E bash "$0" "$@"
  fi
  echo "ERROR: this installer must run as root. Re-run with: sudo bash $0" >&2
  exit 1
fi

echo "==> Honeypot sensor installer ({{services}}{{idsNote}})"
{{sshPortStep}}
# Detect the default public-facing network interface for Suricata
SURICATA_INTERFACE=$(ip route 2>/dev/null | grep '^default' | awk '{print $5}' | head -1)
if [ -z "$SURICATA_INTERFACE" ]; then
  SURICATA_INTERFACE="eth0"
fi
{{suricataIfaceEcho}}export SURICATA_INTERFACE

# LAN address of this host. Internal trap nodes report it as their sensor IP:
# a container on a bridge network can only see 172.x, and the public IP is the
# same for every node behind the NAT, so neither identifies the box it runs on.
# "|| true" is load-bearing: pipefail turns a failed lookup (a host with no
# default route) into a fatal error that aborts the whole script.
HOST_LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1 || true)
[ -z "$HOST_LAN_IP" ] && HOST_LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
true
export HOST_LAN_IP

if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

if ! docker compose version &>/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin 2>/dev/null || true
fi

mkdir -p "$DIR"
cd "$DIR"

# Fail early with a clear message if $DIR isn't writable or the disk is full,
# rather than letting the first curl die with an opaque "(23) write" error.
if ! touch "$DIR/.write-test" 2>/dev/null; then
  echo "ERROR: cannot write to $DIR. Check ownership/permissions or that the filesystem is not read-only." >&2
  exit 1
fi
rm -f "$DIR/.write-test"
AVAIL_KB=$(df -Pk "$DIR" | awk 'NR==2 {print $4}')
if [ -n "$AVAIL_KB" ] && [ "$AVAIL_KB" -lt 524288 ]; then
  echo "ERROR: less than 512 MB free on the filesystem holding $DIR (only $((AVAIL_KB/1024)) MB). Free up space and re-run." >&2
  exit 1
fi

echo "==> Downloading config files..."
{{configDownloads}}

echo "==> Writing docker-compose.yml..."
cat > docker-compose.yml << 'ENDOFCOMPOSE'
{{compose}}
ENDOFCOMPOSE

# What this host is, so sensor-update can ask for its compose to be regenerated
# with the same identity. Losing DEPLOY_ID would rename every sensor here.
cat > .sensor-meta << 'ENDOFMETA'
{{sensorMeta}}
ENDOFMETA
chmod 600 .sensor-meta

echo "==> Pulling images..."
docker compose pull

echo "==> Starting services..."
SURICATA_INTERFACE="$SURICATA_INTERFACE" HOST_LAN_IP="$HOST_LAN_IP" docker compose up -d

# Verify containers actually stayed up (up -d returns 0 even if a container crashes on boot)
echo "==> Verifying containers..."
sleep 5
EXITED=$(docker compose ps --status=exited --format '{{.Service}}' 2>/dev/null || true)
RUNNING=$(docker compose ps --status=running --format '{{.Service}}' 2>/dev/null | grep -c . || true)

if [ -n "$EXITED" ]; then
  echo "" >&2
  echo "ERROR: the following containers crashed on startup:" >&2
  echo "$EXITED" | sed 's/^/  - /' >&2
  echo "" >&2
  echo "Logs from the failed containers:" >&2
  for svc in $EXITED; do
    echo "----- $svc -----" >&2
    docker compose logs --no-color --tail 30 "$svc" >&2 || true
  done
  echo "" >&2
  echo "Sensor deploy INCOMPLETE. Fix the errors above, then run: docker compose up -d" >&2
  exit 1
fi

if [ "$RUNNING" -eq 0 ]; then
  echo "ERROR: no containers are running after startup. Check 'docker compose ps' and 'docker compose logs'." >&2
  exit 1
fi

echo ""
echo "Sensor deployed: $RUNNING container(s) running."
echo "It will appear in /sensors within 60 seconds."
{{suricataRunningEcho}}

# Install sensor-status helper so the operator can check health at any time
cat > "$DIR/sensor-status" << 'ENDOFSTATUS'
#!/usr/bin/env bash
# Usage: sensor-status [--logs]
# Quick health check: containers + ingest-api reachability.
set -euo pipefail
DIR="/opt/honeypot-sensor"
RED=$(printf '\x1b[0;31m'); GREEN=$(printf '\x1b[0;32m'); YELLOW=$(printf '\x1b[1;33m')
RESET=$(printf '\x1b[0m'); BOLD=$(printf '\x1b[1m')

[ -f "$DIR/.env" ] && . "$DIR/.env" 2>/dev/null || true

echo ""
printf "%b=== Honeypot Sensor Status ===%b\n" "$BOLD" "$RESET"
echo ""

# --- Container health ---
printf "%bContainers:%b\n" "$BOLD" "$RESET"
ALL_OK=true
while IFS= read -r json_line; do
  [ -z "$json_line" ] && continue
  NAME=$(echo "$json_line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('Service','?'))" 2>/dev/null || echo "?")
  STATE=$(echo "$json_line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('State','?'))" 2>/dev/null || echo "?")
  HEALTH=$(echo "$json_line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('Health',''))" 2>/dev/null || echo "")
  if [ "$STATE" = "running" ]; then
    if [ "$HEALTH" = "unhealthy" ]; then
      printf "  %b[!]%b  %s (running / unhealthy)\n" "$YELLOW" "$RESET" "$NAME"
      ALL_OK=false
    else
      printf "  %b[+]%b  %s\n" "$GREEN" "$RESET" "$NAME"
    fi
  else
    printf "  %b[-]%b  %s (%s)\n" "$RED" "$RESET" "$NAME" "$STATE"
    ALL_OK=false
  fi
done < <(docker compose -f "$DIR/docker-compose.yml" --env-file "$DIR/.env" ps --format json 2>/dev/null)

echo ""

# --- Ingest-api reachability ---
printf "%bIngest API:%b\n" "$BOLD" "$RESET"
INGEST_URL="\${INGEST_API_URL:-}"
if [ -z "$INGEST_URL" ]; then
  printf "  %b[!]%b  INGEST_API_URL not set in .env\n" "$YELLOW" "$RESET"
else
  HTTP_CODE=$(curl -o /dev/null -s -w "%{http_code}" --max-time 5 "$INGEST_URL/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    printf "  %b[+]%b  %s (HTTP %s)\n" "$GREEN" "$RESET" "$INGEST_URL" "$HTTP_CODE"
  else
    printf "  %b[-]%b  %s (HTTP %s - check connectivity or token)\n" "$RED" "$RESET" "$INGEST_URL" "$HTTP_CODE"
    ALL_OK=false
  fi
fi

echo ""
if $ALL_OK; then
  printf "%b%bAll checks passed.%b\n" "$GREEN" "$BOLD" "$RESET"
else
  printf "%b%bSome checks failed.%b\n" "$YELLOW" "$BOLD" "$RESET"
  echo "  Logs:    cd $DIR && docker compose logs --tail=50"
  echo "  Restart: cd $DIR && docker compose up -d"
fi
echo ""

if [ "\${1:-}" = "--logs" ]; then
  printf "%bRecent logs:%b\n" "$BOLD" "$RESET"
  docker compose -f "$DIR/docker-compose.yml" --env-file "$DIR/.env" logs --no-color --tail=30
fi
ENDOFSTATUS
chmod +x "$DIR/sensor-status"
ln -sf "$DIR/sensor-status" /usr/local/bin/sensor-status 2>/dev/null || true

# Install sensor-uninstall helper
cat > "$DIR/sensor-uninstall" << 'ENDOFUNINSTALL'
#!/usr/bin/env bash
# Honeypot sensor uninstaller — reverses everything install-sensor.sh did.
# Run as root or with sudo: sensor-uninstall
set -euo pipefail

DIR="/opt/honeypot-sensor"

if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo &>/dev/null; then
    exec sudo bash "$0" "$@"
  fi
  echo "ERROR: must run as root. Re-run with: sudo sensor-uninstall" >&2
  exit 1
fi

RED=$(printf '\x1b[0;31m'); GREEN=$(printf '\x1b[0;32m'); YELLOW=$(printf '\x1b[1;33m')
RESET=$(printf '\x1b[0m'); BOLD=$(printf '\x1b[1m')

echo ""
printf "%b=== Honeypot Sensor Uninstaller ===%b\n" "$BOLD" "$RESET"
echo ""

# ── 1. Stop and remove containers ────────────────────────────────────────────
if [ -f "$DIR/docker-compose.yml" ]; then
  echo "==> Stopping and removing containers..."
  ENV_ARG=""
  [ -f "$DIR/.env" ] && ENV_ARG="--env-file $DIR/.env"
  # shellcheck disable=SC2086
  docker compose -f "$DIR/docker-compose.yml" $ENV_ARG down --volumes --remove-orphans 2>/dev/null || true
  printf "  %b[+]%b  Containers removed\n" "$GREEN" "$RESET"
else
  printf "  %b[!]%b  No docker-compose.yml found in %s — skipping container removal\n" "$YELLOW" "$RESET" "$DIR"
fi

# ── 2. Restore sshd if the installer moved it ────────────────────────────────
if [ -f "/etc/ssh/sshd_config.pre-honeypot" ]; then
  echo "==> Restoring sshd to port 22..."
  cp /etc/ssh/sshd_config.pre-honeypot /etc/ssh/sshd_config

  # Remove the socket override the installer created
  rm -f /etc/systemd/system/ssh.socket.d/override.conf
  # Clean up the drop-in dir if it is now empty
  rmdir /etc/systemd/system/ssh.socket.d 2>/dev/null || true

  systemctl daemon-reload
  if systemctl restart ssh.socket 2>/dev/null || systemctl restart sshd 2>/dev/null; then
    # Wait up to 5 s for sshd to listen on 22
    _SSH_OK=false
    for _i in 1 2 3 4 5; do
      if ss -tlnp | grep -q ':22 '; then
        _SSH_OK=true; break
      fi
      sleep 1
    done
    if $_SSH_OK; then
      # Remove the ufw rule the installer added for port 8022
      if command -v ufw &>/dev/null && ufw status | grep -q 'active'; then
        ufw delete allow 8022/tcp 2>/dev/null || true
      fi
      rm -f /etc/ssh/sshd_config.pre-honeypot
      printf "  %b[+]%b  sshd restored to port 22\n" "$GREEN" "$RESET"
    else
      printf "  %b[!]%b  WARNING: sshd may not be listening on port 22 — check manually\n" "$YELLOW" "$RESET"
    fi
  else
    printf "  %b[-]%b  ERROR: could not restart sshd — check /etc/ssh/sshd_config manually\n" "$RED" "$RESET"
  fi
else
  printf "  %b[~]%b  sshd was not moved by the installer — nothing to restore\n" "$RESET" "$RESET"
fi

# ── 3. Remove symlinks ───────────────────────────────────────────────────────
echo "==> Removing helper symlinks..."
rm -f /usr/local/bin/sensor-status
rm -f /usr/local/bin/sensor-update
rm -f /usr/local/bin/sensor-test
rm -f /usr/local/bin/sensor-uninstall
printf "  %b[+]%b  Symlinks removed\n" "$GREEN" "$RESET"

# ── 4. Remove sensor directory ───────────────────────────────────────────────
if [ -d "$DIR" ]; then
  echo "==> Removing $DIR..."
  rm -rf "$DIR"
  printf "  %b[+]%b  %s removed\n" "$GREEN" "$RESET" "$DIR"
fi

echo ""
printf "%b%bSensor uninstalled successfully.%b\n" "$GREEN" "$BOLD" "$RESET"
echo "  The sensor will disappear from the dashboard within ~60 s."
echo ""
ENDOFUNINSTALL
chmod +x "$DIR/sensor-uninstall"
ln -sf "$DIR/sensor-uninstall" /usr/local/bin/sensor-uninstall 2>/dev/null || true

# Install sensor-update helper
cat > "$DIR/sensor-update" << 'ENDOFUPDATE'
#!/usr/bin/env bash
# sensor-update — pulls the newest sensor images and restarts only what changed.
# Manual bridge until the fleet updater ships (SENSOR_FLEET_UPDATES Fase 1).
# Run as root or with sudo: sensor-update
set -euo pipefail

DIR="/opt/honeypot-sensor"

if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo &>/dev/null; then
    exec sudo bash "$0" "$@"
  fi
  echo "ERROR: must run as root. Re-run with: sudo sensor-update" >&2
  exit 1
fi

RED=$(printf '\x1b[0;31m'); GREEN=$(printf '\x1b[0;32m'); YELLOW=$(printf '\x1b[1;33m')
RESET=$(printf '\x1b[0m'); BOLD=$(printf '\x1b[1m')

cd "$DIR"

echo ""
printf "%b=== Honeypot Sensor Update ===%b\n" "$BOLD" "$RESET"
echo ""

# Same detection as the installer — the compose interpolates both. Without
# HOST_LAN_IP here an update would blank out every internal node's reported IP.
SURICATA_INTERFACE=$(ip route 2>/dev/null | grep '^default' | awk '{print $5}' | head -1)
[ -z "$SURICATA_INTERFACE" ] && SURICATA_INTERFACE="eth0"
export SURICATA_INTERFACE
# "|| true" is load-bearing: pipefail turns a failed lookup (a host with no
# default route) into a fatal error that aborts the whole script.
HOST_LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1 || true)
[ -z "$HOST_LAN_IP" ] && HOST_LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
true
export HOST_LAN_IP

# Pull a freshly generated compose for THIS deployId, so template fixes ship
# through an update instead of a full reinstall. Every failure path here leaves
# the working compose untouched: an update that cannot reach the server should
# still refresh images, never strand the host with a broken file.
if [ -f "$DIR/.sensor-meta" ]; then
  . "$DIR/.sensor-meta"
  echo "==> Refreshing docker-compose.yml..."
  if curl -fsS --max-time 20 -o docker-compose.yml.new \
       -H "X-Ingest-Token: $INGEST_SECRET" \
       --get "$INGEST_API_URL/sensor/compose" \
       --data-urlencode "deployId=$DEPLOY_ID" \
       --data-urlencode "services=$SERVICES" \
       --data-urlencode "clientSlug=$CLIENT_SLUG" \
       --data-urlencode "clientName=$CLIENT_NAME" 2>/dev/null; then
    if ! docker compose -f docker-compose.yml.new config -q 2>/dev/null; then
      printf "  %b[!]%b  Server returned an invalid compose — keeping the current one\n" "$YELLOW" "$RESET"
      rm -f docker-compose.yml.new
    elif cmp -s docker-compose.yml.new docker-compose.yml; then
      printf "  %b[+]%b  Already up to date\n" "$GREEN" "$RESET"
      rm -f docker-compose.yml.new
    else
      cp docker-compose.yml docker-compose.yml.bak
      mv docker-compose.yml.new docker-compose.yml
      printf "  %b[+]%b  Updated (previous saved as docker-compose.yml.bak)\n" "$GREEN" "$RESET"
    fi
  else
    rm -f docker-compose.yml.new
    printf "  %b[!]%b  Could not fetch it — continuing with the current one\n" "$YELLOW" "$RESET"
  fi
else
  printf "  %b[!]%b  No .sensor-meta: this sensor predates compose refresh.\n" "$YELLOW" "$RESET"
  printf "      Re-download the installer once to enable it.\n"
fi

# The rest of the install: files mounted into containers (heartbeat.py, the
# vector shipper configs) and the helper commands themselves. Same rules as the
# compose — validate first, and leave what works alone on any failure.
REFRESHED_MOUNTS=0
REFRESHED_HELPERS=0
if [ -f "$DIR/.sensor-meta" ]; then
  STAGE=$(mktemp -d)
  if curl -fsS --max-time 20 -o "$STAGE/manifest" \
       -H "X-Ingest-Token: $INGEST_SECRET" \
       --get "$INGEST_API_URL/sensor/compose" \
       --data-urlencode "kind=files" \
       --data-urlencode "deployId=$DEPLOY_ID" \
       --data-urlencode "services=$SERVICES" \
       --data-urlencode "clientSlug=$CLIENT_SLUG" \
       --data-urlencode "clientName=$CLIENT_NAME" 2>/dev/null; then
    # "|| [ -n "$dest" ]" catches a manifest whose last line has no newline —
    # read returns non-zero there and the entry would be skipped in silence.
    while read -r dest url || [ -n "$dest" ]; do
      [ -z "$dest" ] && continue
      mkdir -p "$STAGE/$(dirname "$dest")"
      # The ingest token goes to our own API and nowhere else — the config files
      # come from a public host that has no business seeing it.
      case "$url" in
        "$INGEST_API_URL"*)
          curl -fsS --max-time 30 -H "X-Ingest-Token: $INGEST_SECRET" "$url" -o "$STAGE/$dest" </dev/null || continue ;;
        *)
          curl -fsS --max-time 30 "$url" -o "$STAGE/$dest" </dev/null || continue ;;
      esac
      [ -s "$STAGE/$dest" ] || continue
      # A helper that does not parse would break the next update permanently.
      case "$dest" in sensor-*) bash -n "$STAGE/$dest" 2>/dev/null || continue ;; esac
      cmp -s "$STAGE/$dest" "$DIR/$dest" 2>/dev/null && continue
      mkdir -p "$DIR/$(dirname "$dest")"
      # mv, never edit in place: this script may be one of the files being
      # replaced, and bash reads it as it runs.
      mv "$STAGE/$dest" "$DIR/$dest"
      case "$dest" in
        sensor-*) chmod +x "$DIR/$dest"; REFRESHED_HELPERS=$((REFRESHED_HELPERS + 1)) ;;
        *)        REFRESHED_MOUNTS=$((REFRESHED_MOUNTS + 1)) ;;
      esac
    done < "$STAGE/manifest"
    [ "$REFRESHED_MOUNTS" -gt 0 ] && printf "  %b[+]%b  %s mounted file(s) refreshed\n" "$GREEN" "$RESET" "$REFRESHED_MOUNTS"
    [ "$REFRESHED_HELPERS" -gt 0 ] && printf "  %b[+]%b  %s helper command(s) refreshed\n" "$GREEN" "$RESET" "$REFRESHED_HELPERS"
  else
    printf "  %b[!]%b  Could not fetch the file manifest — keeping the current files\n" "$YELLOW" "$RESET"
  fi
  rm -rf "$STAGE"
fi

echo "==> Pulling latest images..."
docker compose pull

echo ""
echo "==> Restarting updated containers..."
# up -d only recreates containers whose image (or config) changed; the rest stay untouched.
docker compose up -d

# A changed bind-mounted file is invisible to "up -d" — the container keeps the
# process it started with, so heartbeat.py or a vector config would sit there
# updated on disk and unused.
if [ "$REFRESHED_MOUNTS" -gt 0 ]; then
  echo "==> Restarting containers to pick up the refreshed files..."
  docker compose restart
fi

echo ""
echo "==> Verifying containers..."
sleep 5
EXITED=$(docker compose ps --status=exited --format '{{.Service}}' 2>/dev/null || true)
if [ -n "$EXITED" ]; then
  echo "" >&2
  printf "%bERROR: these containers crashed after the update:%b\n" "$RED" "$RESET" >&2
  echo "$EXITED" | sed 's/^/  - /' >&2
  for svc in $EXITED; do
    echo "----- $svc -----" >&2
    docker compose logs --no-color --tail 30 "$svc" >&2 || true
  done
  echo "" >&2
  printf "%bUpdate INCOMPLETE. Check the logs above, then run: sensor-status%b\n" "$YELLOW" "$RESET" >&2
  exit 1
fi

# Reclaim disk from superseded image layers (old images keep no rollback value
# here — rolling back means pulling the previous tag, which Fase 1 automates).
docker image prune -f >/dev/null 2>&1 || true

echo ""
printf "%b%bSensor updated successfully.%b\n" "$GREEN" "$BOLD" "$RESET"
echo "  The dashboard shows the new image version within ~60 s (sensor card)."
echo "  Health check: sensor-status"
echo ""
ENDOFUPDATE
chmod +x "$DIR/sensor-update"
ln -sf "$DIR/sensor-update" /usr/local/bin/sensor-update 2>/dev/null || true

# Install sensor-test helper
cat > "$DIR/sensor-test" << 'ENDOFTEST'
#!/usr/bin/env bash
# sensor-test — sends synthetic events to the ingest-api and verifies they land.
# Usage: sensor-test [--protocol ssh|http|ftp|mysql|port|smb] [--count N]
set -euo pipefail

DIR="/opt/honeypot-sensor"
[ -f "$DIR/.env" ] && . "$DIR/.env" 2>/dev/null || true

RED=$(printf '\x1b[0;31m'); GREEN=$(printf '\x1b[0;32m'); YELLOW=$(printf '\x1b[1;33m')
RESET=$(printf '\x1b[0m'); BOLD=$(printf '\x1b[1m')

# ── Parse args ────────────────────────────────────────────────────────────────
PROTOCOL="ssh"
COUNT=3
while [ $# -gt 0 ]; do
  case "$1" in
    --protocol) PROTOCOL="$2"; shift 2 ;;
    --count)    COUNT="$2";    shift 2 ;;
    *) echo "Usage: sensor-test [--protocol ssh|http|ftp|mysql|port|smb] [--count N]" >&2; exit 1 ;;
  esac
done

INGEST_URL="\${INGEST_API_URL:-}"
TOKEN="\${INGEST_SHARED_SECRET:-}"

echo ""
printf "%b=== Honeypot Sensor Test ===%b\n" "$BOLD" "$RESET"
printf "  Target: %s\n" "\${INGEST_URL:-<not set>}"
printf "  Protocol: %s  Count: %s\n" "$PROTOCOL" "$COUNT"
echo ""

if [ -z "$INGEST_URL" ]; then
  printf "%b[!]%b INGEST_API_URL not set in %s/.env\n" "$YELLOW" "$RESET" "$DIR"
  exit 1
fi

# ── 1. Health check ───────────────────────────────────────────────────────────
printf "%bStep 1/3 — Ingest-api reachability%b\n" "$BOLD" "$RESET"
HTTP_CODE=$(curl -o /dev/null -s -w "%{http_code}" --max-time 5 "$INGEST_URL/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  printf "  %b[+]%b  /health → HTTP 200\n" "$GREEN" "$RESET"
else
  printf "  %b[-]%b  /health → HTTP %s (cannot reach ingest-api)\n" "$RED" "$RESET" "$HTTP_CODE"
  echo "  Check: is the ingest-api running? Is INGEST_API_URL correct?"
  exit 1
fi
echo ""

# ── 2. Send synthetic events ──────────────────────────────────────────────────
printf "%bStep 2/3 — Sending %s synthetic %s event(s)%b\n" "$BOLD" "$COUNT" "$PROTOCOL" "$RESET"

# Map protocol → realistic dstPort
case "$PROTOCOL" in
  ssh)   DST_PORT=22   ;;
  http)  DST_PORT=80   ;;
  ftp)   DST_PORT=21   ;;
  mysql) DST_PORT=3306 ;;
  port)  DST_PORT=3389 ;;
  smb)   DST_PORT=445  ;;
  *)     DST_PORT=9999 ;;
esac

# Resolve SENSOR_ID from .env, fall back to "test-sensor"
SENSOR_ID_VAL="\${SENSOR_ID:-test-sensor}"

SENT=0
FAIL=0
LAST_ID=""
_i=0
while [ $_i -lt "$COUNT" ]; do
  _i=$((_i + 1))
  # Generate a v4-like UUID using /proc/sys/kernel/random/uuid or fallback
  if [ -r /proc/sys/kernel/random/uuid ]; then
    EVENT_UUID=$(cat /proc/sys/kernel/random/uuid)
  else
    EVENT_UUID=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || echo "00000000-0000-4000-8000-$(date +%s%N | tail -c 12)")
  fi

  TS=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
  SRC_IP="198.51.100.$_i"   # TEST-NET-3 — unroutable, safe to use in tests

  BODY=$(printf '{"eventId":"%s","sensorId":"%s","protocol":"%s","srcIp":"%s","srcPort":%d,"dstPort":%d,"eventType":"auth","username":"test-user","password":"test-pass-%d","data":{"_test":true},"timestamp":"%s"}' \
    "$EVENT_UUID" "$SENSOR_ID_VAL" "$PROTOCOL" "$SRC_IP" $((30000 + _i)) "$DST_PORT" $_i "$TS")

  AUTH_HEADER=""
  [ -n "$TOKEN" ] && AUTH_HEADER="-H \"Authorization: Bearer $TOKEN\""

  RESP=$(eval curl -s -o /tmp/sensor_test_resp.json -w "%{http_code}" \
    -X POST "$INGEST_URL/ingest/protocol/event" \
    -H "Content-Type: application/json" \
    $AUTH_HEADER \
    -d "'$BODY'" \
    --max-time 10 2>/dev/null || echo "000")

  if [ "$RESP" = "201" ] || [ "$RESP" = "200" ]; then
    LAST_ID=$(python3 -c "import sys,json; d=json.load(open('/tmp/sensor_test_resp.json')); print(d.get('id',d.get('inserted','?')))" 2>/dev/null || echo "?")
    printf "  %b[+]%b  Event %d → HTTP %s  id=%s\n" "$GREEN" "$RESET" "$_i" "$RESP" "$LAST_ID"
    SENT=$((SENT + 1))
  else
    BODY_OUT=$(cat /tmp/sensor_test_resp.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',str(d))[:120])" 2>/dev/null || cat /tmp/sensor_test_resp.json 2>/dev/null || echo "(no body)")
    printf "  %b[-]%b  Event %d → HTTP %s  %s\n" "$RED" "$RESET" "$_i" "$RESP" "$BODY_OUT"
    FAIL=$((FAIL + 1))
  fi
  rm -f /tmp/sensor_test_resp.json
done
echo ""

# ── 3. Verify events landed ───────────────────────────────────────────────────
printf "%bStep 3/3 — Verifying events in ingest-api%b\n" "$BOLD" "$RESET"
if [ "$SENT" -gt 0 ]; then
  # Give the batch writer ~2 s to flush
  sleep 2
  STATS_RESP=$(curl -s --max-time 5 \
    \${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
    "$INGEST_URL/protocol-hits/stats" 2>/dev/null || echo "")

  PROTO_COUNT=$(echo "$STATS_RESP" | python3 -c "
import sys,json
rows=json.load(sys.stdin) if sys.stdin.readable() else []
rows = rows if isinstance(rows,list) else []
row=next((r for r in rows if r.get('protocol')=='$PROTOCOL'),None)
print(row['count'] if row else 'not found')
" 2>/dev/null || echo "?")

  printf "  %b[i]%b  Total %s events in DB: %s\n" "$GREEN" "$RESET" "$PROTOCOL" "$PROTO_COUNT"
  printf "  %b[i]%b  Events sent this run: %d / %d\n" "$GREEN" "$RESET" "$SENT" "$COUNT"
  if [ "$FAIL" -gt 0 ]; then
    printf "  %b[!]%b  %d event(s) rejected — check token / schema above\n" "$YELLOW" "$RESET" "$FAIL"
  fi
fi
echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
if [ "$FAIL" -eq 0 ] && [ "$SENT" -gt 0 ]; then
  printf "%b%bAll %d test event(s) accepted by ingest-api.%b\n" "$GREEN" "$BOLD" "$SENT" "$RESET"
  echo "  Check the dashboard → /sensors or /clients to see them appear."
elif [ "$SENT" -gt 0 ]; then
  printf "%b%b%d/%d events accepted, %d failed.%b\n" "$YELLOW" "$BOLD" "$SENT" "$COUNT" "$FAIL" "$RESET"
else
  printf "%b%bAll events rejected. Check your INGEST_SHARED_SECRET and ingest-api logs.%b\n" "$RED" "$BOLD" "$RESET"
  exit 1
fi
echo ""
ENDOFTEST
chmod +x "$DIR/sensor-test"
ln -sf "$DIR/sensor-test" /usr/local/bin/sensor-test 2>/dev/null || true

# --- Post-install health check ---
echo ""
echo "==> Running post-install health check..."
_INGEST_OK=false
_INGEST_URL=$(grep 'INGEST_API_URL' "$DIR/docker-compose.yml" 2>/dev/null | head -1 | sed 's/.*INGEST_API_URL[=:][[:space:]]*//' | tr -d '"' || true)
if [ -n "$_INGEST_URL" ]; then
  for _i in 1 2 3 4 5 6; do
    _CODE=$(curl -o /dev/null -s -w "%{http_code}" --max-time 5 "$_INGEST_URL/health" 2>/dev/null || echo "000")
    if [ "$_CODE" = "200" ]; then
      _INGEST_OK=true
      break
    fi
    sleep 5
  done
  if $_INGEST_OK; then
    echo "    Ingest API reachable."
  else
    echo "WARNING: ingest API did not respond at $_INGEST_URL (HTTP $_CODE)."
    echo "    Sensors will buffer events. Check connectivity, then run: sensor-status"
  fi
fi

_CONTAINERS_OK=true
EXITED_FINAL=$(docker compose ps --status=exited --format "{{.Service}}" 2>/dev/null || true)
if [ -n "$EXITED_FINAL" ]; then
  echo "WARNING: these containers are not running: $EXITED_FINAL"
  echo "    Run 'sensor-status --logs' to diagnose."
  _CONTAINERS_OK=false
fi

echo ""
if $_INGEST_OK && $_CONTAINERS_OK; then
  echo "===================================================="
  echo " Sensor is UP and connected."
  echo " Dashboard:   check /sensors -- it should appear in ~60s"
  echo " Status:      sensor-status"
  echo " Test:        sensor-test [--protocol ssh|http|ftp|mysql|port|smb]"
  echo " Logs:        cd $DIR && docker compose logs -f"
  echo " Update:      sensor-update"
  echo " Uninstall:   sensor-uninstall"{{controlPlaneNote}}
  echo "===================================================="
else
  echo "===================================================="
  echo " Sensor deployed but needs attention."
  echo " Run 'sensor-status' for details."
  echo " Test:        sensor-test"
  echo " Update:      sensor-update"
  echo " Uninstall:   sensor-uninstall"
  echo "===================================================="
fi
`