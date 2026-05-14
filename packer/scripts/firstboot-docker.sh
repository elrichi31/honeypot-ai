#!/bin/bash
# Runs once on first boot — expands disk, installs Docker, enables sensor services
set -euo pipefail

exec >> /var/log/sensor-firstboot.log 2>&1
echo "[$(date -Is)] First boot starting..."

# ── 1. Expand partition to fill the full disk ─────────────────────────────────
echo "[$(date -Is)] Expanding disk partition..."
apt-get install -y -qq cloud-guest-utils
# Find the root disk and partition number automatically
ROOT_DISK=$(lsblk -ndo pkname "$(findmnt -n -o SOURCE /)")
ROOT_PART=$(lsblk -ndo NAME "$(findmnt -n -o SOURCE /)")
PART_NUM=$(echo "$ROOT_PART" | grep -o '[0-9]*$')
growpart "/dev/$ROOT_DISK" "$PART_NUM" || true
resize2fs "/dev/$ROOT_PART" || true
echo "[$(date -Is)] Disk expanded: $(df -h / | tail -1)"

# ── 2. Install Docker ─────────────────────────────────────────────────────────
echo "[$(date -Is)] Installing Docker..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin open-vm-tools

usermod -aG docker sensor
systemctl enable docker

# ── 3. Set up sensor ──────────────────────────────────────────────────────────
chown -R root:docker /opt/sensor
chmod -R 750 /opt/sensor
chmod +x /opt/sensor/sensor-provision.sh

systemctl daemon-reload
systemctl enable sensor-provision.service

# ── 4. SSH on port 8022 (port 22 reserved for cowrie honeypot) ────────────────
cat > /etc/ssh/sshd_config.d/20-sensor-port.conf <<'EOF'
Port 8022
PasswordAuthentication yes
PermitRootLogin no
EOF
systemctl restart ssh || true

# ── 5. Firewall ───────────────────────────────────────────────────────────────
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 8022/tcp  comment "admin SSH"
ufw allow 22/tcp    comment "cowrie SSH honeypot"
ufw allow 2222/tcp  comment "cowrie SSH honeypot (alt)"
ufw allow 80/tcp    comment "web honeypot"
ufw allow 8443/tcp  comment "web honeypot HTTPS"
ufw allow 21/tcp    comment "ftp honeypot"
ufw allow 3306/tcp  comment "mysql honeypot"
ufw allow 1433/tcp  comment "mssql honeypot"
ufw allow 2375/tcp  comment "docker honeypot"
ufw allow 3389/tcp  comment "rdp honeypot"
ufw allow 4444/tcp  comment "reverse shell honeypot"
ufw allow 5900/tcp  comment "vnc honeypot"
ufw allow 6379/tcp  comment "redis honeypot"
ufw allow 8888/tcp  comment "jupyter honeypot"
ufw allow 9090/tcp  comment "prometheus honeypot"
ufw allow 9200/tcp  comment "elasticsearch honeypot"
ufw allow 27017/tcp comment "mongodb honeypot"
ufw --force enable

echo "[$(date -Is)] First boot complete. Ready for provisioning."
