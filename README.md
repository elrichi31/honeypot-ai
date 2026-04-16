# Honeypot Platform

Plataforma para capturar actividad SSH y HTTP con Cowrie y un web honeypot propio, normalizar eventos en una API Fastify y visualizarlos desde un dashboard Next.js con análisis de amenazas, correlación cross-protocol y risk scoring por IP.

## Stack

| Capa | Tecnología |
|------|-----------|
| Honeypot SSH | Cowrie (Docker) |
| Honeypot HTTP | Flask + Gunicorn (custom) |
| API de ingesta | Fastify + TypeScript |
| ORM / DB | Prisma + PostgreSQL |
| Dashboard | Next.js 15 (App Router) |
| Auth | better-auth |
| Gráficas | recharts |
| Mapas | react-simple-maps + geoip-lite |
| Contenedores | Docker Compose |

## Arquitectura

```
                    ┌─────────────────────────────────────────────────┐
                    │                  VPS público                     │
                    │                                                  │
   Atacante SSH ───▶│  :22  cowrie          (SSH honeypot)            │
   Atacante HTTP ──▶│  :80  web-honeypot    (HTTP honeypot)           │
                    │  :8022 sshd admin                               │
                    └──────────┬──────────────────────────────────────┘
                               │ cowrie.json (SSH)
                               │ POST /ingest/web/event (HTTP)
                    ┌──────────▼──────────────────────────────────────┐
                    │             Servidor de aplicación               │
                    │                                                  │
                    │  log-puller ──▶ ingest-api :3000 ──▶ postgres   │
                    │                                          │       │
                    │              dashboard :4000 ◀──────────┘       │
                    └─────────────────────────────────────────────────┘
```

En desarrollo se levanta todo junto con `docker compose up`.

## Puertos

| Puerto | Servicio | Descripción |
|--------|----------|-------------|
| `22`   | Cowrie (prod) | SSH honeypot — los atacantes se conectan aquí |
| `80`   | web-honeypot (prod) | HTTP honeypot — tráfico web malicioso |
| `2222` | Cowrie (dev) | SSH honeypot local |
| `8080` | web-honeypot (dev) | HTTP honeypot local |
| `8022` | sshd admin VPS | Acceso administrativo real al VPS |
| `4000` | dashboard (single-host) | Solo loopback (`127.0.0.1`), recomendado acceder por SSH tunnel o VPN |
| `3000` | ingest-api | API Fastify que recibe y normaliza eventos. En single-host no se publica al exterior |
| `4000` | dashboard | Dashboard Next.js. En single-host se deja solo en `127.0.0.1` |
| `5432` | PostgreSQL | Base de datos interna. En single-host no se publica al exterior |

## Archivos de despliegue

| Archivo | Uso |
|---------|-----|
| `docker-compose.yml` | Entorno local completo |
| `docker-compose.prod.honeypot.yml` | VPS público (Cowrie + web-honeypot) |
| `docker-compose.prod.app.yml` | Servidor app (postgres + ingest-api + dashboard) |
| `docker-compose.prod.single-host.yml` | Un solo VPS con redes separadas y dashboard solo por loopback |

---

## Desarrollo local

### Requisitos

- Docker Desktop
- Node.js 20+

### Levantar todo con Docker

```bash
git clone <repo-url>
cd honeypot-pr

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
| `ssh -p 2222 root@localhost` | SSH honeypot (acepta cualquier password) |
| `http://localhost:8080` | HTTP honeypot |

### Levantar servicios individualmente

Hay dos formas comunes para desarrollar sin rebuilds.

**Opcion A. Infra con Docker, codigo local**

Util si quieres Postgres y Cowrie listos rapido, pero correr `ingest-api` y `dashboard` como procesos locales.

```bash
docker compose up postgres cowrie -d
```

Luego:

```bash
cp apps/ingest-api/.env.example apps/ingest-api/.env
cd apps/ingest-api
npm install
npm run db:push
npm run dev
# -> http://localhost:3000
```

En otra terminal:

```bash
cp apps/dashboard/.env.example apps/dashboard/.env
# Edita BETTER_AUTH_SECRET: openssl rand -base64 32

cd apps/dashboard
npm install
npm run dev
# -> http://localhost:3001
```

**Opcion B. Sin Docker Compose**

Util si quieres correr todo manualmente. En este caso necesitas PostgreSQL disponible por tu cuenta, ya sea instalado localmente o en un contenedor suelto.

