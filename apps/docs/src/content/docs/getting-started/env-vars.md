---
title: Variables de entorno
description: Referencia completa de las variables de entorno del proyecto, organizadas por contexto.
---

import { Aside } from '@astrojs/starlight/components';

## Raiz del proyecto (`.env`)

Usado por Docker Compose para pasar valores a los contenedores principales.

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | - | Requerido. Clave secreta de sesiones. Genera con `openssl rand -base64 32` |
| `POSTGRES_PASSWORD` | - | Requerido en prod. Contrasena de PostgreSQL |
| `INGEST_SHARED_SECRET` | - | Recomendado. Autoriza `POST /ingest/*`, `POST /sensors/*` y endpoints de clientes |
| `BETTER_AUTH_URL` | `http://localhost:4000` | URL publica del dashboard |
| `HONEYPOT_IP` | - | IP del sensor honeypot. Pre-carga el campo en Settings |
| `HONEYPOT_SSH_PORT` | `22` | Puerto SSH de Cowrie |
| `HONEYPOT_INGEST_PORT` | `3000` | Puerto del ingest-api |
| `DASHBOARD_TIMEZONE` | `UTC` | Zona horaria IANA para las graficas |
| `DISCORD_WEBHOOK_URL` | - | Webhook de Discord para alertas |

<Aside type="caution">
`BETTER_AUTH_URL` debe coincidir exactamente con el origen desde el que accedes al dashboard. Si usas un tunnel SSH con otro puerto, actualiza esta variable.
</Aside>

---

## Archivos `.env` para el lab multi-VM local

Para el lab multi-VM, cada VM usa su propio `.env` desde los templates:

| Template | Para que VM |
|----------|-------------|
| `.env.local.core.example` | VM central con postgres, ingest-api y dashboard |
| `.env.local.sensor-cowrie.example` | VM con Cowrie SSH |
| `.env.local.sensor-web.example` | VM con web-honeypot HTTP |
| `.env.local.sensor-ssh-web.example` | VM con Cowrie y web-honeypot |
| `.env.local.sensor-port.example` | VM con port-honeypot |

```bash
# VM central
cp .env.local.core.example .env

# VM sensor
cp .env.local.sensor-cowrie.example .env
```

---

## Dashboard (`apps/dashboard/.env`)

| Variable | Dev default | Descripcion |
|----------|-------------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | URL que usa el navegador para llamar a ingest-api |
| `INTERNAL_API_URL` | `http://localhost:3000` | URL interna server-side |
| `DATABASE_URL` | `postgresql://honeypot:honeypot@localhost:5432/honeypot` | Conexion a PostgreSQL |
| `BETTER_AUTH_SECRET` | - | Requerido. Mismo valor que en el `.env` raiz |
| `BETTER_AUTH_URL` | `http://localhost:4000` | URL base del dashboard |
| `HONEYPOT_IP` | - | Pre-carga el campo IP en Settings |
| `HONEYPOT_SSH_PORT` | `22` | Pre-carga el puerto SSH en Settings |
| `HONEYPOT_INGEST_PORT` | `3000` | Pre-carga el puerto ingest en Settings |
| `DASHBOARD_TIMEZONE` | `UTC` | Zona horaria para las graficas |
| `DISCORD_WEBHOOK_URL` | - | Webhook de Discord para alertas |

---

## Ingest API (`apps/ingest-api/.env`)

| Variable | Dev default | Descripcion |
|----------|-------------|-------------|
| `DATABASE_URL` | `postgresql://honeypot:honeypot@localhost:5432/honeypot` | Conexion a PostgreSQL |
| `INGEST_SHARED_SECRET` | - | Exige `X-Ingest-Token` en `POST /ingest/*`, `POST /sensors/*` y endpoints de clientes |
| `PORT` | `3000` | Puerto donde escucha la API |
| `HOST` | `0.0.0.0` | Interfaz de red |
| `DISCORD_WEBHOOK_URL` | - | Webhook de Discord para alertas de riesgo |

---

## Vector (Log Shipper)

Variables leidas por el contenedor Vector via `environment:` en Docker Compose.

### `vector/cowrie.toml`

