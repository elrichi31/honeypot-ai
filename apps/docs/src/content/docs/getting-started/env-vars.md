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
| `HONEYPOT_INGEST_PORT` | `8022` | Puerto SSH admin del VPS. |
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
| `DISCORD_WEBHOOK_URL` | — | Webhook de Discord para alertas. Si no se define, las alertas estan desactivadas. |

---

## Ingest API (`apps/ingest-api/.env`)

| Variable | Dev default | Descripcion |
|----------|-------------|-------------|
| `DATABASE_URL` | `postgresql://honeypot:honeypot@localhost:5432/honeypot` | Conexion a PostgreSQL. |
| `INGEST_SHARED_SECRET` | — | Si se define, exige el header `X-Ingest-Token` en todos los `POST /ingest/*`. |
| `PORT` | `3000` | Puerto donde escucha la API. |
| `HOST` | `0.0.0.0` | Interfaz de red. En prod single-host no se publica al exterior. |
| `DISCORD_WEBHOOK_URL` | — | Webhook de Discord para alertas de login exitoso y risk score alto. |

---

## Vector (Log Shipper)

Variables de entorno leidas por el contenedor Vector. Se pasan via `environment:` en Docker Compose.

| Variable | Descripcion |
|----------|-------------|
| `COWRIE_LOG_PATH` | Ruta al archivo `cowrie.json` dentro del contenedor. Valor tipico: `/cowrie/cowrie-git/var/log/cowrie/cowrie.json` |
| `INGEST_API_URL` | URL base de ingest-api. En single-host: `http://ingest-api:3000`. En two-host: `http://<ip-vpn-app>:3000` |
| `INGEST_SHARED_SECRET` | Token que Vector envia como header `X-Ingest-Token`. Debe coincidir con el del servidor app. |

### Variables internas de Vector (configuradas en `vector/cowrie.toml`)

| Parametro | Valor | Descripcion |
|-----------|-------|-------------|
| `data_dir` | `/var/lib/vector` | Directorio para offset y buffer de disco |
| `batch.max_events` | `100` | Maximo de eventos por batch |
| `batch.timeout_secs` | `2` | Envia aunque no llegue a 100 si pasan 2 segundos |
| `buffer.max_size` | `268435456` | Buffer de disco de 256 MB |
| `retry_attempts` | `360` | ~1 hora de reintentos si la API esta caida |

---

## Variables para topologia two-host

### VPS honeypot (`.env` en el VPS)

```bash
# URL VPN del servidor app — Vector y web-honeypot envian eventos aqui
INGEST_API_URL=http://100.a.b.c:3000   # IP VPN (Tailscale) del servidor app
INGEST_SHARED_SECRET=<mismo-valor-que-en-servidor-app>
```

### Servidor app (`.env` en el servidor app)

```bash
BETTER_AUTH_SECRET=
POSTGRES_PASSWORD=
INGEST_SHARED_SECRET=                  # mismo valor que en el VPS honeypot

DASHBOARD_DOMAIN=dashboard.tudominio.com
API_DOMAIN=api.tudominio.com
NEXT_PUBLIC_API_URL=https://api.tudominio.com

HONEYPOT_IP=<ip-publica-del-vps>
DASHBOARD_TIMEZONE=UTC
DISCORD_WEBHOOK_URL=                   # opcional
```

---

## Generar secrets

```bash
# BETTER_AUTH_SECRET, POSTGRES_PASSWORD y INGEST_SHARED_SECRET
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
