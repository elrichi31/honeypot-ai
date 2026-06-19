# CI/CD Pipeline

Auto-redeploy to VPS on every push to `master`, gated behind a CI suite that
validates both apps. Portable: moving to a new VPS takes three commands.

## Architecture

```
push → master
  └─ CI (ci.yml)
        ├─ ingest-api: migrate + tsc + vitest
        ├─ dashboard: tsc + tsx tests
        └─ dashboard-build: next build   (depends on dashboard job)
              │
              └─ on success → Deploy (deploy.yml)
                    └─ SSH into VPS
                         git fetch + reset --hard origin/master
                         docker compose up --build -d
                         prisma migrate deploy
                         docker image prune -f
```

Key properties:
- Deploy only fires if CI passes (`workflow_run` + `conclusion == 'success'`).
- `concurrency: group: deploy-production, cancel-in-progress: false` — if two
  pushes land back to back the second deploy queues instead of cancelling.
- `git reset --hard origin/master` (not `git pull`) — discards any local
  divergence on the VPS, keeps the server state deterministic.

## Files

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | CI jobs (see below) |
| `.github/workflows/deploy.yml` | Deploy job (SSH via `appleboy/ssh-action@v1`) |
| `docker-compose.prod.single-host.yml` | Production compose file used on VPS |

## CI jobs detail

### `ingest-api` job

Spins up a Postgres 16 service, runs migrations against it, type-checks, runs
tests.

```yaml
env:
  DATABASE_URL: postgresql://honeypot:honeypot@localhost:5432/honeypot_test
  DIRECT_DATABASE_URL: postgresql://honeypot:honeypot@localhost:5432/honeypot_test
  INGEST_SHARED_SECRET: test-secret
```

`DIRECT_DATABASE_URL` is required by `prisma/schema.prisma` (line 8 —
`directUrl = env("DIRECT_DATABASE_URL")`). In CI it equals `DATABASE_URL`
since there's no pgbouncer.

### `dashboard` job

Type-check (`tsc --noEmit`) + `npm test` (`tsx --test lib/**/*.test.ts`).
No lint step — project has no `.eslintrc` config file; `tsc` covers type safety.

### `dashboard-build` job

`next build` with placeholder env vars so the build doesn't crash at build time
on missing secrets. Runs after `dashboard` job passes (`needs: dashboard`).

```yaml
env:
  NEXT_PUBLIC_API_URL: http://localhost:3000
  DATABASE_URL: postgresql://placeholder:placeholder@localhost/placeholder
  BETTER_AUTH_SECRET: ci-placeholder-secret-32-chars-xxxx
  BETTER_AUTH_URL: http://localhost:3001
```

## GitHub Secrets (environment: `production`)

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | IP or hostname of the VPS |
| `VPS_USER` | SSH username |
| `VPS_SSH_KEY` | Private SSH key for the deploy user |
| `VPS_PORT` | SSH port (defaults to 22 if not set) |

These are scoped to the `production` environment in GitHub → Settings →
Environments.

## VPS setup (one-time)

```bash
# 1. Clone the repo
git clone https://github.com/elrichi31/honeypot-ai.git ~/honeypot-ai
cd ~/honeypot-ai

# 2. Copy and fill in secrets
cp .env.example .env
# edit .env with real values

# 3. Start services
docker compose -f docker-compose.prod.single-host.yml up -d
```

After this, every push to master redeploys automatically.

## Moving to a new VPS

1. Repeat the VPS setup above on the new machine.
2. Update `VPS_HOST` (and `VPS_SSH_KEY` / `VPS_USER` if changed) in GitHub
   Secrets → environment `production`.
3. Push any commit to master to trigger the first deploy (or re-run the last
   Deploy workflow manually from GitHub Actions).

No other changes needed — all config lives in the repo + the `.env` file.

## Done

- **2026-06-19 — Pipeline bootstrapped.** Created `ci.yml` and `deploy.yml`.
  Fixed three issues found during initial runs:
  - Removed lint step (no `.eslintrc` → `eslint`/`next lint` both fail).
  - Added `DIRECT_DATABASE_URL` to ingest-api CI env (Prisma schema requires it).
  - Replaced `git pull` with `git fetch + git reset --hard` on VPS to fix
    "divergent branches" error caused by a previous manual commit on the server.
  All three CI jobs green; deploy workflow executing on every passing push.

## Open / TODO

- Add `.env.example` to the repo so the VPS setup step is self-documenting.
- Consider caching `node_modules` across CI runs (currently `npm ci` re-downloads
  on every push; `actions/setup-node` cache only caches the npm registry cache).
- Smoke test after deploy (e.g. `curl -f http://VPS_HOST/api/health`) so the
  Deploy job fails if the container comes up broken.
- Suricata has no deploy step — not in any docker-compose yet.
- Galah is not in any docker-compose yet.
- Vector is missing from the production compose file.
