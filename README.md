# Honeypot Platform

Plataforma de ingesta y persistencia de eventos SSH capturados por un honeypot Cowrie.

## Stack

- **Honeypot**: Cowrie (Docker)
- **Backend**: Fastify + TypeScript
- **ORM**: Prisma
- **Validacion**: Zod
- **Base de datos**: PostgreSQL
- **Contenedores**: Docker Compose

## Arquitectura

```
┌─────────────────────┐                          ┌──────────────────────┐
│  Cowrie (honeypot)  │    volumen compartido     │  log-puller          │
│  puerto 22 / 2222   │ ◄────────────────────     │  (contenedor)        │
│  escribe cowrie.json│   lee directo del vol     │  pull-cowrie-logs.sh │
└─────────────────────┘                          │       ↓ HTTP batch   │
                                                  │  ingest-api :3000    │
                                                  │       ↓              │
                                                  │  PostgreSQL :5432    │
                                                  └──────────────────────┘
```

Un solo script (`pull-cowrie-logs.sh`) se encarga de leer los logs de Cowrie y enviarlos a la API. Funciona en tres modos:

- **Docker** (`DIRECT_FILE=true`): corre como contenedor `log-puller`, lee el volumen de Cowrie directamente. **Se levanta solo con `docker compose up`.**
- **Dev local**: ejecuta `docker exec cowrie ...` desde el host
- **Prod**: ejecuta `ssh vps docker exec cowrie ...` (remoto)

La API solo recibe eventos por HTTP. No lee archivos, no tiene watcher.

Los timestamps en todos los endpoints se devuelven en **UTC-5**.

---

## Desarrollo local

### Requisitos

- Docker Desktop
- Git

### Paso 1 — Levantar servicios

```bash
git clone <repo-url>
cd honeypot-pr
docker compose up --build -d
docker compose ps
```

Esto levanta cuatro servicios:
- **cowrie** — honeypot SSH en puerto 2222
- **postgres** — base de datos en puerto 5432
- **ingest-api** — API en puerto 3000 (espera a Postgres y aplica schema automaticamente)
- **log-puller** — lee el `cowrie.json` del volumen compartido y envia eventos al API cada 3 segundos

No hace falta correr ningun script manualmente. El pull de logs arranca solo.

### Paso 3 — Probar

```bash
# Conectarse al honeypot (simula un atacante)
ssh -p 2222 root@localhost
# Escribi cualquier password, Cowrie acepta todo
# Ejecuta comandos: whoami, ls, cat /etc/passwd
# Sali con exit o Ctrl+D

# Ver los eventos capturados (en otra terminal)
curl http://localhost:3000/events | python -m json.tool

# Ver las sesiones
curl http://localhost:3000/sessions | python -m json.tool

# Ver una sesion con todos sus eventos
curl http://localhost:3000/sessions/<session-id> | python -m json.tool
```

### Desarrollo de la API con hot reload

```bash
# Levantar Cowrie, Postgres y log-puller en Docker
docker compose up -d cowrie postgres log-puller

# Instalar dependencias y arrancar la API en local
cd apps/ingest-api
npm install
cp .env.example .env
npx prisma db push
npm run dev
```

> El `log-puller` usa `API_URL=http://ingest-api:3000` por defecto (dentro de Docker). Para que apunte a tu API local, levantalo manualmente:
> ```bash
> API_URL=http://localhost:3000 bash scripts/pull-cowrie-logs.sh
> ```

### Comandos utiles

```bash
docker logs -f ingest-api        # Logs de la API
docker logs -f cowrie             # Logs de Cowrie
docker logs -f log-puller         # Ver eventos siendo ingestados en tiempo real
docker compose down               # Parar todo
docker compose down -v            # Parar y borrar datos
```

---

## Produccion (Cowrie en VPS separado)

Cowrie corre en un VPS expuesto. La API + DB corren en otro servidor. El VPS del honeypot **no inicia conexiones salientes** — tu servidor va a buscar los logs.

### Puertos

VPS del honeypot:

| Puerto | Servicio | Quien lo usa |
|--------|----------|--------------|
| 22     | Cowrie (trampa) | Atacantes — creen que es SSH real |
| 8022   | SSH real (sshd) | Vos, para administrar el VPS |

Servidor de la API:

| Puerto | Servicio | Quien lo usa |
|--------|----------|--------------|
| 3000   | ingest-api | Solo acceso interno / VPN |
| 5432   | PostgreSQL | Solo acceso interno |

No necesitas puerto 80 ni 443. La API no es publica.

### Paso 1 — VPS del honeypot

```bash
# 1. Instalar Docker

# 2. Mover SSH real a otro puerto
sudo sed -i 's/#Port 22/Port 8022/' /etc/ssh/sshd_config
sudo systemctl restart sshd
# IMPORTANTE: no cerrar esta sesion hasta verificar el nuevo puerto

# 3. Verificar acceso por el nuevo puerto (desde otra terminal)
ssh -p 8022 user@vps-ip

# 4. Levantar Cowrie en el puerto 22 (la trampa)
docker run -d \
  --name cowrie \
  --restart unless-stopped \
  -p 22:2222 \
  -v cowrie_var:/cowrie/cowrie-git/var \
  cowrie/cowrie:latest

# 5. Verificar que Cowrie responde
ssh root@vps-ip
# Deberias ver el shell falso de Cowrie
```

Eso es todo en el VPS. No corre scripts, no envia nada. Solo recibe.

### Paso 2 — Servidor de la API

```bash
# 1. Levantar API y PostgreSQL (sin Cowrie)
docker compose up --build -d postgres ingest-api

# 2. Verificar
curl http://localhost:3000/health

# 3. Ejecutar el pull de logs desde el VPS remoto
VPS_HOST=user@vps-ip VPS_SSH_PORT=8022 bash scripts/pull-cowrie-logs.sh
```

