---
title: Arquitectura
description: Diagrama de componentes, topologias de despliegue, redes Docker y flujo de datos entre sensores.
---

## Componentes del sistema

```mermaid
graph TD
    subgraph Sensores
        C[Cowrie\nSSH/Telnet :22]
        W[Web Honeypot\nHTTP :80]
        G[Galah\nHTTP+IA :8080]
        D[Dionaea\nFTP/SMB/MySQL/MSSQL\nRPC/TFTP/MQTT/PPTP]
        FTP[FTP Honeypot :21\nfull-interaction + uploads]
        SQL[MySQL Honeypot :3306]
        PORT[Port Honeypot]
        SMB[SMB Honeypot :445]
        OC[OpenCanary\nred de engaño 10.0.1.0/24]
        SUR[Suricata\nIDS / EVE JSON]
    end

    subgraph Shippers
        VC[Vector\ncowrie.toml → Kafka]
        VS[Vector\nsuricata.toml → Kafka]
        VP[Vector\nweb-honeypot.toml + protocol.toml → HTTP\ncon buffer en disco]
        VG[Vector\ngalah.toml → HTTP]
        DS[Dionaea Shipper\nshipper.py]
        HB[heartbeat.py\nsidecar beacon]
    end

    subgraph Kafka["Kafka (KRaft, opcional según topología)"]
        TC[topic honeypot.cowrie]
        TS[topic honeypot.suricata]
    end

    subgraph Plataforma
        API[ingest-api :3000\nFastify + TypeScript\n+ Kafka consumer]
        PB[(pgbouncer\ntransaction pool)]
        DB[(PostgreSQL primary)]
        DBR[(PostgreSQL replica\nstreaming, solo lectura)]
        RD[(Redis\ncache de queries)]
        DASH[Dashboard :4000\nNext.js 16]
        DISC[Discord]
    end

    C -->|cowrie.json| VC
    SUR -->|eve.json| VS
    G -->|galah.json| VG
    D --> DS
    W -->|events.json| VP
    FTP -->|events.json| VP
    SQL -->|events.json| VP
    PORT -->|events.json| VP
    SMB -->|events.json| VP
    OC -->|POST /ingest/deception/portscan\n+ /ingest/protocol/event| API

    VC --> TC --> API
    VS --> TS --> API
    VP -->|POST /ingest/web/vector\nPOST /ingest/protocol/event| API
    VG -->|POST /ingest/web/vector| API
    DS -->|POST /ingest/protocol/event| API
    HB -->|POST /sensors/heartbeat cada 30s| API

    API --> PB --> DB
    DB -.->|replicación WAL| DBR
    API -->|lecturas pesadas| DBR
    API <-->|cache| RD
    DB --> DASH
    API -->|alertas de amenazas| DISC
    API -->|stream SSE /events/live| DASH
```

La plataforma es **multi-tenant**: cada sensor pertenece a un cliente y el
aislamiento de datos se aplica en el servidor por `sensor_id`. Ver
[Multi-tenant](/services/multi-tenant/).

### Kafka vs HTTP: qué sensor usa cada canal

Solo **Cowrie** y **Suricata** están migrados a Kafka hoy. Los otros 5
honeypots (web, FTP, MySQL, port, SMB) siguen enviando por HTTP, pero con
**buffer en disco en Vector** — un corte de red o de la API ya no pierde
eventos, quedan en disco y se reenvían al recuperarse. Antes de este cambio
esos 5 sensores hacían POST directo *fire-and-forget* y podían perder eventos
silenciosamente.

| Sensor | Canal | Garantía de entrega |
|--------|-------|----------------------|
| Cowrie | Vector → Kafka (`honeypot.cowrie`) | At-least-once, topic persistente |
| Suricata | Vector → Kafka (`honeypot.suricata`) | At-least-once, topic persistente |
| web-honeypot | Vector → HTTP (buffer en disco) | Reintento automático, sin pérdida |
| FTP / MySQL / Port / SMB | Vector → HTTP (buffer en disco) | Reintento automático, sin pérdida |
| Galah | Vector → HTTP | Reintento automático, sin pérdida |
| Dionaea | shipper.py → HTTP directo | Sin buffer (aún) |
| OpenCanary | POST directo | Sin buffer (aún) |

