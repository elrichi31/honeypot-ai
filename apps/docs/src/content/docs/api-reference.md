---
title: API Reference
description: Todos los endpoints de ingest-api con metodos, paths, parametros y ejemplos.
---

import { Aside } from '@astrojs/starlight/components';

La ingest-api escucha en el puerto `3000`. En produccion solo es accesible desde la red interna Docker o via VPN — no esta expuesta a internet.

<Aside>
Los endpoints `POST /ingest/*` y `POST /sensors/*` requieren el header `X-Ingest-Token: <INGEST_SHARED_SECRET>` si la variable esta definida. Los endpoints `GET` no requieren autenticacion.
</Aside>

---

## Mapa de endpoints

```mermaid
graph LR
    subgraph Ingesta
        I1[POST /ingest/cowrie/vector]
        I2[POST /ingest/cowrie/event]
        I3[POST /ingest/cowrie/batch]
        I4[POST /ingest/web/event]
        I5[POST /ingest/web/vector]
        I6[POST /ingest/protocol/event]
    end
    subgraph Sensores
        S1[POST /sensors/heartbeat]
        S2[GET /sensors]
    end
    subgraph Consultas
        Q1[GET /sessions]
        Q2[GET /threats]
        Q3[GET /web-hits]
        Q4[GET /stats/*]
        Q5[GET /attacks/today]
    end
```

---

## Health

### `GET /health`

Estado de la API y timestamp del ultimo evento recibido.

