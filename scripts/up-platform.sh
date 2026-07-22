#!/usr/bin/env bash
# One-shot, idempotent bring-up for the PLATFORM-ONLY prod stack
# (docker-compose.prod.platform.yml): postgres + replica + pgbouncer + redis +
# kafka + ingest-api + dashboard. No sensors — those run on separate honeypot
# hosts (docker-compose.prod.honeypot.yml).
#
# Unlike single-host, the platform primary creates the replication role/slot in
# its init script and the ingest-api runs `prisma migrate deploy` on startup, so
# this is mostly: validate env, bring the stack up, wait for every healthcheck,
# then verify replication / kafka / migrations / HTTP endpoints are actually OK.
#
# Safe to re-run on every deploy.
#
# Usage:
#   ./scripts/up-platform.sh              # build + up + checks
#   ./scripts/up-platform.sh --no-build   # up + checks, skip image rebuild
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.platform.yml"
ENV_FILE=".env"
DB_USER="honeypot"      # hardcoded in the platform compose (POSTGRES_USER)
DB_NAME="honeypot_prod" # hardcoded in the platform compose (POSTGRES_DB)
BUILD=1
FAILURES=0

log()  { echo "[up-platform] $*"; }
ok()   { echo "  [ok]   $*"; }
warn() { echo "  [warn] $*"; }
fail() { echo "  [FAIL] $*" >&2; FAILURES=$((FAILURES + 1)); }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) BUILD=0 ;;
    -h|--help)
      sed -n '2,20p' "$0"; exit 0 ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      echo "Usage: $0 [--no-build]" >&2
      exit 1 ;;
  esac
  shift
done

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

# ---------------------------------------------------------------------------
# 1. Preflight
# ---------------------------------------------------------------------------
log "preflight checks"
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker not found on PATH" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: 'docker compose' (v2) not available" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "ERROR: docker daemon not reachable (is it running / do you have perms?)" >&2; exit 1; }
[[ -f "$COMPOSE_FILE" ]] || { echo "ERROR: $COMPOSE_FILE not found — run from the repo root." >&2; exit 1; }
ok "docker + compose + daemon reachable, $COMPOSE_FILE present"

COMPOSE_CMD=(docker compose -f "$COMPOSE_FILE")

# ---------------------------------------------------------------------------
# 2. Env — seed replication defaults (like setup-replica), require real secrets
# ---------------------------------------------------------------------------
log "checking $ENV_FILE"
touch "$ENV_FILE"

if ! grep -q '^REPLICATION_USER=' "$ENV_FILE"; then
  echo 'REPLICATION_USER=replicator' >> "$ENV_FILE"; ok "seeded REPLICATION_USER"
fi
if ! grep -q '^REPLICATION_SLOT=' "$ENV_FILE"; then
  echo 'REPLICATION_SLOT=honeypot_replica_slot' >> "$ENV_FILE"; ok "seeded REPLICATION_SLOT"
fi
if ! grep -q '^REPLICATION_PASSWORD=' "$ENV_FILE"; then
  echo "REPLICATION_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')" >> "$ENV_FILE"
  ok "generated REPLICATION_PASSWORD"
fi

set -a; . "./$ENV_FILE"; set +a

# These are real secrets — never auto-generate them silently, just refuse to
# start without them so a half-configured deploy fails loud and early.
MISSING=0
for var in POSTGRES_PASSWORD INGEST_SHARED_SECRET BETTER_AUTH_SECRET; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: $var is not set in $ENV_FILE" >&2
    MISSING=1
  fi
done
[[ "$MISSING" -eq 0 ]] || { echo "ERROR: set the missing secrets above and re-run." >&2; exit 1; }
ok "required secrets present (POSTGRES_PASSWORD, INGEST_SHARED_SECRET, BETTER_AUTH_SECRET)"

# ---------------------------------------------------------------------------
# 3. Bring the stack up
# ---------------------------------------------------------------------------
if [[ "$BUILD" -eq 1 ]]; then
  log "building + starting the platform stack (docker compose up --build -d)"
  "${COMPOSE_CMD[@]}" up --build -d
