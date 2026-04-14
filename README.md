# Honeypot Platform

Plataforma para capturar actividad SSH con Cowrie, normalizar eventos en una API Fastify y visualizarlos desde un dashboard Next.js.

## Stack

- Cowrie
- Fastify + TypeScript
- Prisma
- PostgreSQL
- Next.js
- Docker Compose

## Arquitectura recomendada

En desarrollo podes correr todo junto.

En produccion se recomienda separar:

1. Un VPS publico solo para `cowrie`.
2. Un servidor de aplicacion para `postgres`, `ingest-api` y `dashboard`.
3. Un proceso `pull-cowrie-logs.sh` en el servidor de aplicacion que lee el log remoto por SSH y lo manda a la API.

### Puertos

| Puerto | Servicio | Descripcion |
|--------|----------|-------------|
| `22`   | Cowrie (prod) | SSH honeypot — los atacantes se conectan aqui |
| `2222` | Cowrie (dev) | SSH honeypot en local |
| `8022` | VPS SSH admin | Acceso administrativo real al VPS — el puller entra por aqui |
| `3000` | ingest-api | API Fastify que recibe y normaliza eventos de Cowrie |
| `4000` | dashboard | Dashboard Next.js |
| `5432` | PostgreSQL | Base de datos interna |

## Archivos de despliegue

- `docker-compose.yml`: entorno local completo.
- `docker-compose.prod.honeypot.yml`: VPS publico con solo `cowrie`.
- `docker-compose.prod.app.yml`: servidor de aplicacion con `postgres`, `ingest-api` y `dashboard`.

## Desarrollo local

### Requisitos

- Docker Desktop
- Node.js 20+
- Git

### Levantar todo con Docker

```bash
git clone <repo-url>
cd honeypot-pr

# Copia y rellena el .env raíz (solo necesitas cambiar BETTER_AUTH_SECRET)
cp .env.example .env

docker compose up --build -d
docker compose ps
```

Servicios locales:

- `cowrie` en `localhost:2222`
- `ingest-api` en `localhost:3000`
- `dashboard` en `localhost:4000`
- `postgres` interno y expuesto en `localhost:5432`

### Levantar servicios individualmente (sin Docker para el código)

Util para desarrollar en el dashboard o la API sin rebuilds.

**1. Levanta solo la infraestructura con Docker:**

```bash
docker compose up postgres ingest-api -d
```

**2. Corre el dashboard en local:**

```bash
cp apps/dashboard/.env.example apps/dashboard/.env
# Edita BETTER_AUTH_SECRET con un valor aleatorio:
#   openssl rand -base64 32

cd apps/dashboard
npm install
npm run dev
# → http://localhost:3001
```

**3. (Opcional) Corre ingest-api en local:**

```bash
cp apps/ingest-api/.env.example apps/ingest-api/.env

cd apps/ingest-api
npm install
npm run dev
# → http://localhost:3000
```

### Probar el flujo

```bash
ssh -p 2222 root@localhost
```

Cowrie acepta cualquier password. Despues podes probar comandos como `whoami`, `ls` o `cat /etc/passwd`.

### Ver datos

- Dashboard: `http://localhost:4000` (Docker) o `http://localhost:3001` (local)
- Health API: `http://localhost:3000/health`

```bash
curl http://localhost:3000/events
curl http://localhost:3000/sessions
```

### Comandos utiles

```bash
docker logs -f ingest-api
docker logs -f cowrie
docker logs -f log-puller
docker compose down
docker compose down -v
```

## Produccion

La topologia de produccion es:

- VPS honeypot: solo recibe conexiones de atacantes y guarda `cowrie.json`.
- Servidor app: expone el dashboard, corre la API y guarda datos en PostgreSQL.
- Puller: corre en el servidor app, entra por SSH al VPS y trae eventos nuevos.

### Paso 1: desplegar Cowrie en el VPS

Antes de publicar Cowrie en el puerto `22`, move tu SSH real a otro puerto (recomendado `8022`) y verifica el acceso antes de cerrar la sesion.

```bash
# En el VPS, edita /etc/ssh/sshd_config:
Port 8022
# Luego reinicia sshd y verifica que podes entrar por el nuevo puerto
# antes de continuar.

docker compose -f docker-compose.prod.honeypot.yml up -d
docker compose -f docker-compose.prod.honeypot.yml ps
```

