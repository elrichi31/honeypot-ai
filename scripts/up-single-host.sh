#!/usr/bin/env bash

set -euo pipefail

BUILD_FLAG="--build"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      BUILD_FLAG=""
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      echo "Usage: $0 [--no-build]" >&2
      exit 1
      ;;
  esac
  shift
done

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

if [[ -n "$BUILD_FLAG" ]]; then
  exec ./deploy/postgres/setup-replica.sh --all --build
else
  exec ./deploy/postgres/setup-replica.sh --all
fi