| Variable | Descripcion |
|----------|-------------|
| `COWRIE_LOG_PATH` | Ruta al `cowrie.json`. Tipico: `/cowrie/cowrie-git/var/log/cowrie/cowrie.json` |
| `INGEST_API_URL` | URL base del ingest-api |
| `INGEST_SHARED_SECRET` | Token `X-Ingest-Token` |
| `SENSOR_ID` | Se inyecta al evento Cowrie para identificar el sensor y habilitar forwarding por cliente |

### `vector/galah.toml`

| Variable | Descripcion |
|----------|-------------|
| `GALAH_LOG_PATH` | Ruta al `galah.json`. Tipico: `/galah/logs/galah.json` |
| `INGEST_API_URL` | URL base del ingest-api |
| `INGEST_SHARED_SECRET` | Token `X-Ingest-Token` |

### Parametros internos de Vector

| Parametro | Valor | Descripcion |
|-----------|-------|-------------|
| `data_dir` | `/var/lib/vector` | Offset persistente y buffer de disco |
| `batch.max_events` | `100` o `50` | Eventos por batch segun pipeline |
| `batch.timeout_secs` | `2` | Envia aunque no llegue al maximo |
| `buffer.max_size` | `268435456` | Buffer de disco de 256 MB |
| `retry_attempts` | `360` | Aproximadamente una hora de reintentos |

---

## Sensor Beacon (`heartbeat.py`)

Variables leidas por el sidecar `heartbeat.py` que corre junto a cada sensor.

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `INGEST_API_URL` | `http://ingest-api:3000` | URL del ingest-api |
| `INGEST_SHARED_SECRET` | - | Token de autorizacion |
| `SENSOR_ID` | `sensor-<hostname>` | ID unico del sensor en la plataforma |
| `SENSOR_NAME` | `SSH Honeypot (Cowrie)` | Nombre legible en `/sensors` |
| `SENSOR_IP` | auto-detectada | IP publica del sensor |
| `SENSOR_PROTOCOL` | `ssh` | Protocolo principal |
| `SENSOR_VERSION` | `cowrie` | Version del honeypot |
| `SENSOR_PORTS` | `22` | Puertos que escucha, separados por espacios |
| `SENSOR_PROBE_PORTS` | - | Puertos que el ingest-api sondea para verificar online/offline |
| `SENSOR_HOST` | - | Hostname Docker del contenedor del honeypot |
| `CLIENT_SLUG` | - | Cliente al que se debe asociar el sensor |
| `CLIENT_NAME` | - | Nombre legible del cliente, usado al autocrearlo si no existe |

Ejemplo para un sensor del cliente A:

```bash
SENSOR_ID=cowrie-ecu-prod-01
CLIENT_SLUG=cliente-a
CLIENT_NAME=Cliente A
```

---

## Dionaea Shipper

Variables para el `shipper.py` de la integracion Dionaea.

| Variable | Descripcion |
|----------|-------------|
| `INGEST_API_URL` | URL del ingest-api central |
| `INGEST_SHARED_SECRET` | Token de autorizacion |
| `SENSOR_ID` | ID unico del sensor Dionaea |
| `SENSOR_NAME` | Nombre legible |
| `DIONAEA_LOG_PATH` | Ruta al `dionaea.json` |

---

## Variables para topologia two-host

### VPS honeypot

```bash
INGEST_API_URL=http://100.a.b.c:3000
INGEST_SHARED_SECRET=<mismo-que-servidor-app>
CLIENT_SLUG=cliente-a
CLIENT_NAME=Cliente A
```

### Servidor app

```bash
BETTER_AUTH_SECRET=
POSTGRES_PASSWORD=
INGEST_SHARED_SECRET=

DASHBOARD_DOMAIN=dashboard.tudominio.com
API_DOMAIN=api.tudominio.com
NEXT_PUBLIC_API_URL=https://api.tudominio.com

HONEYPOT_IP=<ip-publica-del-vps>
DASHBOARD_TIMEZONE=UTC
DISCORD_WEBHOOK_URL=
```

---

## Generar secrets

```bash
openssl rand -base64 32
openssl rand -base64 32
openssl rand -base64 32
```

O en un solo bloque:

```bash
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
export POSTGRES_PASSWORD=$(openssl rand -base64 32)
export INGEST_SHARED_SECRET=$(openssl rand -base64 32)
```