Migrar los 5 sensores HTTP a Kafka es un TODO explícito ligado a los deploys
multi-host: cambia el `sink` de Vector de `http` a `kafka`, agrega los topics
`honeypot.web` / `honeypot.protocol`, y sus handlers en el consumer — los
sensores en sí **no cambian**, ya escriben a un log de eventos.

---

## Topologias de despliegue

La plataforma soporta cinco configuraciones. Elige segun tu presupuesto y necesidades de aislamiento.

### Desarrollo local (todo en un host)

Un solo `docker compose up` levanta todo junto. El dashboard queda en `http://localhost:4000`.

```mermaid
graph LR
    subgraph localhost
        C22[Cowrie :2222]
        W80[web-honeypot :8080]
        G8080[Galah :8080]
        API[ingest-api :3000]
        DB[(postgres :5432)]
        RD[(redis :6379)]
        KAFKA[(kafka :9092\nEXTERNAL :9094)]
        DASH[dashboard :4000]
        VEC[vector]
    end

    C22 --> VEC -->|Kafka| KAFKA --> API
    W80 -->|HTTP| API
    G8080 --> VEC
    API --> DB --> DASH
    API --> RD
```

Igual que en produccion, Vector envia Cowrie por Kafka (KRaft, un solo nodo) y el resto de sensores por HTTP directo. La unica diferencia de dev es el listener extra `EXTERNAL://localhost:9094`, pensado para inspeccionar Kafka con herramientas del host (`kafka-console-consumer`, etc.) — no existe en ningun compose de produccion. Un servicio `seed` (no mostrado) corre `prisma db seed` una vez que `ingest-api` esta sano, para poblar datos de ejemplo.

### Lab multi-VM local

Simula la topologia de produccion usando VMs separadas (VirtualBox / VMware). Util para probar la arquitectura distribuida sin un VPS real.

```mermaid
graph TD
    subgraph "VM Central 192.168.56.10"
        API[ingest-api :3000]
        DB[(postgres)]
        DASH[dashboard :4000]
    end

    subgraph "VM Sensor SSH 192.168.56.11"
        COW[Cowrie :2222]
        VEC[Vector]
        HB1[heartbeat.py]
    end

    subgraph "VM Sensor HTTP 192.168.56.12"
        WEB[web-honeypot :8080]
        HB2[heartbeat.py]
    end

    subgraph "VM Sensor Port 192.168.56.13"
        PORT[port-honeypot]
        HB3[heartbeat.py]
    end

    COW --> VEC -->|VPN/LAN| API
    WEB -->|VPN/LAN| API
    PORT -->|VPN/LAN| API
    HB1 & HB2 & HB3 -->|heartbeat| API
    API --> DB --> DASH
```

Ver [Multi-VM Local Lab](/deployment/multi-vm-local/).

### Single-host (un VPS)

Todo en el mismo servidor: honeypots, Kafka, Postgres (primary + replica),
pgbouncer, Redis, ingest-api y dashboard. Redes Docker separadas aislan
Cowrie del resto. El dashboard solo es accesible por SSH tunnel — no expuesto
a internet.

```mermaid
graph LR
    subgraph "VPS Publico"
        direction TB
        subgraph edge
            COW[:22 Cowrie]
            WEB[:80 web-honeypot]
        end
        subgraph honeypot_ingest
            VEC[vector] --> KAFKA[(Kafka\nKRaft)]
            KAFKA --> API
        end
        subgraph db_private
            API[ingest-api] --> PB[(pgbouncer)] --> DB[(postgres primary)]
            DB -.replicacion.-> DBR[(postgres replica)]
            API --> RD[(redis)]
        end
        subgraph app_api
            API --> DASH[127.0.0.1:4000\ndashboard]
        end
        COW --> VEC
        WEB --> API
    end

    ADMIN -->|SSH tunnel\n-L 4000:127.0.0.1:4000| DASH
```

Ver [Single-Host](/deployment/single-host/).

### Two-host con VPN (recomendado para produccion)

Dos servidores conectados por VPN (Tailscale / WireGuard). El dashboard es publicamente accesible via HTTPS (Caddy).