**Respuesta:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "lastEvent": "2024-01-15T10:29:55.000Z"
}
```

---

## Ingesta SSH (Cowrie)

### `POST /ingest/cowrie/vector`

Endpoint principal de ingesta SSH. Usado por **Vector** (log shipper). Acepta un array JSON de eventos Cowrie en formato nativo — el mismo que escribe Cowrie en `cowrie.json`.

**Headers:** `X-Ingest-Token: <secret>`, `Content-Type: application/json`

**Body:** array de 1 a 1000 eventos Cowrie.

```json
[
  {
    "eventid": "cowrie.session.connect",
    "src_ip": "1.2.3.4",
    "src_port": 54321,
    "session": "abc123",
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  {
    "eventid": "cowrie.login.failed",
    "username": "admin",
    "password": "123456",
    "session": "abc123",
    "timestamp": "2024-01-15T10:30:01.000Z"
  }
]
```

**Respuesta:**
```json
{
  "total": 2,
  "inserted": 2,
  "duplicates": 0,
  "sessionsCreated": 1,
  "errors": 0
}
```

---

### `POST /ingest/cowrie/event`

Ingesta un evento Cowrie individual.

**Headers:** `X-Ingest-Token: <secret>`

**Body:** objeto JSON con un evento Cowrie.

---

### `POST /ingest/cowrie/batch`

Ingesta un array de eventos Cowrie. Mismo formato que `/ingest/cowrie/vector`.

**Headers:** `X-Ingest-Token: <secret>`

**Body:**
```json
[
  { "eventid": "cowrie.session.connect", "src_ip": "1.2.3.4", ... },
  { "eventid": "cowrie.login.failed", "username": "admin", ... }
]
```

---

### `POST /ingest/cowrie/file`

Sube un archivo `cowrie.json` completo (una linea JSON por evento).

**Headers:** `X-Ingest-Token: <secret>`, `Content-Type: multipart/form-data`

---

## Ingesta Web

### `POST /ingest/web/vector`

Ingesta batch de hits HTTP enviados por **Vector** (galah.toml). Acepta el mismo schema que `/ingest/web/event` pero en array, procesado tras la transformacion de Vector.

**Headers:** `X-Ingest-Token: <secret>`, `Content-Type: application/json`

---

### `POST /ingest/web/event`

Ingesta un hit HTTP del web honeypot.

**Headers:** `X-Ingest-Token: <secret>`

**Body:**
```json
{
  "ip": "1.2.3.4",
  "method": "GET",
  "path": "/wp-login.php",
  "query": "",
  "userAgent": "sqlmap/1.7",
  "statusCode": 200,
  "attackType": "scanner",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Ingesta de protocolos de red

### `POST /ingest/protocol/event`

Ingesta un evento de protocolo de red (FTP, MySQL, SMB, port scan, etc.). Usado por ftp-honeypot, mysql-honeypot, port-honeypot y el shipper de Dionaea.

**Headers:** `X-Ingest-Token: <secret>`

**Body:**
```json
{
  "sensorId": "dionaea-sensor-01",
  "protocol": "smb",
  "srcIp": "1.2.3.4",
  "srcPort": 54321,
  "dstPort": 445,
  "eventType": "connect",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {}
}
```

---

## Sensores

### `POST /sensors/heartbeat`

Registra o actualiza un sensor. Llamado por `heartbeat.py` cada 30 segundos desde cada sensor activo.

**Headers:** `X-Ingest-Token: <secret>`

**Body:**
```json
{
  "sensorId": "cowrie-ssh-prod-01",
  "name": "SSH Honeypot (Cowrie) - VPS Berlin",
  "protocol": "ssh",
  "ip": "1.2.3.4",
  "version": "cowrie",
  "ports": [22],
  "probePorts": [22],
  "host": "cowrie"
}
```

**Respuesta:**
```json
{ "ok": true }
```

---

### `GET /sensors`

Lista todos los sensores registrados con su estado online/offline y contador de eventos.

**Respuesta:**
```json
[
  {
    "id": "cowrie-ssh-prod-01",
    "name": "SSH Honeypot (Cowrie) - VPS Berlin",
    "protocol": "ssh",
    "ip": "1.2.3.4",
    "version": "cowrie",
    "ports": [22],
    "online": true,
    "lastSeen": "2024-01-15T10:29:45.000Z",
    "eventCount": 1543
  }
]
```

---

## Sesiones SSH

### `GET /sessions`

Lista paginada de sesiones SSH.

**Query params:**

| Param | Tipo | Default | Descripcion |
|-------|------|---------|-------------|
| `page` | number | 1 | Numero de pagina |
| `limit` | number | 20 | Resultados por pagina (max 100) |
| `loginSuccess` | boolean | — | Filtrar por login exitoso |
| `ip` | string | — | Filtrar por IP de origen |

**Respuesta:**
```json
{
  "data": [...],
  "meta": { "page": 1, "limit": 20, "total": 1543, "totalPages": 78 }
}
```

---

### `GET /sessions/:id`

Detalle de una sesion con todos sus eventos ordenados por timestamp.

---

### `GET /sessions/scan-groups`

Sesiones agrupadas por campana de ataque (misma IP, patron de comandos similares).

**Query params:** `page`, `limit`

---

## Eventos

### `GET /events`

Lista paginada de eventos SSH individuales.

**Query params:** `page`, `limit`, `sessionId`, `eventType`

---

## Web Hits

### `GET /web-hits`

Lista paginada de hits HTTP al honeypot web.

**Query params:** `page`, `limit`, `ip`, `attackType`, `path`

---

### `GET /web-hits/stats`

Total de hits, distribucion por tipo de ataque y top IPs atacantes.

---

### `GET /web-hits/timeline`

Hits agrupados por dia y tipo de ataque (ultimos 30 dias).

---

### `GET /web-hits/paths`

Top 50 paths mas atacados con conteo y tipos detectados.

---

### `GET /web-hits/by-ip`

Hits agrupados por IP atacante con totales y tipos de ataque. Soporta paginacion.

**Query params:** `page`, `limit`

---

## Threat Intelligence

### `GET /threats`

Todas las IPs con risk score, ordenadas por score DESC.

**Respuesta:**
```json
[
  {
    "ip": "1.2.3.4",
    "score": 87,
    "level": "CRITICAL",
    "protocols": ["ssh", "http"],
    "topFactors": ["malware_drop", "persistence"]
  }
]
```

---

### `GET /threats/:ip`

Detalle completo de una IP:

- Score breakdown por categoria (SSH, web, comandos, cross-protocol)
- Clasificacion de comandos por tipo (recon, persistence, malware, etc.)
- Timeline de actividad SSH y web
- Historial de web hits

---

## Estadisticas y Dashboard

### `GET /stats/overview`

Timeline de sesiones SSH y web hits por dia. Usado por la grafica principal del overview.

**Query params:** `from` (ISO date), `to` (ISO date)

---

### `GET /stats/dashboards`

Metricas agregadas para el dashboard: totales, funnel de autenticacion, top IPs, top paises, top comandos y distribucion de tipos de sesion.

---

### `GET /stats/credentials`

Credenciales mas usadas: top usernames, top passwords y top pares username+password.

**Query params:** `limit` (default: 20)

---

### `GET /stats/geo`

Conteo de sesiones y eventos por pais de origen (basado en geolocalizacion de IP).

---

### `GET /stats/heatmap`

Conteo de ataques por dia de semana y hora del dia — matriz 7x24 para el heatmap del dashboard.

---

### `GET /stats/session-commands`

Comandos ejecutados en sesiones SSH, agrupados por tipo y frecuencia.

---

## Ataques del dia

### `GET /attacks/today`

Total de ataques (sesiones SSH + web hits + protocol hits) en las ultimas 24 horas.

**Respuesta:**
```json
{
  "total": 342,
  "ssh": 120,
  "web": 198,
  "protocol": 24,
  "from": "2024-01-14T10:30:00.000Z",
  "to": "2024-01-15T10:30:00.000Z"
}
```
