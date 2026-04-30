# Honeypot Platform

Plataforma de investigacion de seguridad que captura trafico SSH, HTTP, FTP, MySQL y port scans maliciosos, normaliza los eventos en una API centralizada y los visualiza en un dashboard con analisis de amenazas, correlacion cross-protocol, risk scoring por IP, clasificacion automatica de sesiones con IA y alertas en Discord.

## Stack

| Capa | Tecnologia | Por que |
|------|-----------|---------|
| Honeypot SSH | Cowrie | Honeypot SSH/Telnet de media interaccion. Simula un shell real y registra todo. |
| Honeypot HTTP | Flask + Gunicorn | Servidor web con rutas falsas que responden realisticamente a scanners. |
| Honeypots de red | Python asyncio | Emulaciones ligeras para FTP, MySQL y puertos comunmente escaneados. |
| Log shipper | Vector 0.40 | Tail con offset persistente en disco, buffer 256 MB y retry resiliente. |
| API de ingesta | Fastify + TypeScript | Alta performance, schema validation y healthcheck nativo. |
| ORM / DB | Prisma + PostgreSQL | Migraciones declarativas y type-safety end-to-end. |
| Dashboard | Next.js 16 (App Router) | Server Components y fetch en el servidor. |
| Auth | better-auth | Sesiones seguras con soporte de multiples providers. |
| Graficas | recharts | Componentes React composables para time series. |
| Mapas | react-simple-maps + geoip-lite | Geolocalizacion offline sin API keys externas. |
| Contenedores | Docker Compose | Entorno reproducible, networks aisladas y hardening declarativo. |

## Arquitectura

```text
Atacante SSH  -> Cowrie (:22)            -> cowrie.json (volumen Docker)
                                        |
                                   Vector (sidecar)
                                   tail + parse + buffer en disco
                                   POST /ingest/cowrie/vector
                                        |
Atacante HTTP -> web-honeypot (:80)     -> POST /ingest/web/event
Atacante FTP  -> ftp-honeypot (:21)     -> POST /ingest/protocol/event
Atacante SQL  -> mysql-honeypot (:3306) -> POST /ingest/protocol/event
Port scans    -> port-honeypot          -> POST /ingest/protocol/event
                                        |
                                   ingest-api (:3000)
                                   risk-score engine
                                   bot-detector
                                        |
                                   PostgreSQL
                                        |
                                   dashboard (:4000)
                                   + Discord alerts
                                   + AI analysis
```

### Topologias de despliegue

| Archivo | Uso |
|---------|-----|
| `docker-compose.yml` | Desarrollo local con todos los servicios |
| `docker-compose.prod.single-host.yml` | Un solo VPS con redes Docker separadas y dashboard solo en loopback |
| `docker-compose.prod.honeypot.yml` | VPS sensor con Cowrie, web-honeypot, FTP, MySQL, port-honeypot y Vector |
| `docker-compose.prod.app.yml` | Servidor app con PostgreSQL, ingest-api, dashboard y Caddy |

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
| `ftp localhost 2121` | FTP honeypot |
| `mysql -h 127.0.0.1 -P 3307 -u root -p` | MySQL honeypot |
| `nc -vz 127.0.0.1 6379` | Port honeypot de ejemplo |

### Levantar servicios individualmente

```bash
# Solo infraestructura
docker compose up postgres cowrie -d

# ingest-api local
cd apps/ingest-api && npm install && npm run db:generate && npm run dev

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

# FTP honeypot
ftp localhost 2121

# MySQL honeypot
mysql -h 127.0.0.1 -P 3307 -u root -p

# Port logger
nc -vz 127.0.0.1 6379
nc -vz 127.0.0.1 9200
```

### Seed de datos de prueba

```bash
cd apps/ingest-api
npx prisma db seed
```

Genera datos de prueba para sesiones SSH, comandos y web hits.

### Comandos utiles