```mermaid
graph LR
    subgraph "VPS Honeypot"
        COW[:22 Cowrie]
        WEB[:80 web-honeypot]
        VEC[Vector]
    end

    subgraph VPN
        TUNNEL((VPN\nTailscale /\nWireGuard))
    end

    subgraph "Servidor App"
        API[ingest-api :3000]
        DB[(postgres)]
        RD[(redis)]
        DASH[dashboard :4000]
        CAD[Caddy :443]
    end

    INTERNET((Internet))

    COW --> VEC -->|POST via VPN| TUNNEL --> API
    WEB -->|POST via VPN| TUNNEL
    API --> DB
    API --> RD
    DASH --> DB
    API --> DASH --> CAD --> INTERNET
```

A diferencia de single-host y platform-only, `docker-compose.prod.app.yml` **no incluye Kafka, pgbouncer ni postgres-replica** — es un nivel de base de datos deliberadamente mas simple (Postgres directo, sin pooler ni replica de lectura), acorde a que esta topologia sirve a un unico cliente. `dashboard` tambien mantiene su propia conexion directa a Postgres (`DATABASE_URL`), ademas de consumir `ingest-api`. `redis` si esta presente, con la misma configuracion (`allkeys-lru`) que en las demas topologias.

Ver [Two-Host](/deployment/two-host/).

### Platform-only (servidor central + sensores remotos multi-cliente)

Un servidor central corre **solo la plataforma** (Postgres primary+replica,
pgbouncer, Redis, Kafka, ingest-api, dashboard) y **ningún honeypot**. Los
sensores viven en servidores separados — potencialmente uno por cliente —
cada uno con su propio `docker-compose.prod.honeypot.yml`, y llegan al
servidor central por internet a través de un **Cloudflare Tunnel** que expone
únicamente `ingest-api`, nunca la IP real del servidor.

```mermaid
graph TD
    subgraph "Servidor sensores — Cliente A"
        COWA[Cowrie :22]
        WEBA[web-honeypot :80]
        VECA[vector]
        COWA --> VECA
    end

    subgraph "Servidor sensores — Cliente B"
        COWB[Cowrie :22]
        VECB[vector]
        COWB --> VECB
    end

    CF{{Cloudflare Tunnel\ncloudflared\nhttps://ingest.tudominio.com}}

    subgraph "Servidor plataforma (sin sensores)"
        subgraph honeypot_ingest
            KAFKA[(Kafka KRaft)]
        end
        subgraph db_private
            API[ingest-api :3000\npublico via tunnel]
            PB[(pgbouncer)]
            DB[(postgres primary)]
            DBR[(postgres replica)]
            RD[(redis)]
        end
        subgraph app_api
            DASH[127.0.0.1:4000\ndashboard]
        end
        API --> PB --> DB
        DB -.replicacion WAL.-> DBR
        API --> RD
        API --> DASH
        VECA -.Kafka opcional.-> KAFKA --> API
    end

    VECA -->|POST via tunnel| CF --> API
    VECB -->|POST via tunnel| CF
    WEBA -->|POST via tunnel| CF

    ADMIN -->|SSH tunnel\n-L 4000:127.0.0.1:4000| DASH
```

Puntos clave:
- El servidor de plataforma **no tiene IP pública** — solo LAN/Tailscale.
  `cloudflared` corre como servicio systemd en el host (no en un contenedor) y
  expone únicamente `ingest-api:3000`, nunca `postgres` ni el `dashboard`.
- Cada servidor de sensores es independiente y puede pertenecer a un cliente
  distinto (`CLIENT_SLUG`), como en two-host — pero no requiere VPN: solo
  necesita alcanzar el hostname del tunnel por HTTPS.
- `ingest-api` corre con `trustProxy: 'loopback'` para leer la IP real del
  atacante desde `X-Forwarded-For` (sin esto, todo el tráfico tunelado se ve
  como `127.0.0.1`).
- El acceso a Postgres es igual que en single-host: **pgbouncer** en modo
  `transaction` delante del primary, y una **réplica de streaming** para las
  lecturas pesadas del dashboard (agregaciones de `credential_attempts`, etc.).
- Ver [Platform-only](/deployment/platform-only/) para la guía paso a paso,
  incluida la configuración del Cloudflare Tunnel.

---

## Flujo de datos detallado