1. Levanta PostgreSQL en `localhost:5432` con esta base:
   `postgresql://honeypot:honeypot@localhost:5432/honeypot`
2. Copia `apps/ingest-api/.env.example` a `apps/ingest-api/.env`.
3. En `apps/ingest-api`, corre `npm install`, luego `npm run db:push` y despues `npm run dev`.
4. Copia `apps/dashboard/.env.example` a `apps/dashboard/.env`.
5. En `apps/dashboard/.env`, deja:
   `NEXT_PUBLIC_API_URL=http://localhost:3000`
   `INTERNAL_API_URL=http://localhost:3000`
   `DATABASE_URL=postgresql://honeypot:honeypot@localhost:5432/honeypot`
   `BETTER_AUTH_URL=http://localhost:3001`
6. Genera `BETTER_AUTH_SECRET` y pegalo en `apps/dashboard/.env`.
7. En `apps/dashboard`, corre `npm install` y despues `npm run dev`.

Si tambien quieres probar Cowrie sin Compose, puedes levantarlo aparte:

```bash
docker run -d \
  --name cowrie \
  -p 2222:2222 \
  -v cowrie_var:/cowrie/cowrie-git/var \
  cowrie/cowrie:latest
```

Y en otra terminal correr el puller local:

```bash
API_URL=http://localhost:3000 bash scripts/pull-cowrie-logs.sh
```

### Probar el honeypot SSH

```bash
ssh -p 2222 root@localhost
# Acepta cualquier password. Prueba: whoami, ls, cat /etc/passwd, wget http://...
```

### Probar el honeypot HTTP

```bash
# Paths con respuestas falsas realistas:
curl http://localhost:8080/wp-login.php
curl http://localhost:8080/.env
curl http://localhost:8080/.git/config
curl "http://localhost:8080/search?q=1' OR 1=1--"
curl "http://localhost:8080/page?file=../../../../etc/passwd"
curl "http://localhost:8080/cmd?exec=whoami"

# Cualquier path no reconocido devuelve un 404 de Apache falso
curl http://localhost:8080/cualquier-ruta
```

### Seed de datos de prueba

```bash
cd apps/ingest-api
npx prisma db seed
```

Genera ~30 días de sesiones SSH, comandos clasificables y web hits con distintos tipos de ataque.

### Comandos útiles

```bash
docker logs -f ingest-api
docker logs -f cowrie
docker logs -f web-honeypot
docker logs -f log-puller
docker compose down
docker compose down -v   # elimina también los volúmenes
```

---

## Variables de entorno

### Raíz del proyecto (`.env`) — usado por docker-compose

| Variable | Default | Descripción |
|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | — | **Requerido.** Genera con `openssl rand -base64 32` |
| `POSTGRES_PASSWORD` | — | **Requerido en prod/single-host.** Usa una contraseña larga para PostgreSQL |
| `INGEST_SHARED_SECRET` | — | **Recomendado.** Token compartido para autorizar `POST /ingest/*` |
| `BETTER_AUTH_URL` | `http://localhost:4000` | URL pública del dashboard |
| `HONEYPOT_IP` | — | IP pública del VPS honeypot. Pre-carga el campo en Settings |
| `HONEYPOT_SSH_PORT` | `22` | Puerto SSH del honeypot (donde se conectan los atacantes) |
| `HONEYPOT_INGEST_PORT` | `8022` | Puerto SSH admin del VPS (canal honeypot → puller) |
| `DASHBOARD_TIMEZONE` | `UTC` | Zona horaria para las gráficas (nombre IANA, ej. `America/Bogota`) |

### Dashboard (`apps/dashboard/.env`)

| Variable | Local dev | Descripción |
|----------|-----------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | URL que usa el navegador para llamar a la ingest-api |
| `INTERNAL_API_URL` | `http://localhost:3000` | URL interna server-side (Docker la sobreescribe con `http://ingest-api:3000`) |
| `DATABASE_URL` | `postgresql://honeypot:honeypot@localhost:5432/honeypot` | Conexión a PostgreSQL (usada por better-auth) |
| `BETTER_AUTH_SECRET` | — | **Requerido.** Mismo valor que en el `.env` raíz |
| `BETTER_AUTH_URL` | `http://localhost:3001` | URL base del dashboard |
| `HONEYPOT_IP` | — | Pre-carga el campo IP en Settings |
| `HONEYPOT_SSH_PORT` | `22` | Pre-carga el puerto SSH en Settings |
| `HONEYPOT_INGEST_PORT` | `8022` | Pre-carga el puerto ingest en Settings |
| `DASHBOARD_TIMEZONE` | `UTC` | Zona horaria para las gráficas |

