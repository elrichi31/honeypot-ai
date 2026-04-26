# Honeypot Platform

Plataforma de investigacion de seguridad que captura trafico SSH y HTTP malicioso, normaliza los eventos en una API centralizada y los visualiza en un dashboard con analisis de amenazas, correlacion cross-protocol, risk scoring por IP, clasificacion automatica de sesiones con IA y alertas en Discord.

## Stack

| Capa | Tecnologia | Por que |
|------|-----------|---------|
| Honeypot SSH | Cowrie | Honeypot SSH/Telnet de media interaccion. Simula un shell real, registra todo. |
| Honeypot HTTP | Flask + Gunicorn | Servidor web con rutas falsas que responden realisticamente a scanners. |
| Log shipper | Vector 0.40 | Tail con offset persistente en disco, buffer 256 MB, retry 360 intentos. |
| API de ingesta | Fastify + TypeScript | Alta performance, schema validation, healthcheck nativo. |
| ORM / DB | Prisma + PostgreSQL | Migraciones declarativas, type-safety end-to-end. |
| Dashboard | Next.js 15 (App Router) | Server Components, fetch en el servidor. |
| Auth | better-auth | Sesiones seguras con soporte de multiples providers. |
| Graficas | recharts | Componentes React composables, soporte de time series. |
| Mapas | react-simple-maps + geoip-lite | Geolocalizacion offline sin API keys externas. |
| Contenedores | Docker Compose | Entorno reproducible, networks aisladas, hardening declarativo. |

## Arquitectura

```
Atacante SSH  ──▶  Cowrie (:22)  ──▶  cowrie.json (volumen Docker)
                                              │
                                         Vector (sidecar)
                                         tail + parse + buffer en disco
                                         POST /ingest/cowrie/vector
                                              │
Atacante HTTP ──▶  web-honeypot (:80) ──▶  POST /ingest/web/event
                                              │
                                        ingest-api (:3000)
                                        risk-score engine
                                        bot-detector
                                              │
                                        PostgreSQL
                                              │
                                        dashboard (:4000)
                                        + Discord alerts
                                        + AI analysis
```

### Topologias de despliegue

| Archivo | Uso |
|---------|-----|
| `docker-compose.yml` | Desarrollo local — todos los servicios juntos |
| `docker-compose.prod.single-host.yml` | Un solo VPS — redes Docker separadas, dashboard solo en loopback |
| `docker-compose.prod.honeypot.yml` | VPS sensor — Cowrie + web-honeypot + Vector |
| `docker-compose.prod.app.yml` | Servidor app — postgres + ingest-api + dashboard + Caddy |

---

## Desarrollo local

### Requisitos

- Docker Desktop con Docker Compose v2
- Node.js 20+

### Levantar todo con Docker

```bash
git clone <repo-url>
cd honeypot-ai

cp .env.example .env
# Edita BETTER_AUTH_SECRET con: openssl rand -base64 32

docker compose up --build -d
docker compose ps
```

Servicios disponibles:

| URL | Servicio |
|-----|---------|
| `http://localhost:4000` | Dashboard |
| `http://localhost:3000/health` | Health check ingest-api |
| `ssh -p 2222 root@localhost` | SSH honeypot |
| `http://localhost:8080` | HTTP honeypot |

### Levantar servicios individualmente

```bash
# Solo infraestructura
docker compose up postgres cowrie -d

# ingest-api local
cd apps/ingest-api && npm install && npm run db:push && npm run dev

# dashboard local (otra terminal)
cd apps/dashboard && npm install && npm run dev
```

### Probar los honeypots

```bash
# SSH honeypot
ssh -p 2222 root@localhost

# Web honeypot
curl http://localhost:8080/wp-login.php
curl http://localhost:8080/.env
curl "http://localhost:8080/search?q=1' OR 1=1--"
curl "http://localhost:8080/page?file=../../../../etc/passwd"
```

### Seed de datos de prueba

```bash
cd apps/ingest-api
npx prisma db seed
```

Genera ~30 dias de sesiones SSH, comandos y web hits con distintos tipos de ataque.

