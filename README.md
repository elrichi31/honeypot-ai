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

## Archivos de despliegue

- `docker-compose.yml`: entorno local completo.
- `docker-compose.prod.honeypot.yml`: VPS publico con solo `cowrie`.
- `docker-compose.prod.app.yml`: servidor de aplicacion con `postgres`, `ingest-api` y `dashboard`.

## Desarrollo local

### Requisitos

- Docker Desktop
- Node.js 20+
- Git

### Levantar todo

```bash
git clone <repo-url>
cd honeypot-ai
docker compose up --build -d
docker compose ps
```

Servicios locales:

- `cowrie` en `localhost:2222`
- `ingest-api` en `localhost:3000`
- `dashboard` en `localhost:4000`
- `postgres` interno y expuesto en `localhost:5432`

### Probar el flujo

```bash
ssh -p 2222 root@localhost
```

Cowrie acepta cualquier password. Despues podes probar comandos como `whoami`, `ls` o `cat /etc/passwd`.

### Ver datos

- Dashboard: `http://localhost:4000`
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

Antes de publicar Cowrie en el puerto `22`, move tu SSH real a otro puerto como `8022` y verifica el acceso antes de cerrar la sesion.

```bash
docker compose -f docker-compose.prod.honeypot.yml up -d
docker compose -f docker-compose.prod.honeypot.yml ps
```

Esto deja a Cowrie escuchando en el puerto `22` del VPS.

### Paso 2: desplegar la app en el servidor principal

```bash
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
ssh-copy-id -p 8022 -i ~/.ssh/honeypot_vps.pub user@vps-ip
```

Opcionalmente agrega un alias:

```sshconfig
Host honeypot-vps
  HostName vps-ip
  Port 8022
  User user
  IdentityFile ~/.ssh/honeypot_vps
```

### Paso 4: arrancar el puller remoto

```bash
VPS_HOST=honeypot-vps VPS_SSH_PORT=8022 API_URL=http://localhost:3000 bash scripts/pull-cowrie-logs.sh
```

Ese script:

1. Entra por SSH al VPS.
2. Lee solo los bytes nuevos de `cowrie.json`.
3. Hace `POST /ingest/cowrie/batch` a la API local.

### Paso 5: dejar el puller como servicio

```ini
[Unit]
Description=Pull Cowrie logs from honeypot VPS
After=network.target

[Service]
Environment=VPS_HOST=honeypot-vps
Environment=VPS_SSH_PORT=8022
Environment=API_URL=http://localhost:3000
WorkingDirectory=/ruta/a/honeypot-ai
ExecStart=/bin/bash /ruta/a/honeypot-ai/scripts/pull-cowrie-logs.sh
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

## Variables importantes

### Dashboard

- `NEXT_PUBLIC_API_URL`: URL publica que usa el navegador. Default `http://localhost:3000`.
- `INTERNAL_API_URL`: URL interna que usa el render server-side dentro de Docker. En compose de prod queda en `http://ingest-api:3000`.

### Puller

- `VPS_HOST`: host o alias SSH del VPS honeypot.
- `VPS_SSH_PORT`: puerto SSH administrativo del VPS.
- `API_URL`: URL base de `ingest-api`.
- `CONTAINER`: nombre del contenedor Cowrie. Default `cowrie`.
- `POLL_INTERVAL`: segundos entre lecturas. Default `3`.

## API

### Endpoints principales

- `GET /health`
- `GET /sessions`
- `GET /sessions/:id`
- `GET /events`
- `POST /ingest/cowrie/event`
- `POST /ingest/cowrie/batch`
- `POST /ingest/cowrie/file`

Tipos normalizados:

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
|-- docker-compose.yml
|-- docker-compose.prod.honeypot.yml
|-- docker-compose.prod.app.yml
|-- scripts/
|   |-- pull-cowrie-logs.sh
|   `-- Dockerfile.puller
`-- apps/
    |-- ingest-api/
    `-- dashboard/
```