> Las variables `HONEYPOT_*` y `DASHBOARD_TIMEZONE` son opcionales. Si no se definen, se configuran desde la página Settings del dashboard.

### Ingest API (`apps/ingest-api/.env`)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://honeypot:honeypot@localhost:5432/honeypot` | Conexión a PostgreSQL |
| `INGEST_SHARED_SECRET` | — | Si se define, exige el header `X-Ingest-Token` en todos los `POST /ingest/*` |
| `PORT` | `3000` | Puerto donde escucha la API |
| `HOST` | `0.0.0.0` | Interfaz de red |

### Puller

| Variable | Default | Descripción |
|----------|---------|-------------|
| `VPS_HOST` | — | IP o alias SSH del VPS honeypot |
| `VPS_SSH_PORT` | `8022` | Puerto SSH administrativo del VPS |
| `VPS_USER` | `root` | Usuario SSH en el VPS |
| `SSH_KEY` | `~/.ssh/honeypot_vps` | Ruta a la clave privada SSH |
| `REMOTE_LOG` | `/root/honeypot-ai/cowrie.json` | Ruta del log de Cowrie en el VPS |
| `DIRECT_LOG` | `/cowrie/cowrie-git/var/log/cowrie/cowrie.json` | Ruta del log JSON cuando `DIRECT_FILE=true` (por ejemplo dentro del contenedor `log-puller`) |
| `API_URL` | `http://localhost:3000` | URL base de ingest-api |
| `INGEST_SHARED_SECRET` | — | Token compartido que el puller envía como header `X-Ingest-Token` |
| `POLL_INTERVAL` | `3` | Segundos entre lecturas del log |
| `DIRECT_FILE` | `false` | `true` para leer el archivo directamente sin SSH. Es el modo que usa `docker-compose.prod.single-host.yml` con el volumen de Cowrie montado |

---

## Dashboard — funcionalidades

### Overview

Métricas globales con gráficas de actividad SSH y HTTP:
- Total de sesiones, eventos, IPs únicas, logins exitosos
- Activity timeline (SSH + web hits por día)
- Mapa de ataque SSH por país
- Widget resumen de Web Attacks con top IPs y distribución de tipos

### Sesiones SSH (`/sessions`)

Divide el tráfico en dos tabs:

- **Sesiones** — conexiones autenticadas (`loginSuccess = true`). Timeline de eventos expandible, replay de comandos.
- **Escaneos** — conexiones fallidas agrupadas por IP. Muestra credenciales probadas, versión del cliente SSH/herramienta usada.

Clasificación automática por comportamiento:

| Clasificación | Condición | Descripción |
|---------------|-----------|-------------|
| Scanner | No logueado, ≤3 eventos | Solo sondeo de puerto |
| Bot scan | No logueado, 8–30 eventos | Intento múltiple de credenciales |
| Brute-force | No logueado, >30 eventos | Ataque de fuerza bruta intenso |
| Login only | Logueado, ≤8 eventos | Acceso exitoso sin actividad post-login |
| Recon | Logueado, 8–20 eventos | Reconocimiento básico tras acceso |
| Interactive | Logueado, 20–40 eventos | Sesión interactiva activa |
| Malware dropper | Logueado, >40 eventos | Actividad extensa, posible descarga de malware |

### Web Attacks (`/web-attacks`)

Análisis del tráfico HTTP capturado por el web honeypot:

- **Attackers** — lista de IPs agrupadas por atacante con total de hits, tipos de ataque detectados, primera/última vez visto. Click en una fila para ver el detalle completo (paths más atacados, user agents, timeline de requests).
- **Timeline** — gráfica de barras apiladas por día y tipo de ataque + distribución en pie chart.
- **Paths** — ranking de paths más atacados con frecuencia y tipos de ataque detectados en cada uno.
- **Geo** — mapa mundial con intensidad de ataque por país (escala logarítmica) + tabla de ranking por país.

Tipos de ataque clasificados automáticamente:

