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
    .replaceAll("{{clientLine}}", clientLine(clientSlug, clientName))
    .replaceAll("{{rawBase}}", rawBase)
    .replaceAll("{{sshPortStep}}", sshPortStep(services))
    .replaceAll("{{configDownloads}}", configDownloadLines(services))
    .replaceAll("{{compose}}", compose)
}

function clientLine(clientSlug: string, clientName: string) {
  return clientSlug ? `# Client: ${clientName || clientSlug} (${clientSlug})` : ""
}

function configDownloadLines(services: ServiceKey[]) {
  if (services.includes("internal-canary")) return internalCanaryDownloadLines()
  return [
    ...cowrieDownloadLines(services),
    `curl -fsSL "$RAW/vector/suricata.toml"            -o suricata.toml`,
    ...deceptionDownloadLines(services),
  ].join("\n")
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
    `curl -fsSL "$RAW/sensors/cowrie/heartbeat.py" -o heartbeat.py`,
    `curl -fsSL "$RAW/sensors/cowrie/cowrie.cfg"   -o cowrie.cfg`,
    `curl -fsSL "$RAW/sensors/cowrie/userdb.txt"   -o userdb.txt`,
    `curl -fsSL "$RAW/vector/cowrie.toml"          -o cowrie.toml`,
  ]
}

function sshPortStep(services: ServiceKey[]) {
  // Internal canary: cowrie claims port 22 on a dedicated VM — no real sshd to move.
  if (services.includes("internal-canary")) return ""
  return services.includes("ssh") ? SSH_PORT_STEP : ""
}

const SSH_PORT_STEP = `
# Move real sshd to port 8022 so Cowrie can claim port 22.
# Opens 8022 first, verifies it responds, then closes 22 — so a failure
# at any step leaves SSH accessible and the backup restores the original state.
if ss -tlnp | grep -q ':22 '; then
  echo "==> Moving sshd to port 8022 to free port 22 for Cowrie..."

  # Backup original config
  cp /etc/ssh/sshd_config /etc/ssh/sshd_config.pre-honeypot

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
  cat > "$SOCKET_DROP/override.conf" << 'EOF'
[Socket]
ListenStream=
ListenStream=8022
EOF
  systemctl daemon-reload
  if ! systemctl restart ssh.socket 2>/dev/null && ! systemctl restart sshd 2>/dev/null; then
    _ssh_rollback
    exit 1
  fi

  # Verify sshd is actually listening on 8022 before declaring success
  _SSH_VERIFIED=false
  for _i in 1 2 3 4 5; do
    if ss -tlnp | grep -q ':8022 '; then
      _SSH_VERIFIED=true
      break
    fi
    sleep 1
  done

  if [ "$_SSH_VERIFIED" = "false" ]; then
    echo "ERROR: sshd did not come up on port 8022 after restart." >&2
    _ssh_rollback
    exit 1
  fi

  echo "    sshd is now on port 8022. Reconnect with: ssh <user>@<host> -p 8022"
  echo "    Original config backed up at: /etc/ssh/sshd_config.pre-honeypot"
fi
`

const SCRIPT_TEMPLATE = `#!/usr/bin/env bash
# Honeypot sensor installer - generated by dashboard
# Sensors: {{services}} + Suricata IDS
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

echo "==> Honeypot sensor installer ({{services}} + Suricata IDS)"
{{sshPortStep}}
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

echo "==> Pulling images..."
docker compose pull

echo "==> Starting services..."
SURICATA_INTERFACE="$SURICATA_INTERFACE" docker compose up -d

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
echo "Suricata IDS is running on interface: $SURICATA_INTERFACE"

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

INGEST_URL="${INGEST_API_URL:-}"
TOKEN="${INGEST_SHARED_SECRET:-}"

echo ""
printf "%b=== Honeypot Sensor Test ===%b\n" "$BOLD" "$RESET"
printf "  Target: %s\n" "${INGEST_URL:-<not set>}"
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
SENSOR_ID_VAL="${SENSOR_ID:-test-sensor}"

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
    ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
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
  echo " Uninstall:   sensor-uninstall"
  echo "===================================================="
else
  echo "===================================================="
  echo " Sensor deployed but needs attention."
  echo " Run 'sensor-status' for details."
  echo " Test:        sensor-test"
  echo " Uninstall:   sensor-uninstall"
  echo "===================================================="
fi
`