### Pipeline SSH (Cowrie → Vector → Kafka → ingest-api)

Cowrie y Suricata son los dos sensores migrados a Kafka. Cada evento viaja
como **un mensaje individual** (Vector serializa uno por mensaje); el consumer
de `ingest-api` lo parsea y llama a la misma capa de servicio que usaban los
endpoints HTTP — sin duplicar lógica de risk-score, bot-detector, etc.

```mermaid
sequenceDiagram
    participant A as Atacante
    participant C as Cowrie
    participant V as Vector (cowrie.toml)
    participant K as Kafka\n(topic honeypot.cowrie)
    participant I as ingest-api\n(Kafka consumer, group: ingest-api)
    participant D as PostgreSQL

    A->>C: SSH connect (:22)
    C->>C: Simula shell Linux
    C-->>C: Escribe en cowrie.json
    V->>C: tail con offset persistente
    V->>V: Parse JSON
    V->>K: produce (1 mensaje = 1 evento)
    K->>I: consume (auto-commit offset)
    I->>I: risk-score engine\nbot-detector
    I->>D: INSERT sessions + events
```

### Pipeline Suricata (IDS → Vector → Kafka → ingest-api)

```mermaid
sequenceDiagram
    participant A as Atacante
    participant S as Suricata (IDS)
    participant V as Vector (suricata.toml)
    participant K as Kafka\n(topic honeypot.suricata)
    participant I as ingest-api\n(Kafka consumer)
    participant D as PostgreSQL

    A->>S: Trafico de red
    S->>S: Match contra reglas ET Open
    S-->>S: Escribe alerta en eve.json
    V->>S: tail eve.json
    V->>K: produce (1 mensaje = 1 alerta)
    K->>I: consume
    I->>I: Descarta ruido (SURICATA STREAM/FLOW)\ny filtra IPs propias
    I->>D: INSERT suricata_alerts
```

Ver [Suricata (IDS)](/intelligence/suricata/).

### Pipeline HTTP con buffer en disco (web/FTP/MySQL/port/SMB/Galah → ingest-api)

Estos sensores **aún no están en Kafka**. Escriben un log `events.json` que
Vector tailea y entrega por HTTP con **buffer en disco** — si `ingest-api` o
la red fallan, los eventos quedan en disco y se reenvían al recuperarse, en
vez de perderse como con el POST directo *fire-and-forget* anterior.

```mermaid
sequenceDiagram
    participant A as Atacante
    participant W as web-honeypot / FTP / MySQL / port / SMB
    participant V as Vector (buffer en disco)
    participant I as ingest-api
    participant D as PostgreSQL

    A->>W: Request (HTTP / FTP / MySQL / TCP / SMB)
    W-->>A: Respuesta falsa realista
    W-->>W: Escribe evento en events.json
    V->>W: tail events.json
    V->>I: POST /ingest/web/vector\no /ingest/protocol/event\n(batch, X-Ingest-Token)
    Note over V,I: Si el POST falla, el evento\nqueda en buffer y se reintenta
    I->>D: INSERT web_hits / protocol_hits\n(dedupe por eventId)
```

### Pipeline Dionaea → ingest-api

```mermaid
sequenceDiagram
    participant A as Atacante
    participant DI as Dionaea
    participant S as shipper.py
    participant I as ingest-api

    A->>DI: Conexion (FTP/SMB/MySQL...)
    DI-->>DI: Escribe en dionaea.json
    S->>DI: tail dionaea.json
    S->>I: POST /ingest/protocol/event\n(X-Ingest-Token)
    S->>I: POST /sensors/heartbeat\n(cada 30s)
```

### Sensor health monitoring

```mermaid
sequenceDiagram
    participant HB as heartbeat.py\n(sidecar)
    participant I as ingest-api
    participant D as PostgreSQL
    participant DASH as Dashboard /sensors

    loop cada 30s
        HB->>I: POST /sensors/heartbeat\n{sensorId, protocol, ports, ip}
        I->>D: UPSERT sensor + lastSeen
        I->>I: TCP probe en probePorts
        I-->>D: UPDATE online = true/false
    end
    DASH->>I: GET /sensors
    I->>DASH: [{id, name, protocol, online, lastSeen, eventCount}]
```