| Tipo | Descripción |
|------|-------------|
| `cmdi` | Command injection (`;`, `|`, `` ` ``, `$(`) |
| `sqli` | SQL injection (`' OR`, `UNION SELECT`, etc.) |
| `lfi` | Local file inclusion (`../`, `/etc/passwd`) |
| `rfi` | Remote file inclusion (`http://` en parámetros) |
| `xss` | Cross-site scripting (`<script>`, `onerror=`) |
| `info_disclosure` | Acceso a archivos sensibles (`.env`, `.git`, `wp-config`) |
| `scanner` | Herramientas de escaneo (Nikto, nuclei, sqlmap, etc.) |
| `recon` | Reconocimiento genérico |

### Threat Intelligence (`/threats`)

Correlación cross-protocol y risk scoring por IP:

- **Ranking de amenazas** — todas las IPs vistas en SSH y/o HTTP ordenadas por risk score (0–100). Muestra nivel de riesgo, protocolos usados, categorías de comandos detectadas y top factores.
- **Detalle por IP** — score breakdown por categoría (SSH, web, comandos, cross-protocol), categorías conductuales con los comandos clasificados, timeline de comandos SSH con categoría asignada.
- **Badge de riesgo** — aparece en el detalle de sesiones SSH y de atacantes web, linkea directamente al perfil de amenaza.

**Niveles de riesgo:**

| Nivel | Score | Criterio típico |
|-------|-------|-----------------|
| CRITICAL | 80–100 | Login SSH exitoso + malware/persistence commands |
| HIGH | 60–79 | Múltiples vectores de ataque graves |
| MEDIUM | 40–59 | Ataques web severos (cmdi/sqli) o SSH con comandos |
| LOW | 20–39 | Reconocimiento básico |
| INFO | 0–19 | Escaneo puntual sin actividad relevante |

**Categorías de comandos clasificados:**

| Categoría | Ejemplos detectados |
|-----------|---------------------|
| `malware_drop` | wget/curl + chmod, reverse shells (bash/python/nc) |
| `persistence` | crontab, authorized_keys, useradd, systemctl enable |
| `lateral_movement` | nmap, masscan, sshpass, ping sweep loops |
| `crypto_mining` | xmrig, minerd, conexiones a pools stratum |
| `data_exfil` | cat /etc/passwd|shadow, tar /home, rm -rf /var/log |
| `recon` | id, whoami, uname -a, ps aux, netstat, ifconfig |

### Otros módulos

- **Commands** (`/commands`) — búsqueda y filtrado de todos los comandos ejecutados.
- **Credentials** (`/credentials`) — diccionario de credenciales probadas con frecuencia.
- **Campaigns** (`/campaigns`) — agrupación de sesiones por campaña/herramienta.
- **Settings** (`/settings`) — configuración de infraestructura, zona horaria, AI analysis (OpenAI API key), notificaciones.

---

## API

### Endpoints SSH / sesiones

| Método | Path | Descripción |
|--------|------|-------------|
| `POST` | `/ingest/cowrie/event` | Ingesta un evento Cowrie individual |
| `POST` | `/ingest/cowrie/batch` | Ingesta un array de eventos |
| `POST` | `/ingest/cowrie/file` | Sube un archivo `cowrie.json` completo |
| `GET`  | `/sessions` | Lista de sesiones con filtros |
| `GET`  | `/sessions/:id` | Detalle de sesión con todos sus eventos |
| `GET`  | `/events` | Lista de eventos con filtros |

### Endpoints web honeypot

| Método | Path | Descripción |
|--------|------|-------------|
| `POST` | `/ingest/web/event` | Ingesta un hit HTTP del web honeypot |
| `GET`  | `/web-hits` | Lista paginada de hits con filtros |
| `GET`  | `/web-hits/stats` | Total, distribución por tipo, top IPs |
| `GET`  | `/web-hits/timeline` | Hits por día y tipo (últimos 30 días) |
| `GET`  | `/web-hits/paths` | Top 50 paths más atacados |
| `GET`  | `/web-hits/by-ip` | Hits agrupados por IP atacante |

### Endpoints de amenazas

| Método | Path | Descripción |
|--------|------|-------------|
| `GET`  | `/threats` | Todas las IPs con risk score, ordenadas por score DESC |
| `GET`  | `/threats/:ip` | Detalle completo: breakdown, comandos clasificados, correlación cross-protocol |

### Otros

| Método | Path | Descripción |
|--------|------|-------------|
| `GET`  | `/health` | Estado de la API y timestamp del último evento |
| `GET`  | `/stats/*` | Estadísticas para el overview y gráficas |

---

## Producción

### Single-host seguro (un solo VPS)

Si no puedes pagar dos servidores, la opción más segura dentro de un solo host es usar `docker-compose.prod.single-host.yml`.

Este despliegue hace lo siguiente:

- publica solo los puertos del honeypot (`22`, `80`, `8443`)
- deja `dashboard` en `127.0.0.1:4000`, fuera del port scan público
- no publica `ingest-api` ni `postgres`
- separa redes para que `cowrie` no vea la app y para que `web-honeypot` no comparta red directa con `dashboard`
- protege `POST /ingest/*` con `INGEST_SHARED_SECRET`
- hace que `log-puller` lea el log JSON de Cowrie directo desde el volumen compartido (`DIRECT_FILE=true`)
- endurece los contenedores con `no-new-privileges`, `cap_drop: ALL` y límites básicos de procesos

Arranque recomendado:

```bash
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
export POSTGRES_PASSWORD=$(openssl rand -base64 32)
export INGEST_SHARED_SECRET=$(openssl rand -base64 32)

docker compose -f docker-compose.prod.single-host.yml up --build -d
docker compose -f docker-compose.prod.single-host.yml ps
```

Acceso al dashboard:

```bash
ssh -L 4000:127.0.0.1:4000 -p 8022 <usuario>@<ip-del-vps>
# luego abre http://localhost:4000 en tu navegador local
```

Si el puerto `4000` local está ocupado, puedes usar otro puerto en tu laptop o PC, por ejemplo `4400`:

```bash
ssh -L 4400:127.0.0.1:4000 -p 8022 <usuario>@<ip-del-vps>
# luego abre http://localhost:4400
```

Si accedes por un puerto local distinto de `4000`, actualiza también `BETTER_AUTH_URL` para que coincida exactamente con el origen que ve el navegador. Si no coincide, better-auth rechazará login y setup con `Invalid origin`.

```bash
sed -i 's|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL=http://localhost:4400|' .env
docker compose -f docker-compose.prod.single-host.yml up -d --force-recreate dashboard
```

Si usas Tailscale, el patrón recomendado es el mismo: entra por la IP Tailscale del servidor, pero sigue tunelando hacia `127.0.0.1:4000` para no exponer el dashboard públicamente.

```bash
ssh -L 4400:127.0.0.1:4000 -p 8022 <usuario>@100.x.y.z
```

Notas importantes:

- no expongas `4000`, `3000` ni `5432` públicamente si vas en single-host
- si más adelante quieres acceso remoto cómodo al dashboard, mejor súbelo detrás de Tailscale, WireGuard o Cloudflare Tunnel antes que abrir `:4000`
- en `docker compose` debes usar el nombre del servicio, no `container_name`; por ejemplo `dashboard`, `ingest-api`, `log-puller`
- esto reduce bastante el riesgo, pero no equivale al aislamiento real de dos VPS distintos; un escape de contenedor o del kernel seguiría siendo riesgo compartido del mismo host

### Probar ataques desde otra máquina

Para simular tráfico externo contra los honeypots, usa la IP pública del VPS en vez de la IP Tailscale y en vez del túnel del dashboard.

- SSH honeypot: `ssh root@<ip-publica> -p 22`
- Web honeypot: abre `http://<ip-publica>/` en el navegador o usa `curl`

Ejemplos de pruebas web:

```bash
curl http://<ip-publica>/wp-login.php
curl http://<ip-publica>/.env
curl "http://<ip-publica>/search?q=1' OR 1=1--"
curl "http://<ip-publica>/page?file=../../../../etc/passwd"
curl "http://<ip-publica>/cmd?exec=whoami"
```

Si quieres que en el dashboard aparezca la IP real de la otra máquina, no hagas estas pruebas contra `localhost`, ni contra la IP Tailscale, ni desde el mismo VPS.

### Topología recomendada

- **VPS honeypot**: expone puertos `22` (Cowrie) y `80` (web-honeypot) al público. Sin datos de negocio.
- **Servidor app**: corre `postgres`, `ingest-api` y `dashboard`. No expuesto directamente a atacantes.
- **Puller**: proceso en el servidor app que entra por SSH al VPS y trae los logs de Cowrie nuevos.

### Paso 1: desplegar honeypots en el VPS

Antes de publicar Cowrie en el puerto `22`, mueve tu SSH real a otro puerto (recomendado `8022`) y verifica el acceso antes de cerrar la sesión.

```bash
# En el VPS, edita /etc/ssh/sshd_config:
Port 8022
# Reinicia sshd y verifica que puedes entrar por el nuevo puerto antes de continuar.

docker compose -f docker-compose.prod.honeypot.yml up -d
docker compose -f docker-compose.prod.honeypot.yml ps
```

Esto levanta Cowrie en `:22` y el web honeypot en `:80` y `:8443`.

### Paso 2: desplegar la app en el servidor principal

```bash
export HONEYPOT_IP=<ip-del-vps>
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)

docker compose -f docker-compose.prod.app.yml up --build -d
curl http://localhost:3000/health
```

### Paso 3: configurar acceso SSH del servidor app al VPS

```bash
ssh-keygen -t ed25519 -f ~/.ssh/honeypot_vps -N ""
ssh-copy-id -p 8022 -i ~/.ssh/honeypot_vps.pub user@<ip-del-vps>
```

### Paso 4: arrancar el puller

```bash
VPS_HOST=<ip-del-vps> \
VPS_SSH_PORT=8022 \
VPS_USER=root \
SSH_KEY=$HOME/.ssh/honeypot_vps \
API_URL=http://localhost:3000 \
bash scripts/pull-cowrie-logs.sh
```

### Paso 5: dejar el puller como servicio systemd

```ini
[Unit]
Description=Pull Cowrie logs from honeypot VPS
After=network.target

[Service]
Environment=VPS_HOST=<ip-del-vps>
Environment=VPS_SSH_PORT=8022
Environment=VPS_USER=root
Environment=SSH_KEY=/root/.ssh/honeypot_vps
Environment=API_URL=http://localhost:3000
WorkingDirectory=/ruta/a/honeypot-pr
ExecStart=/bin/bash /ruta/a/honeypot-pr/scripts/pull-cowrie-logs.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cowrie-pull
sudo systemctl status cowrie-pull
```

---

## Estructura del proyecto

```text
.
├── docker-compose.yml                   # Dev: todos los servicios
├── docker-compose.prod.honeypot.yml     # Prod: VPS público (Cowrie + web-honeypot)
├── docker-compose.prod.app.yml          # Prod: servidor app
├── docker-compose.prod.single-host.yml  # Prod: un solo VPS con redes separadas
├── scripts/
│   ├── pull-cowrie-logs.sh              # Puller de logs Cowrie vía SSH
│   └── Dockerfile.puller
└── apps/
    ├── cowrie/                          # Config de Cowrie
    ├── web-honeypot/                    # HTTP honeypot (Flask)
    │   ├── app.py                       # Catch-all route, envía hits al ingest-api
    │   ├── classifier.py                # Clasificador de ataques HTTP por regex
    │   ├── responses.py                 # Respuestas falsas realistas (WordPress, .env, etc.)
    │   └── Dockerfile
    ├── ingest-api/                      # Fastify API
    │   ├── src/
    │   │   ├── app.ts
    │   │   ├── routes/
    │   │   │   ├── ingest.ts            # POST /ingest/cowrie/*
    │   │   │   ├── web.ts               # GET|POST /web-hits/*
    │   │   │   ├── threats.ts           # GET /threats, GET /threats/:ip
    │   │   │   ├── sessions.ts
    │   │   │   ├── events.ts
    │   │   │   └── stats.ts
    │   │   └── lib/
    │   │       └── risk-score.ts        # Motor de scoring + clasificador de comandos
    │   └── prisma/
    │       ├── schema.prisma
    │       ├── seed.ts
    │       └── migrations/
    └── dashboard/                       # Next.js App Router
        ├── app/
        │   ├── page.tsx                 # Overview
        │   ├── sessions/
        │   ├── commands/
        │   ├── credentials/
        │   ├── campaigns/
        │   ├── threats/                 # /threats + /threats/[ip]
        │   └── web-attacks/             # /web-attacks + timeline/paths/geo + [ip]
        ├── components/
        │   ├── app-sidebar.tsx
        │   ├── risk-badge.tsx           # Badge reutilizable de nivel de riesgo
        │   └── ...
        └── lib/
            ├── api.ts                   # Fetch helpers + tipos TypeScript
            ├── geo.ts                   # Geolocalización con geoip-lite
            └── risk-score.ts            # RISK_COLORS (compartido con ingest-api)
```

## Tests

```bash
cd apps/ingest-api
npm test
```

## Estructura

```text
.
├── docker-compose.yml
├── docker-compose.prod.honeypot.yml
├── docker-compose.prod.app.yml
├── docker-compose.prod.single-host.yml
├── scripts/
│   ├── pull-cowrie-logs.sh
│   └── Dockerfile.puller
└── apps/
    ├── ingest-api/
    └── dashboard/
```

