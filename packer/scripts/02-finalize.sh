#!/bin/bash
set -euo pipefail

echo "[02-finalize] Installing systemd services..."

# Install sensor-provision service (first-boot auto-config)
cp /tmp/sensor-provision.service /etc/systemd/system/sensor-provision.service
cp /tmp/sensor-provision.sh /opt/sensor/sensor-provision.sh
chmod +x /opt/sensor/sensor-provision.sh

# Install sensor service (starts docker compose on every boot after provisioning)
cp /tmp/sensor.service /etc/systemd/system/sensor.service

# Install SSH login health check
cp /tmp/sensor-health.sh /etc/profile.d/sensor-health.sh
chmod +x /etc/profile.d/sensor-health.sh

# ── Move sshd to port 8022 so cowrie can own port 22 ─────────────────────────
# Port 22  → cowrie (SSH honeypot, public-facing)
# Port 8022 → real sshd (admin access only)
cat > /etc/ssh/sshd_config.d/20-sensor-port.conf <<'EOF'
Port 8022
PermitRootLogin no
PasswordAuthentication yes
EOF

# Configure ufw
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 8022/tcp comment "admin SSH"
# Honeypot ports — allow inbound so attackers can reach them
ufw allow 22/tcp   comment "cowrie SSH honeypot"
ufw allow 2222/tcp comment "cowrie SSH honeypot (alt)"
ufw allow 80/tcp   comment "web honeypot"
ufw allow 8443/tcp comment "web honeypot HTTPS"
ufw allow 21/tcp   comment "ftp honeypot"
ufw allow 3306/tcp comment "mysql honeypot"
ufw allow 1433/tcp comment "mssql honeypot"
ufw allow 2375/tcp comment "docker honeypot"
ufw allow 3389/tcp comment "rdp honeypot"
ufw allow 4444/tcp comment "reverse shell honeypot"
ufw allow 5900/tcp comment "vnc honeypot"
ufw allow 6379/tcp comment "redis honeypot"
ufw allow 8888/tcp comment "jupyter honeypot"
ufw allow 9090/tcp comment "prometheus honeypot"
ufw allow 9200/tcp comment "elasticsearch honeypot"
ufw allow 27017/tcp comment "mongodb honeypot"
ufw --force enable

systemctl daemon-reload
systemctl enable sensor-provision.service

# sensor.service is NOT enabled yet — sensor-provision.service enables it on success

echo "[02-finalize] Installing docker-maintenance cron job..."

install -m 0755 /tmp/docker-maintenance.sh /opt/sensor/docker-maintenance.sh

# Run daily at 03:00
echo "0 3 * * * root /opt/sensor/docker-maintenance.sh >> /var/log/honeypot-maintenance.log 2>&1" \
  > /etc/cron.d/honeypot-maintenance
chmod 0644 /etc/cron.d/honeypot-maintenance

echo "[02-finalize] Installing logrotate config..."
cat > /etc/logrotate.d/honeypot << 'LOGROTATE'
/var/lib/docker/volumes/*_dionaea_var/_data/dionaea.json {
    daily
    rotate 3
    size 50M
    compress
    missingok
    copytruncate
    delaycompress
}

/var/lib/docker/volumes/*_cowrie_var/_data/log/cowrie/cowrie.json {
    daily
    rotate 2
    size 200M
    compress
    missingok
    copytruncate
    delaycompress
}
LOGROTATE

echo "[02-finalize] Cleaning up build artifacts..."

apt-get autoremove -y -qq
apt-get clean -qq
rm -rf /tmp/sensors /tmp/vector /tmp/docker-compose.yml
rm -rf /tmp/sensor-provision.sh /tmp/sensor-provision.service /tmp/sensor.service /tmp/sensor-health.sh
rm -rf /var/lib/apt/lists/*

# Zero out free space for better compression (optional but makes OVA smaller)
dd if=/dev/zero of=/tmp/zero.fill bs=1M 2>/dev/null || true
rm -f /tmp/zero.fill
sync

echo "[02-finalize] Done."
