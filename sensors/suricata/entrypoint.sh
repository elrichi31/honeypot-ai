#!/bin/sh
set -e

IFACE="${SURICATA_INTERFACE:-eth0}"

echo "[suricata] Starting on interface: ${IFACE}"
echo "[suricata] Rules: $(wc -l < /var/lib/suricata/rules/suricata.rules 2>/dev/null || echo 0) signatures loaded"

mkdir -p /var/log/suricata

exec suricata \
  -c /etc/suricata/suricata.yaml \
  -i "${IFACE}" \
  --init-errors-fatal \
  -v
