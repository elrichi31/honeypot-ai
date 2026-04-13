#!/bin/bash
# Run the honeypot seed script inside the running Docker container.
# Usage: bash scripts/seed.sh

set -euo pipefail

echo "🌱  Running seed inside ingest-api container..."
docker compose exec ingest-api npx tsx prisma/seed.ts
