#!/usr/bin/env bash

set -euo pipefail

KEEP_HOURS="${KEEP_HOURS:-48}"
LOG_DIR="${DOCKER_LOG_DIR:-/var/lib/docker/containers}"
TRUNCATE_LOGS="${TRUNCATE_LOGS:-1}"
LOG_SIZE_LIMIT="${LOG_SIZE_LIMIT:-100M}"
DISK_WARN_THRESHOLD="${DISK_WARN_THRESHOLD:-85}"
DIONAEA_VOLUME="${DIONAEA_VOLUME:-honeypot-ai_dionaea_var}"
BISTREAMS_KEEP_DAYS="${BISTREAMS_KEEP_DAYS:-7}"
BINARIES_KEEP_DAYS="${BINARIES_KEEP_DAYS:-30}"

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
echo "==> Pruning dangling images"
docker image prune -f

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
echo "==> Cleaning dionaea bistreams older than ${BISTREAMS_KEEP_DAYS} days"
docker run --rm -v "${DIONAEA_VOLUME}:/data" alpine \
  find /data/bistreams -type f -mtime "+${BISTREAMS_KEEP_DAYS}" -delete || true

echo
echo "==> Cleaning dionaea binaries older than ${BINARIES_KEEP_DAYS} days"
docker run --rm -v "${DIONAEA_VOLUME}:/data" alpine \
  find /data/binaries -type f -mtime "+${BINARIES_KEEP_DAYS}" -delete || true

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
