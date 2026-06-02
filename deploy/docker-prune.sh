#!/bin/sh
# Reclaim Docker disk on the HOST: build cache + dangling/unused images.
# Safe — does NOT touch running containers, named volumes, or your data.
#
# The build cache grows every time you run `docker compose ... up --build`;
# left unchecked it filled this box to 78%. Run this from a weekly cron.
#
# Install (as root):
#   (crontab -l 2>/dev/null; echo "0 4 * * 0 /root/honeypot-ai/deploy/docker-prune.sh >> /var/log/docker-prune.log 2>&1") | crontab -
set -eu

echo "[docker-prune] $(date): before:"
df -h / | tail -1

# Build cache older than 24h (keeps recent layers so today's deploys stay fast).
docker builder prune -af --filter 'until=24h' || true

# Images not used by any container.
docker image prune -af || true

echo "[docker-prune] $(date): after:"
df -h / | tail -1
