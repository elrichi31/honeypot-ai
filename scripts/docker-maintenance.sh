#!/usr/bin/env bash

set -euo pipefail

KEEP_HOURS="${KEEP_HOURS:-168}"
LOG_DIR="${DOCKER_LOG_DIR:-/var/lib/docker/containers}"
TRUNCATE_LOGS="${TRUNCATE_LOGS:-0}"
LOG_SIZE_LIMIT="${LOG_SIZE_LIMIT:-200M}"

echo "==> Docker disk usage before cleanup"
docker system df || true

echo
echo "==> Pruning builder cache older than ${KEEP_HOURS}h"
docker builder prune -af --filter "until=${KEEP_HOURS}h"

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
echo "==> Docker disk usage after cleanup"
docker system df || true

echo
echo "Cleanup completed."
