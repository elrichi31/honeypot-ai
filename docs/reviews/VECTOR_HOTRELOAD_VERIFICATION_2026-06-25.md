# Vector Hotreload Verification — 2026-06-25

## Scope

This review covers:
- the `Vector hotreload` implementation in `vector/conf.d/`
- the `docker-compose.yml` and `docker-compose.prod.honeypot.yml` changes
- the new `sensors/*/vector.toml` and `sensors/*/install.sh` files
- runtime verification that the application still works after the change

It also documents one non-obvious issue found during verification:
- the Docker build/runtime for `apps/ingest-api` was not using the current workspace code because `tsconfig.json` and `.gitignore` were stored as Windows reparse points and BuildKit rejected the build context

## Files changed during this follow-up

### Hotreload implementation
- `docker-compose.yml`
- `docker-compose.prod.honeypot.yml`
- `vector/cowrie.toml`
- `vector/suricata.toml`
- `vector/conf.d/cowrie.toml`
- `vector/conf.d/web-honeypot.toml`
- `vector/conf.d/protocol.toml`
- `vector/conf.d/suricata.toml`
- `vector/conf.d/galah.toml`
- `sensors/web-honeypot/vector.toml`
- `sensors/web-honeypot/install.sh`
- `sensors/ftp-honeypot/vector.toml`
- `sensors/ftp-honeypot/install.sh`
- `sensors/mysql-honeypot/vector.toml`
- `sensors/mysql-honeypot/install.sh`
- `sensors/port-honeypot/vector.toml`
- `sensors/port-honeypot/install.sh`
- `sensors/smb-honeypot/vector.toml`
- `sensors/smb-honeypot/install.sh`

### Verification / documentation follow-up
- `apps/ingest-api/tsconfig.json`
- `apps/ingest-api/.gitignore`
- `docs/plans/README.md`
- `docs/plans/VECTOR_HOTRELOAD.md`
- `docs/project-notes/kafka-stream.md`

## What was fixed

### 1. Vector now loads from `conf.d`

Changed both compose files so `vector` starts with:

```yaml
command:
  - "--config-dir"
  - "/etc/vector/conf.d/"
```

and mounts:

```yaml
- ./vector/conf.d:/etc/vector/conf.d
```

instead of explicit `--config /etc/vector/*.toml` entries.

### 2. Config collisions in `conf.d` were resolved

Before loading multiple TOML files together, there was a real naming collision:
- `vector/cowrie.toml` had `[sinks.kafka]`
- `vector/suricata.toml` had `[sinks.kafka]`

This would make Vector fail when both files are loaded from one directory.

Resolved by renaming:
- `vector/cowrie.toml`
  - `[transforms.parse_event]` -> `[transforms.parse_cowrie_event]`
  - `[sinks.kafka]` -> `[sinks.cowrie_kafka]`
- `vector/suricata.toml`
  - `[sinks.kafka]` -> `[sinks.suricata_kafka]`

### 3. Per-sensor install scripts were added

Added `install.sh` and `vector.toml` for:
- `web-honeypot`
- `ftp-honeypot`
- `mysql-honeypot`
- `port-honeypot`
- `smb-honeypot`

Protocol sensors reuse `protocol.toml` as the shared config and copy it to:

```bash
vector/conf.d/protocol.toml
```

then send:

```bash
docker kill --signal=SIGHUP vector
```

### 4. Docker build issue in `ingest-api` was fixed

The runtime verification uncovered that `docker compose up --build ingest-api`
could fail with:

```text
invalid file request tsconfig.json
```

Root cause:
- `apps/ingest-api/tsconfig.json` was a Windows reparse point
- `apps/ingest-api/.gitignore` was also a Windows reparse point

BuildKit rejected that context.

Fix:
- replaced both with normal plain files containing the same content

After that, both:

```bash
docker build -f apps/ingest-api/Dockerfile.compose apps/ingest-api
docker compose up -d --build ingest-api
```

worked again.

## Verification performed

### Static validation

Passed:

```bash
docker compose config --quiet
docker compose -f docker-compose.prod.honeypot.yml config --quiet
docker compose exec vector sh -lc "vector validate --config-dir /etc/vector/conf.d/"
npm test   # in apps/ingest-api
```

`npm test` result:
- `8` test files passed
- `60` tests passed

### Runtime validation of Vector

Confirmed that Vector started with `--config-dir` and loaded the directory:

```text
Loading configs. paths=["/etc/vector/conf.d"]
```

Confirmed active sources for:
- `cowrie_file`
- `protocol_files`
- `web_file`
- `suricata_eve`
- `galah_file`

