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
        G[Galah\nHTTP+AI :8080]
        D[Dionaea\nFTP/SMB/MySQL/MSSQL\nRPC/TFTP/MQTT/PPTP]
        FTP[FTP Honeypot :21]
        SQL[MySQL Honeypot :3306]
        PORT[Port Honeypot]
    end

    subgraph Shippers
        VC[Vector\ncowrie.toml]
        VG[Vector\ngalah.toml]
        DS[Dionaea Shipper\nshipper.py]
        HB[heartbeat.py\nsidecar beacon]
    end

    subgraph Plataforma
        API[ingest-api :3000\nFastify + TypeScript]
        DB[(PostgreSQL)]
        DASH[Dashboard :4000\nNext.js 16]
        DISC[Discord]
    end

    C -->|cowrie.json| VC
    G -->|galah.json| VG
    D --> DS
    W -->|POST /ingest/web/event| API
    FTP -->|POST /ingest/protocol/event| API
    SQL -->|POST /ingest/protocol/event| API
    PORT -->|POST /ingest/protocol/event| API
    VC -->|POST /ingest/cowrie/vector| API
    VG -->|POST /ingest/web/vector| API
    DS -->|POST /ingest/protocol/event| API
    HB -->|POST /sensors/heartbeat cada 30s| API
    API --> DB
    DB --> DASH
    API -->|alertas de amenazas| DISC
```

---

## Topologias de despliegue

La plataforma soporta cuatro configuraciones. Elige segun tu presupuesto y necesidades de aislamiento.

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
        DASH[dashboard :4000]
        VEC[vector]
    end

    C22 --> VEC --> API --> DB --> DASH
    W80 --> API
    G8080 --> VEC
```

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

Todo en el mismo servidor con redes Docker separadas. El dashboard solo es accesible por SSH tunnel — no expuesto a internet.

```mermaid
graph LR
    subgraph "VPS Publico"
        direction TB
        subgraph edge
            COW[:22 Cowrie]
            WEB[:80 web-honeypot]
        end
        subgraph interna
            API[ingest-api]
            DB[(postgres)]
            DASH[127.0.0.1:4000\ndashboard]
        end
        VEC[vector] --> API
        COW --> VEC
        WEB --> API
        API --> DB --> DASH
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
        DASH[dashboard :4000]
        CAD[Caddy :443]
    end

    INTERNET((Internet))

    COW --> VEC -->|POST via VPN| TUNNEL --> API
    WEB -->|POST via VPN| TUNNEL
    API --> DB --> DASH --> CAD --> INTERNET
```

Ver [Two-Host](/deployment/two-host/).

---

## Flujo de datos detallado

### Pipeline SSH (Cowrie → ingest-api)

```mermaid
sequenceDiagram
    participant A as Atacante
    participant C as Cowrie
    participant V as Vector
    participant I as ingest-api
    participant D as PostgreSQL

    A->>C: SSH connect (:22)
    C->>C: Simula shell Linux
    C-->>C: Escribe en cowrie.json
    V->>C: tail con offset persistente
    V->>V: Parse JSON + batch (100 eventos / 2s)
    V->>I: POST /ingest/cowrie/vector\n(X-Ingest-Token)
    I->>I: risk-score engine\nbot-detector
    I->>D: INSERT sessions + events
```

### Pipeline HTTP (web-honeypot / Galah → ingest-api)

```mermaid
sequenceDiagram
    participant A as Atacante
    participant W as web-honeypot / Galah
    participant V as Vector (galah)
    participant I as ingest-api
    participant D as PostgreSQL

    A->>W: HTTP request
    W-->>A: Respuesta falsa realista
    W->>I: POST /ingest/web/event\n(web-honeypot directo)
    Note over V,I: Galah usa Vector como shipper
    V->>I: POST /ingest/web/vector\n(galah.toml)
    I->>D: INSERT web_hits
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

```mermaid
graph TD
    subgraph edge
        COW[cowrie]
        WEB[web-honeypot]
    end
    subgraph honeypot_ingest
        WEB2[web-honeypot]
        VEC[vector]
        API2[ingest-api]
    end
    subgraph app_api
        API3[ingest-api]
        DASH[dashboard]
    end
    subgraph db_private
        DB[(postgres)]
        API4[ingest-api]
        DASH2[dashboard]
    end
```

| Red | Servicios | Proposito |
|-----|-----------|-----------|
| `edge` | cowrie, web-honeypot | Solo los servicios expuestos a internet |
| `honeypot_ingest` | web-honeypot, vector, ingest-api | Pipeline de ingesta |
| `app_api` | ingest-api, dashboard | Comunicacion interna app |
| `db_private` | postgres, ingest-api, dashboard | Acceso a base de datos |

**Cowrie no tiene ruta a postgres, ingest-api ni al dashboard.**

### VPS honeypot (`docker-compose.prod.honeypot.yml`)

Una sola red `edge` con todos los servicios de captura: cowrie, web-honeypot, vector. Vector alcanza ingest-api exclusivamente via VPN.

### Servidor app (`docker-compose.prod.app.yml`)

| Red | Servicios | Proposito |
|-----|-----------|-----------|
| `app_api` | ingest-api, dashboard | Comunicacion interna |
| `db_private` | postgres, ingest-api, dashboard | Acceso a base de datos |
| `caddy_net` | caddy, dashboard | Exposicion via HTTPS |

---

## Puertos expuestos

| Puerto | Servicio | Descripcion |
|--------|----------|-------------|
| `22` | Cowrie (prod) | SSH honeypot — los atacantes se conectan aqui |
| `80` | Caddy / web-honeypot | HTTP → HTTPS en two-host; honeypot en single-host |
| `443` | Caddy (two-host) | HTTPS dashboard e ingest-api |
| `21` | FTP honeypot | Puerto FTP en produccion |
| `3306` | MySQL honeypot | Puerto MySQL en produccion |
| `8022` | sshd admin VPS | Acceso SSH real al servidor |
| `2222` | Cowrie (dev) | SSH honeypot en entorno local |
| `8080` | web-honeypot / Galah (dev) | HTTP honeypot en entorno local |
| `127.0.0.1:4000` | dashboard (single-host) | Solo loopback — requiere SSH tunnel |
| `3000` | ingest-api | Solo red interna / VPN. Nunca publico en prod. |
| `5432` | PostgreSQL | Solo red interna. Nunca publico. |

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