Esto deja a Cowrie escuchando en el puerto `22` del VPS.

### Paso 2: desplegar la app en el servidor principal

Definir las variables de entorno antes de levantar. La variable `HONEYPOT_IP` es la IP publica del VPS donde corre Cowrie — el dashboard la usa para mostrar la informacion de infraestructura en Settings.

```bash
export HONEYPOT_IP=<ip-del-vps>
export HONEYPOT_SSH_PORT=8022     # puerto SSH admin del VPS (default 8022)
export HONEYPOT_INGEST_PORT=8022  # mismo puerto, canal honeypot → puller

docker compose -f docker-compose.prod.app.yml up --build -d
docker compose -f docker-compose.prod.app.yml ps
curl http://localhost:3000/health
```

Esto levanta:

- `postgres`
- `ingest-api`
- `dashboard`

El dashboard queda en `http://localhost:4000`.

### Paso 3: configurar acceso SSH del servidor app al VPS

```bash
ssh-keygen -t ed25519 -f ~/.ssh/honeypot_vps -N ""
ssh-copy-id -p 8022 -i ~/.ssh/honeypot_vps.pub user@<ip-del-vps>
```

Opcionalmente agrega un alias en `~/.ssh/config`:

```sshconfig
Host honeypot-vps
  HostName <ip-del-vps>
  Port 8022
  User root
  IdentityFile ~/.ssh/honeypot_vps
```

### Paso 4: arrancar el puller remoto

```bash
VPS_HOST=<ip-del-vps> \
VPS_SSH_PORT=8022 \
VPS_USER=root \
SSH_KEY=$HOME/.ssh/honeypot_vps \
REMOTE_LOG=/var/lib/docker/volumes/honeypot-pr_cowrie_var/_data/log/cowrie/cowrie.json \
API_URL=http://localhost:3000 \
bash scripts/pull-cowrie-logs.sh
```

Ese script:

1. Entra por SSH al VPS usando el puerto `8022` (SSH admin).
2. Lee solo los bytes nuevos de `cowrie.json`.
3. Hace `POST /ingest/cowrie/batch` a la ingest-api local.

### Paso 5: dejar el puller como servicio

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

Guardalo como `/etc/systemd/system/cowrie-pull.service` y luego:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cowrie-pull
sudo systemctl status cowrie-pull
```

## Variables de entorno

### Raíz del proyecto (`.env`) — usado por docker-compose

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | — | **Requerido.** Secret para firmar sesiones. Genera con `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:4000` | URL publica del dashboard |
| `HONEYPOT_IP` | — | IP publica del VPS honeypot. Pre-carga el campo en Settings |
| `HONEYPOT_SSH_PORT` | `22` | Puerto SSH del honeypot (donde se conectan los atacantes) |
| `HONEYPOT_INGEST_PORT` | `8022` | Puerto SSH admin del VPS (canal honeypot → puller) |
| `DASHBOARD_TIMEZONE` | `UTC` | Zona horaria para las graficas (nombre IANA, ej. `America/Bogota`) |

### Dashboard (`apps/dashboard/.env`)

| Variable | Local dev | Descripcion |
|----------|-----------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | URL publica que usa el navegador para llamar a la ingest-api |
| `INTERNAL_API_URL` | `http://localhost:3000` | URL interna server-side. Docker Compose la sobreescribe con `http://ingest-api:3000` |
| `DATABASE_URL` | `postgresql://honeypot:honeypot@localhost:5432/honeypot` | Conexion a PostgreSQL (usada por better-auth) |
| `BETTER_AUTH_SECRET` | — | **Requerido.** Mismo valor que en el `.env` raiz |
| `BETTER_AUTH_URL` | `http://localhost:3001` | URL base del dashboard. En Docker usa el puerto `4000` |
| `HONEYPOT_IP` | — | Pre-carga el campo IP en Settings |
| `HONEYPOT_SSH_PORT` | `22` | Pre-carga el puerto SSH en Settings |
| `HONEYPOT_INGEST_PORT` | `8022` | Pre-carga el puerto ingest en Settings |
| `DASHBOARD_TIMEZONE` | `UTC` | Zona horaria para las graficas. Tambien configurable desde Settings |

