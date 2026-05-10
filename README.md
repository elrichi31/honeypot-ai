# Honeypot Platform

Plataforma de investigacion de seguridad que captura trafico SSH, HTTP, FTP, MySQL y port scans maliciosos, normaliza los eventos en una API centralizada y los visualiza en un dashboard con analisis de amenazas, correlacion cross-protocol, risk scoring por IP, clasificacion automatica de sesiones con IA y alertas en Discord.

## Stack

| Capa | Tecnologia | Por que |
|------|-----------|---------|
| Honeypot SSH | Cowrie (custom) | Honeypot SSH/Telnet de media interaccion. Simula un shell real y registra todo. honeyfs y txtcmds personalizados. |
| Honeypot HTTP | Flask + Gunicorn | Servidor web con rutas falsas que responden realisticamente a scanners. |
| Honeypot HTTP AI | Galah | Honeypot HTTP que usa un LLM para generar respuestas realisticas a cualquier peticion. |
| Honeypots de red | Python asyncio | Emulaciones ligeras para FTP, MySQL y puertos comunmente escaneados. |
| Honeypot multi-protocolo | Dionaea | Sensor externo que cubre FTP, MySQL, SMB, MSSQL, RPC/EPMAP, TFTP, MQTT y PPTP. |
| Log shipper | Vector 0.40 | Tail con offset persistente en disco, buffer 256 MB y retry resiliente. Configs para Cowrie y Galah. |
| Sensor beacon | Python (heartbeat.py) | Sidecar generico que registra y reporta el estado de cada sensor via `/sensors/heartbeat`. |
| API de ingesta | Fastify + TypeScript | Alta performance, schema validation y healthcheck nativo. |
| ORM / DB | Prisma + PostgreSQL | Migraciones declarativas y type-safety end-to-end. |
| Dashboard | Next.js 16 (App Router) | Server Components y fetch en el servidor. |
| Auth | better-auth | Sesiones seguras con soporte de multiples providers. |
| Alertas | Discord webhooks | Alertas automaticas con risk scoring, cooldowns y detalle de amenaza. |
| Graficas | recharts | Componentes React composables para time series. |
| Mapas | react-simple-maps + geoip-lite | Geolocalizacion offline sin API keys externas. |
| Contenedores | Docker Compose | Entorno reproducible, networks aisladas y hardening declarativo. |
| Documentacion | Astro (Starlight) | Sitio de docs en `apps/docs/`. |

## Arquitectura

```text
Atacante SSH    -> Cowrie (:22)            -> cowrie.json (volumen Docker)
                                           |
                                      Vector cowrie.toml
                                      tail + parse + buffer en disco
                                      POST /ingest/cowrie/vector
                                           |
Atacante HTTP   -> web-honeypot (:80)     -> POST /ingest/web/event
Atacante HTTP   -> Galah (:8080)          -> galah.json (volumen Docker)
                                           |
                                      Vector galah.toml
                                      POST /ingest/web/vector
                                           |
Atacante FTP    -> ftp-honeypot (:21)     -> POST /ingest/protocol/event
Atacante SQL    -> mysql-honeypot (:3306) -> POST /ingest/protocol/event
Port scans      -> port-honeypot          -> POST /ingest/protocol/event
Dionaea sensor  -> shipper.py             -> POST /ingest/protocol/event
                (FTP/MySQL/SMB/MSSQL/
                 RPC/TFTP/MQTT/PPTP)
                                           |
Todos los sensors -> heartbeat.py sidecar -> POST /sensors/heartbeat (cada 30s)
                                           |
                                      ingest-api (:3000)
                                      risk-score engine
                                      bot-detector
                                      threat-alerts + Discord
                                      weekly-report (cron)
                                           |
                                      PostgreSQL
                                           |
                                      dashboard (:4000)
                                      /clients   /sensors
                                      /threats
                                      /campaigns /web-attacks
                                      /settings  /setup
```

### Topologias de despliegue

