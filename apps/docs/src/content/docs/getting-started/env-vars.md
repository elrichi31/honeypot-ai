---
title: Variables de entorno
description: Referencia completa de todas las variables de entorno del proyecto.
---

import { Aside } from '@astrojs/starlight/components';

## Raiz del proyecto (`.env`)

Usado por Docker Compose para pasar valores a los contenedores.

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | — | **Requerido.** Clave secreta de sesiones. Genera con `openssl rand -base64 32` |
| `POSTGRES_PASSWORD` | — | **Requerido en prod.** Contrasena de PostgreSQL. Usa una cadena larga aleatoria. |
| `INGEST_SHARED_SECRET` | — | **Recomendado.** Token que autoriza `POST /ingest/*`. Si no se define, el endpoint queda abierto. |
| `BETTER_AUTH_URL` | `http://localhost:4000` | URL publica del dashboard. Debe coincidir exactamente con el origen que ve el navegador. |
| `HONEYPOT_IP` | — | IP publica del VPS honeypot. Pre-carga el campo en la pagina Settings. |
| `HONEYPOT_SSH_PORT` | `22` | Puerto SSH de Cowrie (donde se conectan los atacantes). |
| `HONEYPOT_INGEST_PORT` | `8022` | Puerto SSH admin del VPS (canal honeypot → puller en topologia dos hosts). |
| `DASHBOARD_TIMEZONE` | `UTC` | Zona horaria IANA para las graficas del dashboard. Ej: `America/Bogota`, `Europe/Madrid`. |

<Aside type="caution">
`BETTER_AUTH_URL` debe coincidir **exactamente** con el origen desde el que accedes al dashboard (protocolo + host + puerto). Si usas un tunnel SSH con puerto distinto al `4000`, actualiza esta variable o better-auth rechazara el login con `Invalid origin`.
</Aside>

---

## Dashboard (`apps/dashboard/.env`)

| Variable | Dev default | Descripcion |
|----------|-------------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | URL que usa el **navegador** para llamar a ingest-api. En Docker se sobreescribe con la IP del contenedor. |
| `INTERNAL_API_URL` | `http://localhost:3000` | URL interna server-side. Docker Compose la sobreescribe con `http://ingest-api:3000`. |
| `DATABASE_URL` | `postgresql://honeypot:honeypot@localhost:5432/honeypot` | Conexion a PostgreSQL. La usa better-auth para las sesiones. |
| `BETTER_AUTH_SECRET` | — | **Requerido.** Mismo valor que en el `.env` raiz. |
| `BETTER_AUTH_URL` | `http://localhost:4000` | URL base del dashboard (sin slash final). |
| `HONEYPOT_IP` | — | Pre-carga el campo IP en Settings. |
| `HONEYPOT_SSH_PORT` | `22` | Pre-carga el puerto SSH en Settings. |
| `HONEYPOT_INGEST_PORT` | `8022` | Pre-carga el puerto ingest en Settings. |
| `DASHBOARD_TIMEZONE` | `UTC` | Zona horaria para las graficas. |

---

## Ingest API (`apps/ingest-api/.env`)

| Variable | Dev default | Descripcion |
|----------|-------------|-------------|
| `DATABASE_URL` | `postgresql://honeypot:honeypot@localhost:5432/honeypot` | Conexion a PostgreSQL. |
| `INGEST_SHARED_SECRET` | — | Si se define, exige el header `X-Ingest-Token` en todos los `POST /ingest/*`. |
| `PORT` | `3000` | Puerto donde escucha la API. |
| `HOST` | `0.0.0.0` | Interfaz de red. En prod single-host no se publica al exterior. |

---

## Log Puller (`scripts/pull-cowrie-logs.sh`)

Variables de entorno leidas por el script del puller. En Docker Compose se pasan via `environment:`.

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `DIRECT_FILE` | `false` | `true` para leer el log directamente desde el volumen (modo single-host). `false` para leer por SSH (modo dos hosts). |
| `DIRECT_LOG` | `/cowrie/cowrie-git/var/log/cowrie/cowrie.json` | Ruta del log cuando `DIRECT_FILE=true`. |
| `API_URL` | `http://localhost:3000` | URL base de ingest-api. |
| `INGEST_SHARED_SECRET` | — | Token que el puller envia como header `X-Ingest-Token`. |
| `VPS_HOST` | — | IP o hostname del VPS honeypot (solo modo SSH). |
| `VPS_SSH_PORT` | `8022` | Puerto SSH admin del VPS (solo modo SSH). |
| `VPS_USER` | `root` | Usuario SSH (solo modo SSH). |
| `SSH_KEY` | `~/.ssh/honeypot_vps` | Ruta a la clave privada SSH (solo modo SSH). |
| `REMOTE_LOG` | `/root/honeypot-ai/cowrie.json` | Ruta del log en el VPS remoto (solo modo SSH). |
| `POLL_INTERVAL` | `3` | Segundos entre lecturas del log. |

---

## Generar secrets

```bash
# BETTER_AUTH_SECRET y POSTGRES_PASSWORD y INGEST_SHARED_SECRET
openssl rand -base64 32
openssl rand -base64 32
openssl rand -base64 32
```

O en un solo bloque para el arranque de prod:

```bash
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
export POSTGRES_PASSWORD=$(openssl rand -base64 32)
export INGEST_SHARED_SECRET=$(openssl rand -base64 32)
```