### Comandos utiles

```bash
docker logs -f ingest-api
docker logs -f cowrie
docker logs -f vector           # log shipper
docker logs -f web-honeypot
docker compose down
docker compose down -v          # elimina tambien los volumenes
```

---

## Produccion — Single-Host

```bash
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
export POSTGRES_PASSWORD=$(openssl rand -base64 32)
export INGEST_SHARED_SECRET=$(openssl rand -base64 32)

docker compose -f docker-compose.prod.single-host.yml up --build -d
docker compose -f docker-compose.prod.single-host.yml ps
```

Acceso al dashboard via SSH tunnel:

```bash
ssh -L 4000:127.0.0.1:4000 -p 8022 <usuario>@<ip-del-vps>
# Abre http://localhost:4000
```

## Produccion — Two-Host (recomendado)

**VPS honeypot** — levanta Cowrie, web-honeypot y Vector:

```bash
# .env del VPS honeypot:
# INGEST_API_URL=http://<ip-vpn-servidor-app>:3000
# INGEST_SHARED_SECRET=<secret>

docker compose -f docker-compose.prod.honeypot.yml up --build -d
```

**Servidor app** — levanta postgres, ingest-api, dashboard y Caddy:

```bash
# .env del servidor app:
# BETTER_AUTH_SECRET, POSTGRES_PASSWORD, INGEST_SHARED_SECRET
# DASHBOARD_DOMAIN=dashboard.tudominio.com
# API_DOMAIN=api.tudominio.com

docker compose -f docker-compose.prod.app.yml up --build -d
```

Vector en el VPS honeypot empuja los logs a ingest-api via VPN. No se necesita SSH ni claves en el servidor app.

---

## Variables de entorno principales

| Variable | Descripcion |
|----------|-------------|
| `BETTER_AUTH_SECRET` | Clave secreta de sesiones — `openssl rand -base64 32` |
| `POSTGRES_PASSWORD` | Contrasena de PostgreSQL |
| `INGEST_SHARED_SECRET` | Token para `X-Ingest-Token` en `POST /ingest/*` |
| `INGEST_API_URL` | URL de ingest-api (en el VPS honeypot, IP VPN del servidor app) |
| `DASHBOARD_DOMAIN` | Dominio publico del dashboard (two-host) |
| `DASHBOARD_TIMEZONE` | Zona horaria IANA, ej: `America/Bogota` |

---

## Estructura del repositorio

```text
.
├── docker-compose.yml
├── docker-compose.prod.honeypot.yml
├── docker-compose.prod.app.yml
├── docker-compose.prod.single-host.yml
├── vector/
│   └── cowrie.toml                        # Config Vector: tail, parse, batch, retry
└── apps/
    ├── web-honeypot/                      # HTTP honeypot (Flask)
    │   ├── app.py
    │   ├── classifier.py
    │   └── responses.py
    ├── ingest-api/                        # Fastify API (TypeScript)
    │   ├── src/
    │   │   ├── routes/
    │   │   │   ├── ingest.ts              # POST /ingest/cowrie/* y /ingest/web/event
    │   │   │   ├── sessions.ts
    │   │   │   ├── events.ts
    │   │   │   ├── threats.ts
    │   │   │   ├── web.ts
    │   │   │   └── stats/                 # GET /stats/* (modulos separados)
    │   │   └── lib/
    │   │       ├── risk-score.ts
    │   │       ├── bot-detector.ts
    │   │       └── discord.ts
    │   └── prisma/
    │       └── schema.prisma
    ├── dashboard/                         # Next.js 15 App Router
    │   ├── app/
    │   │   ├── page.tsx
    │   │   ├── sessions/
    │   │   ├── web-attacks/
    │   │   ├── threats/
    │   │   ├── commands/
    │   │   ├── credentials/
    │   │   ├── campaigns/
    │   │   └── settings/
    │   └── lib/
    │       ├── api/                       # Fetch helpers por dominio
    │       └── session-classify-v2.ts
    └── docs/                              # Documentacion (Astro Starlight)
```

## Tests

```bash
cd apps/ingest-api
npm test
```
