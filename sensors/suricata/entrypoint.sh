#!/bin/sh
set -e

IFACE="${SURICATA_INTERFACE:-eth0}"

mkdir -p /var/log/suricata 2>/dev/null || true

# Download rules if not present (first run when using jasonish/suricata:latest directly)
if [ ! -f /var/lib/suricata/rules/suricata.rules ]; then
  echo "[suricata] Rules not found — running suricata-update (first run, takes ~1 min)..."
  suricata-update update-sources 2>/dev/null || true
  suricata-update enable-source et/open 2>/dev/null || true
  suricata-update
fi

echo "[suricata] Starting on interface: ${IFACE}"
echo "[suricata] Rules: $(wc -l < /var/lib/suricata/rules/suricata.rules 2>/dev/null || echo 0) signatures loaded"

exec suricata \
  -c /opt/suricata.yaml \
  -i "${IFACE}" \
  --init-errors-fatal \
  -v