| Archivo | Uso |
|---------|-----|
| `docker-compose.yml` | Desarrollo local con todos los servicios en un solo host |
| `docker-compose.prod.single-host.yml` | Un solo VPS con redes Docker separadas y dashboard solo en loopback |
| `docker-compose.prod.honeypot.yml` | VPS sensor con Cowrie, web-honeypot, FTP, MySQL, port-honeypot y Vector |
| `docker-compose.prod.app.yml` | Servidor app con PostgreSQL, ingest-api, dashboard y Caddy |
| `deploy/local/core.yml` | Lab multi-VM local — VM central (postgres, ingest-api, dashboard) |
| `deploy/local/sensor-cowrie.yml` | Lab multi-VM local — VM sensor SSH (Cowrie + beacon + Vector) |
| `deploy/local/sensor-web.yml` | Lab multi-VM local — VM sensor HTTP (web-honeypot) |
| `deploy/local/sensor-ssh-web.yml` | Lab multi-VM local — VM sensor SSH + HTTP combinados |
| `deploy/local/sensor-port.yml` | Lab multi-VM local — VM sensor port scanner |
| `sensors/dionaea/docker-compose.local.yml` | Dionaea en local con puertos remapeados para no colisionar |
| `sensors/dionaea/docker-compose.sensor.yml` | Dionaea como sensor remoto que empuja a un core central |

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

### Desarrollo local con Galah (honeypot HTTP con IA)

Galah es un honeypot HTTP que usa un LLM para generar respuestas realisticas. Requiere una API key de OpenAI o un endpoint compatible.

```bash
# Edita sensors/galah/config/config.yaml y pon tu API key de OpenAI
docker compose up galah -d

# Vector recoge los logs de Galah con vector/galah.toml
docker compose up vector-galah -d
```

Galah escucha en `:8080` (igual que web-honeypot; usa uno o el otro segun el entorno).

### Desarrollo local con Dionaea

Dionaea cubre protocolos que Cowrie y el web-honeypot no manejan: SMB, MSSQL, RPC, TFTP, MQTT, PPTP.

```bash
# Desde sensors/dionaea:
cp .env.local.example .env.local
# Edita .env.local: pon el mismo INGEST_SHARED_SECRET que usa tu core local

docker compose --env-file .env.local -f docker-compose.local.yml up -d

# Ver logs del shipper
docker compose --env-file .env.local -f docker-compose.local.yml logs -f dionaea-shipper
```

Puertos remapeados para no colisionar con el stack local:

| Puerto host | Puerto Dionaea | Protocolo |
|-------------|----------------|-----------|
| 2021 | 21 | FTP |
| 2445 | 445 | SMB |
| 21433 | 1433 | MSSQL |
| 3308 | 3306 | MySQL |
| 28081 | 8081 | HTTP |

Genera trafico de prueba:

```bash
nc localhost 2021
nc localhost 2445
curl http://localhost:28081/
```

```powershell
Test-NetConnection 127.0.0.1 -Port 2021
Test-NetConnection 127.0.0.1 -Port 2445
```

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

## Lab multi-VM local

Para simular una topologia de produccion con VMs separadas (por ejemplo con VirtualBox o VMware):

**VM central (192.168.56.10)**:

```bash
cp env/local.core.example .env
# Ajusta POSTGRES_PASSWORD, INGEST_SHARED_SECRET, BETTER_AUTH_SECRET
docker compose -f deploy/local/core.yml up --build -d
```

**VM sensor SSH (192.168.56.11)**:

```bash
cp env/local.sensor-cowrie.example .env
# Ajusta INGEST_SHARED_SECRET con el mismo valor que el core
docker compose -f deploy/local/sensor-cowrie.yml up --build -d
```

**VM sensor HTTP (192.168.56.12)**:

```bash
cp env/local.sensor-web.example .env
docker compose -f deploy/local/sensor-web.yml up --build -d
```

**VM sensor SSH + HTTP combinados (192.168.56.11)**:

```bash
cp env/local.sensor-ssh-web.example .env
docker compose -f deploy/local/sensor-ssh-web.yml up --build -d
```

**VM sensor port scan (192.168.56.13)**:

```bash
cp env/local.sensor-port.example .env
docker compose -f deploy/local/sensor-port.yml up --build -d
```

Cada sensor VM levanta automaticamente un `heartbeat.py` sidecar que registra el sensor en el core cada 30 segundos. Los sensores aparecen en el dashboard en `/sensors` con estado online/offline y ultimo heartbeat.

Si quieres separar por clientes, define `CLIENT_SLUG` y opcionalmente `CLIENT_NAME` en el `.env` de cada VM sensor. Todos los sensores de esa VM quedaran agrupados bajo el mismo cliente en `/clients` y `/sensors`.

