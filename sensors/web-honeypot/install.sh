#!/usr/bin/env bash
set -euo pipefail

SENSOR_NAME="web-honeypot"
SENSOR_DIR="$(cd "$(dirname "$0")" && pwd)"
CONF_D="${SENSOR_DIR}/../../vector/conf.d"

mkdir -p "${CONF_D}"
cp "${SENSOR_DIR}/vector.toml" "${CONF_D}/${SENSOR_NAME}.toml"

docker compose up -d vector "${SENSOR_NAME}"
docker kill --signal=SIGHUP vector >/dev/null

echo "${SENSOR_NAME} instalado y Vector recargado."