> Las variables `HONEYPOT_*` y `DASHBOARD_TIMEZONE` son opcionales. Si no se definen, se pueden configurar directamente desde la pagina Settings del dashboard.

### Ingest API (`apps/ingest-api/.env`)

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://honeypot:honeypot@localhost:5432/honeypot` | Conexion a PostgreSQL |
| `PORT` | `3000` | Puerto donde escucha la API |
| `HOST` | `0.0.0.0` | Interfaz de red |

### Puller

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `VPS_HOST` | — | IP o alias SSH del VPS honeypot |
| `VPS_SSH_PORT` | `8022` | Puerto SSH administrativo del VPS |
| `VPS_USER` | `root` | Usuario SSH en el VPS |
| `SSH_KEY` | `~/.ssh/honeypot_vps` | Ruta a la clave privada SSH |
| `REMOTE_LOG` | `/root/honeypot-ai/cowrie.json` | Ruta del log de Cowrie en el VPS |
| `API_URL` | `http://localhost:3000` | URL base de ingest-api |
| `POLL_INTERVAL` | `3` | Segundos entre lecturas del log |
| `DIRECT_FILE` | `false` | Si es `true`, lee el archivo directamente sin SSH (modo Docker local) |

## Dashboard — funcionalidades

### Sesiones y Escaneos

La vista `/sessions` divide el trafico en dos tabs:

- **Sesiones** — conexiones donde el atacante logro autenticarse (`loginSuccess = true`). Se muestran individualmente con su timeline de eventos expandible.
- **Escaneos** — conexiones fallidas, agrupadas por IP de origen. Cada grupo muestra:
  - Cantidad de intentos desde esa IP
  - Todas las credenciales probadas (usuario:password)
  - Timestamp del ultimo intento
  - Version del cliente SSH / firma de la herramienta usada
  - Lista expandible de cada intento individual con link a Replay

### Clasificacion automatica

Cada sesion/escaneo recibe una clasificacion automatica segun `loginSuccess` y cantidad de eventos:

| Clasificacion | Condicion | Descripcion |
|---------------|-----------|-------------|
| Scanner | No logueado, pocos eventos | Solo sondeo de puerto |
| Bot scan | No logueado, 8–30 eventos | Intento multiple de credenciales |
| Brute-force | No logueado, >30 eventos | Ataque de fuerza bruta intenso |
| Login only | Logueado, ≤8 eventos | Acceso exitoso sin actividad post-login |
| Recon | Logueado, 8–20 eventos | Reconocimiento basico tras acceso |
| Interactive | Logueado, 20–40 eventos | Sesion interactiva activa |
| Malware dropper | Logueado, >40 eventos | Actividad extensa, posible descarga de malware |

### Settings

La pagina `/settings` permite configurar:

- **Infraestructura**: IP del honeypot, puerto SSH, puerto ingest, URL del ingest-api, y zona horaria para las graficas. Si se definen las variables `HONEYPOT_*` y `DASHBOARD_TIMEZONE` en el entorno, los campos se pre-cargan automaticamente.
- **Zona horaria**: selector con zonas IANA agrupadas por region. Afecta la grafica Activity Timeline del dashboard.
- **AI Analysis**: API key de OpenAI para analisis de sesiones con GPT-4o mini.
- **Notificaciones**, **Data Retention**, **Security**: configuracion de alertas y acceso.

La configuracion se guarda en `apps/dashboard/data/config.json` (persistido via volumen Docker en produccion).

## API

### Endpoints principales

- `GET /health`
- `GET /sessions`
- `GET /sessions/:id`
- `GET /events`
- `POST /ingest/cowrie/event`
- `POST /ingest/cowrie/batch`
- `POST /ingest/cowrie/file`

### Tipos de eventos normalizados

- `session.connect`
- `session.closed`
- `auth.success`
- `auth.failed`
- `client.version`
- `client.kex`
- `client.size`
- `command.input`
- `command.failed`

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
├── scripts/
│   ├── pull-cowrie-logs.sh
│   └── Dockerfile.puller
└── apps/
    ├── ingest-api/
    └── dashboard/
```
