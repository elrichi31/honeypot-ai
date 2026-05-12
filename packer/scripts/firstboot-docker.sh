#!/bin/bash
# Runs once on first boot — installs Docker then enables sensor services
set -euo pipefail

exec >> /var/log/sensor-firstboot.log 2>&1
echo "[$(date -Is)] First boot: installing Docker..."

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

chown -R root:docker /opt/sensor
chmod -R 750 /opt/sensor
chmod +x /opt/sensor/sensor-provision.sh

systemctl daemon-reload
systemctl enable sensor-provision.service

echo "[$(date -Is)] Docker installed. Sensor provision service enabled."
