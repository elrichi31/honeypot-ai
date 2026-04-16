---
title: Log Puller
description: Como el puller lee los logs de Cowrie y los envia a ingest-api.
---

El log-puller es un script Bash (`scripts/pull-cowrie-logs.sh`) que lee el archivo `cowrie.json` de forma continua y envia los eventos nuevos a `ingest-api` en batches.

Opera en dos modos segun el valor de `DIRECT_FILE`:

## Modo directo — `DIRECT_FILE=true`

Usado en **single-host**. El puller corre como contenedor Docker y accede al log de Cowrie directamente desde el volumen compartido `cowrie_var`.

```
cowrie_var (volumen Docker)
       │
       ├── cowrie (escribe cowrie.json)
       └── log-puller (lee cowrie.json directamente)
                │
        POST /ingest/cowrie/batch
                │
          ingest-api
```

```yaml
# docker-compose.prod.single-host.yml
log-puller:
  volumes:
    - cowrie_var:/cowrie/cowrie-git/var:ro   # solo lectura
  environment:
    DIRECT_FILE: "true"
    API_URL: http://ingest-api:3000
    INGEST_SHARED_SECRET: ${INGEST_SHARED_SECRET}
```

## Modo SSH — `DIRECT_FILE=false`

Usado en **topologia dos hosts**. El puller corre en el servidor app y entra al VPS honeypot por SSH para leer el log remotamente.

```
VPS honeypot                Servidor app
────────────                ────────────
cowrie.json  ◀── SSH ────  log-puller
                                │
                        POST /ingest/cowrie/batch
                                │
                          ingest-api
```

```bash
VPS_HOST=<ip> \
VPS_SSH_PORT=8022 \
VPS_USER=root \
SSH_KEY=$HOME/.ssh/honeypot_vps \
API_URL=http://localhost:3000 \
bash scripts/pull-cowrie-logs.sh
```

## Como funciona el polling

El script mantiene un cursor de la ultima linea leida en el log. Cada `POLL_INTERVAL` segundos (default: 3s):

1. Lee las lineas nuevas desde el cursor
2. Si hay lineas, las envia a `POST /ingest/cowrie/batch` con el header `X-Ingest-Token`
3. Avanza el cursor al final del archivo
4. Si el archivo roto (nuevo log despues de medianoche en Cowrie), resetea el cursor a cero

## Hardening del contenedor

```yaml
read_only: true         # filesystem inmutable
tmpfs:
  - /tmp
cap_drop:
  - ALL
no-new-privileges: true
pids_limit: 128
```

El puller solo tiene acceso a la red `honeypot_ingest` — puede llamar a `ingest-api` pero no al dashboard ni a postgres directamente.

## Correr el puller manualmente

```bash
# Modo directo (debug local)
DIRECT_FILE=true \
DIRECT_LOG=./cowrie.json \
API_URL=http://localhost:3000 \
bash scripts/pull-cowrie-logs.sh
```