```bash
docker logs -f ingest-api
docker logs -f cowrie
docker logs -f vector
docker logs -f web-honeypot
docker logs -f ftp-honeypot
docker logs -f mysql-honeypot
docker logs -f port-honeypot
docker compose down
docker compose down -v
```

## Produccion - Single-Host

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

## Produccion - Two-Host

VPS honeypot:

```bash
# .env del VPS honeypot:
# INGEST_API_URL=http://<ip-vpn-servidor-app>:3000
# INGEST_SHARED_SECRET=<secret>

docker compose -f docker-compose.prod.honeypot.yml up --build -d
```

Servidor app:

```bash
# .env del servidor app:
# BETTER_AUTH_SECRET, POSTGRES_PASSWORD, INGEST_SHARED_SECRET
# DASHBOARD_DOMAIN=dashboard.tudominio.com
# API_DOMAIN=api.tudominio.com

docker compose -f docker-compose.prod.app.yml up --build -d
```

Vector y los honeypots del VPS sensor empujan los eventos a `ingest-api` via VPN. No se necesita exponer el dashboard ni PostgreSQL en el host sensor.

## Checklist de produccion

Antes del primer deploy, confirma esto:

- `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD` e `INGEST_SHARED_SECRET` son secretos reales y largos.
- `BETTER_AUTH_URL` coincide exactamente con la URL publica real del dashboard.
- Si usas topologia two-host, `INGEST_API_URL` apunta a la IP privada o VPN del servidor app, no a una IP publica.
- Los puertos `21`, `22`, `80`, `3306`, `1433`, `2375`, `3389`, `4444`, `5900`, `6379`, `8443`, `8888`, `9090`, `9200` y `27017` no chocan con servicios legitimos del host honeypot.
- El firewall bloquea acceso publico no deseado al backend de app, especialmente `:3000` si queda expuesto para trafico VPN.
- El dashboard responde y las rutas `/live` y `/services` cargan despues del deploy.
- `curl http://127.0.0.1:3000/health` responde `{"status":"ok"}` en el servidor app.
- Al menos una conexion de prueba a FTP, MySQL y port-scan aparece en `/protocol-hits` y `/protocol-hits/stats`.

### Nota para Windows local

En este checkout hay archivos marcados como `reparse point`, y Docker BuildKit puede fallar al construir algunas imagenes desde Windows. En Linux de produccion normalmente no pasa. Si necesitas probar el deploy desde Windows local, usa:

```powershell
$env:DOCKER_BUILDKIT='0'
docker compose up -d --build
```

## Variables de entorno principales

| Variable | Descripcion |
|----------|-------------|
| `BETTER_AUTH_SECRET` | Clave secreta de sesiones, genera una con `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | URL publica exacta del dashboard |
| `POSTGRES_PASSWORD` | Contrasena de PostgreSQL |
| `INGEST_SHARED_SECRET` | Token para `X-Ingest-Token` en `POST /ingest/*` |
| `INGEST_API_URL` | URL privada o VPN de `ingest-api` en el VPS honeypot |
| `DASHBOARD_DOMAIN` | Dominio publico del dashboard en topologia two-host |
| `API_DOMAIN` | Dominio o subdominio publico del API si lo separas |
| `NEXT_PUBLIC_API_URL` | URL publica del API usada por el dashboard |
| `DASHBOARD_TIMEZONE` | Zona horaria IANA, por ejemplo `America/Bogota` |

## Estructura del repositorio

```text
.
|-- docker-compose.yml
|-- docker-compose.prod.honeypot.yml
|-- docker-compose.prod.app.yml
|-- docker-compose.prod.single-host.yml
|-- vector/
|   `-- cowrie.toml
`-- apps/
    |-- web-honeypot/
    |-- ftp-honeypot/
    |-- mysql-honeypot/
    |-- port-honeypot/
    |-- ingest-api/
    |   |-- src/
    |   |   |-- routes/
    |   |   |-- lib/
    |   `-- prisma/
    `-- dashboard/
        |-- app/
        |-- components/
        `-- lib/
```

## Tests

```bash
cd apps/ingest-api
npm test
```
