#!/bin/bash
# Shows honeypot service health on SSH login.
# Installed at /etc/profile.d/sensor-health.sh

SENSOR_DIR=/opt/sensor

# Only run in interactive shells and if Docker is available
[[ $- == *i* ]] || return 0
command -v docker &>/dev/null || return 0
[ -f "$SENSOR_DIR/docker-compose.yml" ] || return 0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

MY_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo -e "${BOLD}=== Honeypot Sensor Health ===${RESET}"
echo -e "  ${CYAN}SSH sensor:${RESET} ssh sensor@${MY_IP:-<ip>} -p 8022"
echo ""

# Check if provision has completed
if [ ! -f "$SENSOR_DIR/.env" ] || ! grep -q "INGEST_SHARED_SECRET=." "$SENSOR_DIR/.env" 2>/dev/null; then
  if systemctl is-active --quiet sensor-provision.service 2>/dev/null; then
    echo -e "${YELLOW}⏳ Provisioning in progress...${RESET}"
    echo -e "   Check logs: ${CYAN}sudo journalctl -u sensor-provision -f${RESET}"
  else
    echo -e "${RED}✗ Not provisioned${RESET}"
    echo -e "  Check: ${CYAN}sudo cat /var/log/sensor-provision.log${RESET}"
  fi
  echo ""
  return 0
fi

# Get running containers
CONTAINERS=$(docker compose -f "$SENSOR_DIR/docker-compose.yml" --env-file "$SENSOR_DIR/.env" ps --format json 2>/dev/null)

if [ -z "$CONTAINERS" ]; then
  echo -e "${RED}✗ No containers found — sensors may not be started${RESET}"
  echo -e "  Start: ${CYAN}cd $SENSOR_DIR && sudo docker compose up -d${RESET}"
  echo ""
  return 0
fi

ALL_OK=true
OFFLINE_LIST=""

while IFS= read -r line; do
  [ -z "$line" ] && continue
  NAME=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Name','?'))" 2>/dev/null || echo "?")
  STATE=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('State','?'))" 2>/dev/null || echo "?")
  HEALTH=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Health',''))" 2>/dev/null || echo "")

  if [ "$STATE" = "running" ] && { [ -z "$HEALTH" ] || [ "$HEALTH" = "healthy" ]; }; then
    echo -e "  ${GREEN}✓${RESET} $NAME"
  elif [ "$STATE" = "running" ] && [ "$HEALTH" = "starting" ]; then
    echo -e "  ${YELLOW}⏳${RESET} $NAME (starting)"
    ALL_OK=false
    OFFLINE_LIST="$OFFLINE_LIST $NAME"
  else
    echo -e "  ${RED}✗${RESET} $NAME (${STATE}${HEALTH:+ / $HEALTH})"
    ALL_OK=false
    OFFLINE_LIST="$OFFLINE_LIST $NAME"
  fi
done < <(echo "$CONTAINERS" | python3 -c "
import sys, json
data = sys.stdin.read().strip()
# docker compose ps --format json emits one JSON object per line
for line in data.splitlines():
    line = line.strip()
    if line:
        print(line)
" 2>/dev/null)

echo ""
if $ALL_OK; then
  echo -e "${GREEN}${BOLD}All sensors OK${RESET}"
else
  echo -e "${YELLOW}${BOLD}Some sensors need attention${RESET}"
  echo -e "  Logs:    ${CYAN}cd $SENSOR_DIR && sudo docker compose logs --tail=50${RESET}"
  echo -e "  Restart: ${CYAN}cd $SENSOR_DIR && sudo docker compose up -d${RESET}"
fi

echo ""