## Cowrie personalizado

El directorio `cowrie/` contiene una imagen custom de Cowrie con:

- `cowrie.cfg` — configuracion del honeypot (output, auth, shell)
- `userdb.txt` — credenciales que Cowrie acepta como validas
- `honeyfs/` — filesystem falso montado en el honeypot: `/etc/passwd`, `/etc/shadow`, bash histories, `/proc/cpuinfo`, etc.
- `txtcmds/` — salidas estaticas de comandos comunes: `id`, `whoami`, `uname`, `free`, `w`, `last`, `netstat`, `ss`
- `patch_auth.py` — parche que se aplica en el build para customizar la autenticacion
- `heartbeat.py` — script beacon reutilizable por cualquier sensor

Los cambios al honeyfs y txtcmds hacen que el sistema simulado parezca una maquina Ubuntu real con usuarios y procesos creibles.

## Documentacion

El directorio `apps/docs/` contiene un sitio de documentacion tecnica construido con Astro Starlight. Cubre arquitectura, despliegue, variables de entorno, servicios individuales y referencia de API.

```bash
cd apps/docs
npm install
npm run dev  # http://localhost:4321
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
| `BETTER_AUTH_URL` | URL publica exacta del dashboard (debe coincidir con el origen del navegador) |
| `POSTGRES_PASSWORD` | Contrasena de PostgreSQL |
| `INGEST_SHARED_SECRET` | Token para `X-Ingest-Token` en `POST /ingest/*` y `POST /sensors/heartbeat` |
| `INGEST_API_URL` | URL del ingest-api vista desde los sensores (VPN o IP privada en produccion) |
| `DISCORD_WEBHOOK_URL` | Webhook de Discord para alertas de amenazas (opcional) |
| `HONEYPOT_IP` | IP publica o privada del sensor, precarga la pagina Settings del dashboard |
| `HONEYPOT_SSH_PORT` | Puerto SSH del honeypot para prefill en Settings (por defecto `22`) |
| `HONEYPOT_INGEST_PORT` | Puerto del ingest-api para prefill en Settings (por defecto `3000`) |
| `DASHBOARD_DOMAIN` | Dominio publico del dashboard en topologia two-host |
| `API_DOMAIN` | Dominio o subdominio publico del API si lo separas |
| `NEXT_PUBLIC_API_URL` | URL publica del API usada por el dashboard |
| `DASHBOARD_TIMEZONE` | Zona horaria IANA, por ejemplo `America/Bogota` |
| `CLIENT_SLUG` | Slug del cliente al que pertenece ese stack de sensores, por ejemplo `cliente-a` |
| `CLIENT_NAME` | Nombre legible del cliente, por ejemplo `Cliente A` |
| `SENSOR_ID` | ID unico del sensor para el beacon/heartbeat |
| `SENSOR_NAME` | Nombre legible del sensor que aparece en `/sensors` |
| `SENSOR_PROTOCOL` | Protocolo principal del sensor (`ssh`, `http`, `port-scan`, etc.) |
| `SENSOR_PORTS` | Puertos que escucha el sensor (separados por espacios) |
| `SENSOR_PROBE_PORTS` | Puertos que el ingest-api sondea para verificar online/offline |

## Estructura del repositorio

```text
.
|-- docker-compose.yml                # Dev: todo en un host
|-- docker-compose.prod.single-host.yml
|-- docker-compose.prod.honeypot.yml
|-- docker-compose.prod.app.yml
|-- .env.example                      # Template principal de variables de entorno
|-- Caddyfile                         # Reverse proxy HTTPS para produccion
|
|-- sensors/                          # Todos los honeypots y sensores
|   |-- cowrie/                       # SSH honeypot (build custom)
|   |   |-- heartbeat.py              # Beacon sidecar reutilizable por todos los sensores
|   |   |-- honeyfs/                  # Filesystem falso (/etc, /home, /proc)
|   |   `-- txtcmds/                  # Salidas falsas de comandos
|   |-- web-honeypot/                 # HTTP honeypot (Flask)
|   |-- galah/                        # HTTP honeypot con IA
|   |-- ftp-honeypot/
|   |-- mysql-honeypot/
|   |-- port-honeypot/
|   `-- dionaea/                      # Multi-protocolo (FTP/SMB/MySQL/MSSQL/RPC/TFTP/MQTT)
|       |-- docker-compose.local.yml
|       |-- docker-compose.sensor.yml
|       `-- services-enabled/
|
|-- apps/                             # Servicios de la plataforma
|   |-- ingest-api/
|   |   |-- src/routes/               # ingest, protocol, sensors, threats, web, stats
|   |   |-- src/lib/                  # risk-score, bot-detector, threat-alerts, discord
|   |   `-- prisma/
|   |-- dashboard/
|   |   |-- app/                      # /sensors /threats /campaigns /web-attacks /settings
|   |   |-- components/
|   |   `-- lib/
|   `-- docs/                         # Documentacion (Astro Starlight)
|
|-- vector/                           # Log shippers
|   |-- cowrie.toml
|   `-- galah.toml
|
|-- deploy/local/                     # Compose files para lab multi-VM local
|   |-- core.yml
|   |-- sensor-cowrie.yml
|   |-- sensor-web.yml
|   |-- sensor-ssh-web.yml
|   `-- sensor-port.yml
|
|-- env/                              # Templates de .env para lab multi-VM
|   |-- local.core.example
|   |-- local.sensor-cowrie.example
|   |-- local.sensor-web.example
|   |-- local.sensor-ssh-web.example
|   `-- local.sensor-port.example
|
`-- scripts/
    `-- seed.sh
```

## Paginas del dashboard

| Ruta | Descripcion |
|------|-------------|
| `/` | Redirect al dashboard principal |
| `/dashboard` | Vista general: stats, mapa de ataques, top IPs |
| `/live` | Feed en tiempo real de eventos |
| `/sessions` | Sesiones SSH con AI summary por sesion |
| `/sessions/[id]` | Detalle de sesion: comandos, credenciales, timeline |
| `/credentials` | Credenciales capturadas por Cowrie |
| `/commands` | Comandos ejecutados agrupados |
| `/campaigns` | Campanas de ataque agrupadas por similitud |
| `/web-attacks` | Hits HTTP por IP atacante |
| `/web-attacks/geo` | Mapa geografico de ataques HTTP |
| `/web-attacks/paths` | Rutas mas intentadas |
| `/web-attacks/timeline` | Timeline de ataques HTTP |
| `/web-attacks/[ip]` | Detalle de IP: historial de ataques HTTP |
| `/services` | Protocol hits: FTP, MySQL, ports |
| `/services/ftp` | Hits de FTP |
| `/services/mysql` | Hits de MySQL |
| `/services/ports` | Hits de port scanner |
| `/clients` | Gestion de clientes y asignacion manual de sensores |
| `/clients/[slug]` | Vista de sensores de un cliente concreto |
| `/threats` | Tabla de IPs con mayor risk score |
| `/threats/[ip]` | Perfil completo de amenaza por IP |
| `/sensors` | Estado online/offline de todos los sensores registrados |
| `/settings` | Configuracion: Discord, OpenAI, enrichment, infraestructura |
| `/setup` | Wizard de configuracion inicial |

## Alertas Discord

Configura `DISCORD_WEBHOOK_URL` en el `.env` o directamente en `/settings`. El sistema envia alertas cuando una IP supera el umbral de risk score con:

- Risk score y breakdown por protocolo
- IP y paises de origen
- Numero de eventos y protocolos involucrados
- Cooldown por IP para evitar spam

```bash
# Probar que las alertas funcionan
curl -X POST http://localhost:3000/api/alerts/test \
  -H "Content-Type: application/json"
```

## Sensor health monitoring

Cada sensor registra su estado enviando un heartbeat cada 30 segundos a `POST /sensors/heartbeat`. El ingest-api ademas sondea los puertos declarados para confirmar online/offline independientemente del beacon.

La pagina `/sensors` del dashboard muestra todos los sensores con:
- Estado online/offline con indicador animado
- Ultimo heartbeat
- Protocolo, IP, puertos y version del honeypot
- Contador de eventos del periodo

La pagina `/clients` permite:
- Crear clientes
- Asignar sensores ya registrados a un cliente
- Entrar a cada cliente y ver solo sus sensores

## Tests

```bash
cd apps/ingest-api
npm test
```