else
  log "starting the platform stack (docker compose up -d)"
  "${COMPOSE_CMD[@]}" up -d
fi

# ---------------------------------------------------------------------------
# 4. Wait for every healthchecked service to report healthy
# ---------------------------------------------------------------------------
wait_healthy() {
  local container="$1" label="$2" tries="${3:-60}"
  log "waiting for ${label} (${container})"
  for _ in $(seq 1 "$tries"); do
    local status
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}nohc{{end}}' "$container" 2>/dev/null || echo "missing")
    case "$status" in
      healthy) ok "${label} healthy"; return 0 ;;
      nohc)    ok "${label} up (no healthcheck)"; return 0 ;;
    esac
    sleep 3; printf '.'
  done
  # Don't `return 1` here: under `set -e` that would abort before the post-checks
  # and summary run. Record the failure (FAILURES) and let the run finish so the
  # operator sees the full picture; the final exit code reflects it.
  echo; fail "${label} never became healthy — check: docker logs ${container}"
}

# kafka has a 60s start_period, so give it the most headroom.
wait_healthy honeypot-postgres          "postgres (primary)" 60
wait_healthy honeypot-postgres-replica  "postgres (replica)" 80
wait_healthy honeypot-redis             "redis"              40
wait_healthy honeypot-kafka             "kafka"             120
wait_healthy ingest-api                 "ingest-api"        100
wait_healthy honeypot-dashboard         "dashboard"          80

# ---------------------------------------------------------------------------
# 5. Post-checks — verify the things healthchecks don't cover
# ---------------------------------------------------------------------------
log "verifying stack health"

# 5a. Streaming replication (expect a row with state=streaming on the primary)
if docker exec -i honeypot-postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc \
     "SELECT state FROM pg_stat_replication;" 2>/dev/null | grep -q "streaming"; then
  ok "replication: replica is streaming"
else
  fail "replication: no streaming replica in pg_stat_replication — check: docker logs honeypot-postgres-replica"
fi

# 5b. Kafka init created the topics (the one-shot job must have exited 0)
KAFKA_INIT_EXIT=$(docker inspect -f '{{.State.ExitCode}}' honeypot-kafka-init 2>/dev/null || echo "missing")
if [[ "$KAFKA_INIT_EXIT" == "0" ]]; then
  ok "kafka: topics created (kafka-init exited 0)"
else
  fail "kafka: kafka-init exit=${KAFKA_INIT_EXIT} — topics may be missing (docker logs honeypot-kafka-init)"
fi

# 5c. Migrations applied (ingest-api entrypoint runs prisma migrate deploy)
if docker logs ingest-api 2>&1 | grep -q "Database schema applied"; then
  ok "migrations: prisma schema applied"
else
  warn "migrations: no 'Database schema applied' line yet — check: docker logs ingest-api"
fi

# 5d. HTTP endpoints reachable from the host
if curl -fsS -o /dev/null --max-time 10 http://localhost:3000/health 2>/dev/null; then
  ok "ingest-api: GET /health 200 (port 3000, public)"
else
  fail "ingest-api: /health not reachable on localhost:3000"
fi

if curl -fsS -o /dev/null --max-time 10 http://localhost:4000/login 2>/dev/null; then
  ok "dashboard: GET /login 200 (port 4000, loopback-only)"
else
  fail "dashboard: /login not reachable on localhost:4000"
fi

# ---------------------------------------------------------------------------
# 6. Summary
# ---------------------------------------------------------------------------
echo
"${COMPOSE_CMD[@]}" ps
echo
if [[ "$FAILURES" -eq 0 ]]; then
  log "all checks passed ✔"
  echo
  echo "  Dashboard is loopback-only. Reach it over the VPN with an SSH tunnel:"
  echo "    ssh -L 4000:127.0.0.1:4000 <user>@<honeytrap>   then open http://localhost:4000"
  echo "  ingest-api (:3000) is the public/tunnelled surface sensors POST to."
  exit 0
else
  log "${FAILURES} check(s) FAILED — see the [FAIL] lines above."
  exit 1
fi