### Pipeline red de engaño (OpenCanary → ingest-api)

```mermaid
sequenceDiagram
    participant A as Atacante
    participant C as Cowrie (SSH)
    participant N as Nodo OpenCanary\n(fake-db, fake-cache...)
    participant I as ingest-api
    participant D as PostgreSQL

    A->>C: Login SSH exitoso
    A->>A: Lee /etc/hosts con IPs internas 10.0.1.x
    A->>N: Intenta moverse lateralmente (SSH/MySQL/SMB)
    N->>I: POST /ingest/protocol/event\n(data.source = opencanary)
    N->>I: POST /ingest/deception/portscan
    I->>D: INSERT protocol_hits + deception_portscans
    Note over I,D: La kill-chain correlaciona por session_id\no por IP interna + ventana temporal
```

Ver [Red de engaño](/intelligence/deception/).

### Multi-cliente y forwarding

```mermaid
sequenceDiagram
    participant Sensor as Sensor or shipper
    participant API as ingest-api
    participant DB as PostgreSQL
    participant ClientAPI as Client endpoint

    Sensor->>API: heartbeat with clientSlug
    API->>DB: upsert client
    API->>DB: upsert sensor -> client_id
    Sensor->>API: new event with sensorId
    API->>DB: insert local event
    API->>DB: lookup sensor -> client
    API->>ClientAPI: POST forwardUrl
```

---

## Redes Docker

### Single-host (`docker-compose.prod.single-host.yml`)

El compose real de single-host suma dos redes mas de las que documentabamos
antes: `deception_net` (para los honeypots internos de la red de engaño) y el
trafico de Kafka, que viaja dentro de `honeypot_ingest` junto al resto de la
ingesta.

```mermaid
graph TD
    subgraph edge
        COW[cowrie]
        WEB[web-honeypot]
        FTP[ftp-honeypot]
        MYSQLH[mysql-honeypot]
        PORTH[port-honeypot]
        SMBH[smb-honeypot]
        SURI[suricata]
    end
    subgraph deception_net["deception_net (10.0.1.0/24)"]
        DION[dionaea]
        DIONS[dionaea-shipper]
    end
    subgraph honeypot_ingest
        VEC[vector]
        KAFKA[(kafka)]
        API2[ingest-api]
    end
    subgraph app_api
        API3[ingest-api]
        DASH[dashboard]
    end
    subgraph db_private
        PB[(pgbouncer)]
        DB[(postgres primary)]
        DBR[(postgres replica)]
        RD[(redis)]
        API4[ingest-api]
        DASH2[dashboard]
    end

    VEC --> KAFKA --> API2
    DIONS -->|HTTP| API2
    API4 --> PB --> DB
    DB -.->|replicacion WAL| DBR
    API4 --> RD
```

| Red | Servicios | Proposito |
|-----|-----------|-----------|
| `edge` | cowrie, web-honeypot, ftp-honeypot, mysql-honeypot, port-honeypot, smb-honeypot, suricata | Servicios expuestos a internet |
| `deception_net` | dionaea, dionaea-shipper | Red interna aislada para el nodo de deception |
| `honeypot_ingest` | vector, kafka, kafka-init, ingest-api | Pipeline de ingesta (Kafka + HTTP con buffer) |
| `app_api` | ingest-api, dashboard | Comunicacion interna app |
| `db_private` | pgbouncer, postgres, postgres-replica, redis, ingest-api, dashboard | Acceso a base de datos y cache |

**Ningun honeypot tiene ruta directa a `db_private` ni a `app_api`.** Todo pasa por ingest-api.

### Platform-only (`docker-compose.prod.platform.yml`)

El servidor central **no corre ningun honeypot**, asi que no existe la red
`edge`. Las redes internas replican el mismo patron de single-host
(`honeypot_ingest` / `app_api` / `db_private`), pero quien alimenta
`honeypot_ingest` no es un Vector local sino el trafico HTTP que llega desde
los sensores remotos via Cloudflare Tunnel, terminando en `ingest-api:3000`.

