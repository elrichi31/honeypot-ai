#!/usr/bin/env bash

set -euo pipefail

KEEP_HOURS="${KEEP_HOURS:-48}"
LOG_DIR="${DOCKER_LOG_DIR:-/var/lib/docker/containers}"
TRUNCATE_LOGS="${TRUNCATE_LOGS:-1}"
LOG_SIZE_LIMIT="${LOG_SIZE_LIMIT:-100M}"
DISK_WARN_THRESHOLD="${DISK_WARN_THRESHOLD:-85}"

echo "==> Docker disk usage before cleanup"
docker system df || true

echo
echo "==> Pruning builder cache older than ${KEEP_HOURS}h"
if docker buildx version &>/dev/null; then
  docker buildx prune -af --filter "until=${KEEP_HOURS}h"
else
  docker builder prune -af --filter "until=${KEEP_HOURS}h"
fi

echo
echo "==> Pruning unused images older than ${KEEP_HOURS}h"
docker image prune -af --filter "until=${KEEP_HOURS}h"

echo
echo "==> Pruning stopped containers older than ${KEEP_HOURS}h"
docker container prune -f --filter "until=${KEEP_HOURS}h"

echo
echo "==> Pruning unused networks older than ${KEEP_HOURS}h"
docker network prune -f --filter "until=${KEEP_HOURS}h"

if [[ "${TRUNCATE_LOGS}" == "1" && -d "${LOG_DIR}" ]]; then
  echo
  echo "==> Truncating oversized container logs in ${LOG_DIR} (>${LOG_SIZE_LIMIT})"
  find "${LOG_DIR}" -type f -name "*-json.log" -size "+${LOG_SIZE_LIMIT}" -print -exec truncate -s 0 {} \;
fi

echo
echo "==> Vacuuming system journal logs (keeping last 200M)"
journalctl --vacuum-size=200M || true

echo
echo "==> Docker disk usage after cleanup"
docker system df || true

echo
DISK_USAGE=$(df / | awk 'NR==2 {gsub("%",""); print $5}')
if [[ "${DISK_USAGE}" -ge "${DISK_WARN_THRESHOLD}" ]]; then
  echo "WARNING: Disk usage is at ${DISK_USAGE}% — still above ${DISK_WARN_THRESHOLD}% threshold after cleanup."
else
  echo "Disk usage is at ${DISK_USAGE}% — OK."
fi

echo
echo "Cleanup completed."