El script se conecta al VPS por SSH, lee los bytes nuevos del log y los manda como batch a la API local. Cada 3 segundos.

### Servicio persistente con systemd

```bash
# /etc/systemd/system/cowrie-pull.service
[Unit]
Description=Pull Cowrie logs from honeypot VPS
After=network.target

[Service]
Environment=VPS_HOST=user@vps-ip
Environment=VPS_SSH_PORT=8022
Environment=API_URL=http://localhost:3000
ExecStart=/bin/bash /ruta/a/scripts/pull-cowrie-logs.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now cowrie-pull
```

### SSH keys (para pull automatico sin password)

```bash
# Generar key
ssh-keygen -t ed25519 -f ~/.ssh/honeypot_vps -N ""

# Copiar al VPS
ssh-copy-id -p 8022 -i ~/.ssh/honeypot_vps.pub user@vps-ip

# Agregar al SSH config
cat >> ~/.ssh/config << EOF
Host honeypot-vps
  HostName vps-ip
  Port 8022
  User user
  IdentityFile ~/.ssh/honeypot_vps
EOF

# Usar en el script
VPS_HOST=honeypot-vps bash scripts/pull-cowrie-logs.sh
```

---

## API - Endpoints

### Health check

```
GET /health
```

### Consultar sesiones

```
GET /sessions
GET /sessions?limit=10&offset=0
```

### Consultar sesion con todos sus eventos

```
GET /sessions/:id
```

### Consultar eventos

```
GET /events
GET /events?limit=20&offset=0
GET /events?type=auth.success
GET /events?type=command.input
```

Tipos: `session.connect`, `session.closed`, `auth.success`, `auth.failed`, `client.version`, `client.kex`, `client.size`, `command.input`, `command.failed`.

### Ingestar evento individual

```
POST /ingest/cowrie/event
Content-Type: application/json

{ "eventid": "cowrie.session.connect", "src_ip": "...", "session": "...", "timestamp": "..." }
```

201 si es nuevo, 200 si es duplicado.

### Ingestar batch

```
POST /ingest/cowrie/batch
Content-Type: application/json

{ "events": [ {...}, {...} ] }
```

Hasta 1000 eventos por request.

### Ingestar desde archivo (solo dev)

```
POST /ingest/cowrie/file
Content-Type: application/json

{ "filePath": "/ruta/absoluta/cowrie.json" }
```

---

## Modelo de datos

### Session

| Campo           | Tipo     | Descripcion                    |
|-----------------|----------|--------------------------------|
| id              | UUID     | PK                             |
| cowrieSessionId | string   | ID de sesion de Cowrie (unico) |
| srcIp           | string   | IP del atacante                |
| protocol        | string   | ssh                            |
| username        | string?  | Usuario usado en login         |
| password        | string?  | Password usada en login        |
| loginSuccess    | boolean? | Si el login fue exitoso        |
| hassh           | string?  | Fingerprint SSH del cliente    |
| clientVersion   | string?  | Version SSH del cliente        |
| startedAt       | DateTime | Inicio de la sesion            |
| endedAt         | DateTime?| Fin de la sesion               |

### Event

| Campo          | Tipo     | Descripcion                        |
|----------------|----------|------------------------------------|
| id             | UUID     | PK                                 |
| sessionId      | UUID     | FK a Session                       |
| eventType      | string   | Categoria interna normalizada      |
| eventTs        | DateTime | Timestamp original del evento      |
| srcIp          | string   | IP del atacante                    |
| message        | string?  | Mensaje legible de Cowrie          |
| command        | string?  | Comando ejecutado (si aplica)      |
| username       | string?  | Usuario (si aplica)                |
| password       | string?  | Password (si aplica)               |
| success        | boolean? | true/false para auth events        |
| rawJson        | JSON     | Evento completo original de Cowrie |
| normalizedJson | JSON     | Evento normalizado compacto        |

---

## Estructura del proyecto

```
honeypot-pr/
├── docker-compose.yml
├── scripts/
│   ├── pull-cowrie-logs.sh     # Pull de logs (local, docker o remoto)
│   └── Dockerfile.puller       # Imagen minima para el contenedor log-puller
└── apps/ingest-api/
    ├── Dockerfile
    ├── entrypoint.sh
    ├── package.json
    ├── tsconfig.json
    ├── .env.example
    ├── prisma/
    │   └── schema.prisma
    ├── src/
    │   ├── main.ts             # Entry point
    │   ├── app.ts              # Fastify setup + plugins
    │   ├── plugins/
    │   │   └── prisma.ts       # PrismaClient como plugin
    │   ├── routes/
    │   │   ├── health.ts       # GET /health
    │   │   ├── ingest.ts       # POST /ingest/*
    │   │   ├── sessions.ts     # GET /sessions
    │   │   └── events.ts       # GET /events
    │   ├── modules/
    │   │   ├── ingest/
    │   │   │   └── ingest.service.ts
    │   │   ├── sessions/
    │   │   │   └── session.repository.ts
    │   │   └── events/
    │   │       └── event.repository.ts
    │   ├── lib/
    │   │   ├── parser.ts       # JSON linea → tipo interno
    │   │   └── normalizer.ts   # cowrie.eventid → categoria
    │   ├── types/
    │   │   └── index.ts
    │   └── schemas/
    │       └── index.ts        # Validacion Zod
    └── tests/
        ├── parser.test.ts
        ├── normalizer.test.ts
        └── ingest.service.test.ts
```

## Tests

```bash
cd apps/ingest-api
npm test
```

38 tests cubriendo parser, normalizer y servicio de ingesta.