| Red | Servicios | Proposito |
|-----|-----------|-----------|
| `honeypot_ingest` | kafka, kafka-init, ingest-api | Kafka queda disponible para topologias mixtas, pero hoy los sensores remotos entran por HTTP, no por Kafka |
| `app_api` | ingest-api, dashboard | Comunicacion interna app |
| `db_private` | pgbouncer, postgres, postgres-replica, redis, ingest-api, dashboard | Acceso a base de datos y cache (auth `scram-sha-256`, distinto del `md5` de single-host) |

### VPS honeypot (`docker-compose.prod.honeypot.yml`)

Una sola red `edge` con todos los servicios de captura (cowrie, web-honeypot,
ftp-honeypot, mysql-honeypot, port-honeypot, smb-honeypot, suricata, vector).
No tiene servicio Kafka local: Vector envia por HTTP hacia `INGEST_API_URL`,
que el operador configura segun la topologia (IP de VPN, hostname de
Cloudflare Tunnel, o `http://ingest-api:3000` si todo corre en el mismo host).

### Servidor app (`docker-compose.prod.app.yml`)

| Red | Servicios | Proposito |
|-----|-----------|-----------|
| `app_api` | ingest-api, dashboard | Comunicacion interna |
| `db_private` | postgres, redis, ingest-api, dashboard | Acceso a base de datos y cache |
| `caddy_net` | caddy, dashboard | Exposicion via HTTPS |

Sin `pgbouncer` ni `postgres-replica` — a diferencia de single-host y platform-only, aqui `ingest-api` y `dashboard` conectan directo a `postgres` (`DATABASE_URL` propia en cada servicio). No hay red `edge`: los honeypots corren en el otro host, via `docker-compose.prod.honeypot.yml`.

---

## Puertos expuestos

| Puerto | Servicio | Descripcion |
|--------|----------|-------------|
| `22` | Cowrie (prod) | SSH honeypot — los atacantes se conectan aqui |
| `80` | Caddy / web-honeypot | HTTP → HTTPS en two-host; honeypot en single-host |
| `443` | Caddy (two-host) | HTTPS dashboard e ingest-api |
| `21` | FTP honeypot | Puerto FTP en produccion |
| `3306` | MySQL honeypot | Puerto MySQL en produccion |
| `445` | SMB honeypot | Puerto SMB en produccion |
| `8022` | sshd admin VPS | Acceso SSH real al servidor |
| `2222` | Cowrie (dev) | SSH honeypot en entorno local |
| `8080` | web-honeypot / Galah (dev) | HTTP honeypot en entorno local |
| `127.0.0.1:4000` | dashboard (single-host / platform-only) | Solo loopback — requiere SSH tunnel |
| `3000` | ingest-api | Red interna en single-host/two-host; **publico** en platform-only, detras de Cloudflare Tunnel (sin puertos inbound abiertos en el firewall) |
| `5432` | PostgreSQL (primary) / postgres-replica | Solo red interna. Nunca publico. |
| `5432` | pgbouncer | Mismo puerto que Postgres, pero en el contenedor `pgbouncer` (`edoburu/pgbouncer`); ingest-api se conecta aqui con `?pgbouncer=true`. Solo red interna. Nunca publico. |
| `9092` / `9093` | Kafka (broker / controller KRaft) | Solo red interna (`honeypot_ingest`). Nunca publico. |
| `6379` | Redis | Solo red interna (`db_private`). Nunca publico. |

---

## Hardening de contenedores

Todos los servicios en produccion aplican:

```yaml
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
pids_limit: 256
```

Adicionalmente:
- `web-honeypot` usa `read_only: true` y corre con usuario sin privilegios
- `caddy` solo tiene `NET_BIND_SERVICE`
- `vector` corre con imagen Alpine minimal

---

## Autorizacion entre servicios

Los sensores (web-honeypot, Vector, Dionaea shipper, heartbeat.py) autorizan sus peticiones a ingest-api via el header `X-Ingest-Token`, cuyo valor es `INGEST_SHARED_SECRET`.

```mermaid
graph LR
    S1[Vector] -->|X-Ingest-Token| API
    S2[web-honeypot] -->|X-Ingest-Token| API
    S3[Dionaea shipper] -->|X-Ingest-Token| API
    S4[heartbeat.py] -->|X-Ingest-Token| API
    API -->|401 si no coincide| S1
```

Los endpoints `GET` de ingest-api no requieren autenticacion — estan protegidos por no ser alcanzables desde internet.
