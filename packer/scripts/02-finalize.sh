#!/bin/bash
set -euo pipefail

echo "[02-finalize] Installing systemd services..."

# Install sensor-provision service (first-boot auto-config)
cp /tmp/sensor-provision.service /etc/systemd/system/sensor-provision.service
cp /tmp/sensor-provision.sh /opt/sensor/sensor-provision.sh
chmod +x /opt/sensor/sensor-provision.sh

# Install sensor service (starts docker compose on every boot after provisioning)
cp /tmp/sensor.service /etc/systemd/system/sensor.service

systemctl daemon-reload
systemctl enable sensor-provision.service

# sensor.service is NOT enabled yet — sensor-provision.service enables it on success

echo "[02-finalize] Cleaning up build artifacts..."

apt-get autoremove -y -qq
apt-get clean -qq
rm -rf /tmp/sensors /tmp/vector /tmp/docker-compose.yml
rm -rf /tmp/sensor-provision.sh /tmp/sensor-provision.service /tmp/sensor.service
rm -rf /var/lib/apt/lists/*

# Zero out free space for better compression (optional but makes OVA smaller)
dd if=/dev/zero of=/tmp/zero.fill bs=1M 2>/dev/null || true
rm -f /tmp/zero.fill
sync

echo "[02-finalize] Done."