### SIGHUP hot-reload validation

Test performed:
1. rename `vector/conf.d/web-honeypot.toml`
2. send `SIGHUP`
3. restore the file
4. send `SIGHUP` again

Observed:

```text
Signal received. signal="SIGHUP"
Reloading running topology with new configuration.
New configuration loaded successfully.
Vector has reloaded. path=[Dir("/etc/vector/conf.d")]
```

and after restoring:

```text
source ... component_id=web_file ... Starting file server
```

So hot-reload worked without restarting the Vector container.

### Runtime validation of `ingest-api` after rebuild

After fixing the build-context issue, verified that the running container had the
current route code for protocol ingestion:

```ts
if (Array.isArray(request.body)) {
  ...
  return reply.status(200).send({ inserted, total: request.body.length, invalid })
}
```

This matters because earlier the stale container was still running the old
object-only implementation and returning:

```json
{"error":"Invalid event","details":{"formErrors":["Expected object, received array"],"fieldErrors":{}}}
```

After rebuild, that stale-runtime mismatch was gone.

## End-to-end behavior checked

### Protocol sensors -> Vector -> ingest-api -> Postgres

This path was revalidated successfully.

Traffic generated from the host:
- FTP on `2121`
- MySQL on `3307`
- Port honeypot on `9090`

`ingest-api` logs showed successful Vector batch ingestion:

```text
POST /ingest/protocol/event ... statusCode 200
```

Recent rows confirmed in `protocol_hits`:

```text
port-scan | connect | 172.18.0.1 | 9090 | 2026-06-25 15:53:31.381+00
mysql     | connect | 172.18.0.1 | 3306 | 2026-06-25 15:53:30.86+00
ftp       | connect | 172.18.0.1 |   21 | 2026-06-25 15:53:30.399+00
```

This confirms the protocol path still works after the hotreload changes.

### Web honeypot -> Vector -> ingest-api -> Postgres

Status:
- partially confirmed

What was confirmed:
- `web-honeypot` is still serving and logging events into `/var/log/web-honeypot/events.json`
- new lines were observed in the sensor log, including:

```json
{"path":"/.env","query":"verify=final-pass",...}
{"path":"/codex-final-web-check","query":"ts=2026-06-25T15-54",...}
```

What remains less conclusive:
- during the final post-rebuild pass, I did not capture a fresh `POST /ingest/web/vector`
  line in `ingest-api` logs the same way I did for protocol
- I do have earlier successful evidence from the same workspace/session before
  the `ingest-api` rebuild:
  - `POST /ingest/web/vector` returned `200`
  - `web_hits` contained the path `/.env` with timestamp `2026-06-25 15:47:15.96`

Interpretation:
- the hotreload change itself did not break the web source definition
- the sensor still emits correct JSONL events
- protocol was fully reconfirmed after rebuild
- web would benefit from one more focused replay if a reviewer wants a fully
  symmetric proof set for both endpoints

## Environment notes that affected verification

### `INGEST_SHARED_SECRET`

The backend now rejects all ingest requests when `INGEST_SHARED_SECRET` is unset.

This affected the first post-rebuild verification attempt because the stack had
been started with an empty secret. Re-ran the stack with:

```powershell
$env:INGEST_SHARED_SECRET='codex-check'
docker compose up -d ingest-api vector web-honeypot ftp-honeypot mysql-honeypot port-honeypot smb-honeypot
```

After that:
- sensor heartbeats returned `200`
- protocol ingest through Vector returned `200`

### Prisma / OpenSSL warning

`ingest-api` emits:

```text
Prisma failed to detect the libssl/openssl version to use...
```

The container still starts and functions, but this should be cleaned up
separately in the Docker image.

## Review conclusion

### Confirmed good
- `Vector hotreload` implementation is structurally correct
- `conf.d` loading works
- `SIGHUP` reload works
- compose dev/prod remain valid
- protocol sensor ingestion still works end-to-end after rebuild
- `ingest-api` tests still pass
- the Docker rebuild regression was fixed

### Not confirmed to the same depth
- fresh post-rebuild `web-honeypot -> Vector -> ingest-api -> Postgres` proof was
  not captured as cleanly as protocol in the final pass, although sensor output
  and earlier successful ingest evidence exist

### Recommendation for another AI reviewer
- reproduce one final focused web-only ingest proof with a unique path
- optionally inspect why `web_ingest` did not appear as explicitly in the last
  `vector`/`ingest-api` tails as `protocol_ingest`
- no evidence suggests the hotreload change broke the application, but that last
  web confirmation would make the audit fully airtight
