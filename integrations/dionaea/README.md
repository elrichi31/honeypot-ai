# Dionaea integration (MVP)

This integration starts HoneyTrap's first external multi-protocol sensor beyond Cowrie.

It is designed around Dionaea's official `log_json` ihandler and follows the same push model
already used by the rest of the platform:

1. Dionaea listens on exposed ports
2. Dionaea writes JSON events to disk
3. A lightweight shipper tails the JSON log
4. The shipper sends:
   - `/sensors/heartbeat`
   - `/ingest/protocol/event`

## Why Dionaea first

Dionaea is one of the best next integrations because it covers several protocols commonly
used in internet scanning and exploitation workflows:

- FTP
- MySQL
- SMB
- MSSQL
- RPC / EPMAP
- TFTP
- MQTT
- PPTP

This fits the current HoneyTrap architecture very well: one sensor can emit multiple
protocol families while the central API correlates everything by source IP.

## Current MVP scope

This first version focuses on **connection-level telemetry** from `log_json`.

Today it emits `connect` events into `protocol_hits` with:

- protocol
- source IP / port
- destination port
- timestamp
- raw Dionaea metadata in `data`

That gives us a real external integration quickly, without pretending we already support
all of Dionaea's richer capabilities like:

- malware downloads / binaries
- full artifact capture
- emulation-specific metadata
- protocol-specific auth semantics

Those can be added next as the integration matures.

## Files

- `docker-compose.sensor.yml` - standalone sensor bundle example
- `shipper.py` - tails Dionaea JSON log and pushes events to HoneyTrap
- `log_json.yaml` - sample Dionaea `log_json` ihandler config

## Assumptions

- We use the T-Pot-compatible Dionaea image:
  `ghcr.io/telekom-security/dionaea:24.04.1`
- Dionaea is installed under `/opt/dionaea`
- The JSON log path is:
  `/opt/dionaea/var/lib/dionaea/dionaea.json`

If your Dionaea image uses different paths, adjust:

- `DIONAEA_LOG_PATH`
- the mounted `log_json.yaml` destination
- volume mounts in `docker-compose.sensor.yml`

## Deploy model

This bundle is meant for a **remote sensor node** that forwards events to a central
HoneyTrap deployment, for example:

- `https://www.honeytrap.com/api`

Set:

- `INGEST_API_URL`
- `INGEST_SHARED_SECRET`
- `SENSOR_ID`
- `SENSOR_NAME`

and bring up the stack on the sensor host.

## Local testing

For local development, use the dedicated compose file:

- `docker-compose.local.yml`

It remaps privileged / collision-prone ports to high local ports:

- host `2021` -> Dionaea `21`
- host `2445` -> Dionaea `445`
- host `21433` -> Dionaea `1433`
- host `3308` -> Dionaea `3306`
- host `28081` -> Dionaea `8081`

This lets you run Dionaea alongside the existing local HoneyTrap stack without
fighting Windows or Docker Desktop over low ports.

### Step 1: start the HoneyTrap core locally

From the repo root:

```bash
docker compose up -d postgres ingest-api dashboard
```

Optional if you also want the existing local sensors:

```bash
docker compose up -d
```

### Step 2: create a local env file for Dionaea

From `integrations/dionaea`:

```bash
cp .env.local.example .env.local
```

If you're on PowerShell:

```powershell
Copy-Item .env.local.example .env.local
```

Set:

- `INGEST_SHARED_SECRET` to the same value used by your local HoneyTrap stack
- leave `INGEST_API_URL=http://host.docker.internal:3000` unless you changed the local API port

### Step 3: start Dionaea locally

```bash
docker compose --env-file .env.local -f docker-compose.local.yml up -d
```

### Step 4: verify the shipper

```bash
docker compose --env-file .env.local -f docker-compose.local.yml logs -f dionaea-shipper
```

You want to see:

- heartbeat success
- shipped events once traffic hits the sensor

### Step 5: generate traffic

Examples:

```bash
nc localhost 2021
nc localhost 2445
nc localhost 21433
nc localhost 3308
curl http://localhost:28081/
```

PowerShell alternatives:

```powershell
Test-NetConnection 127.0.0.1 -Port 2021
Test-NetConnection 127.0.0.1 -Port 2445
Test-NetConnection 127.0.0.1 -Port 21433
Test-NetConnection 127.0.0.1 -Port 3308
curl http://127.0.0.1:28081/
```

### Step 6: confirm events reached HoneyTrap

Check the API:

```bash
docker compose logs -f ingest-api
```

Query recent protocol hits:

```bash
docker compose exec postgres psql -U honeypot -d honeypot_prod -c "select protocol, src_ip, dst_port, event_type, timestamp from protocol_hits order by timestamp desc limit 20;"
```

### Step 7: stop local Dionaea

```bash
docker compose --env-file .env.local -f docker-compose.local.yml down
```
