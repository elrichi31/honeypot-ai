---
title: API Reference
description: Todos los endpoints de ingest-api con metodos, paths y descripcion.
---

import { Aside } from '@astrojs/starlight/components';

La ingest-api escucha en el puerto `3000`. En produccion solo es accesible desde la red interna Docker — no esta expuesta a internet.

<Aside>
Los endpoints `POST /ingest/*` requieren el header `X-Ingest-Token: <INGEST_SHARED_SECRET>` si la variable esta definida. Los endpoints `GET` no requieren autenticacion.
</Aside>

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

### `POST /ingest/cowrie/event`

Ingesta un evento Cowrie individual en formato JSON nativo de Cowrie.

**Headers:** `X-Ingest-Token: <secret>`

**Body:** objeto JSON con un evento Cowrie.

---

### `POST /ingest/cowrie/batch`

Ingesta un array de eventos Cowrie. El log-puller usa este endpoint.

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

## Sesiones SSH

### `GET /sessions`

Lista de sesiones con filtros opcionales.

**Query params:**

| Param | Tipo | Descripcion |
|-------|------|-------------|
| `page` | number | Numero de pagina (default: 1) |
| `limit` | number | Resultados por pagina (default: 20) |
| `loginSuccess` | boolean | Filtrar por login exitoso |
| `ip` | string | Filtrar por IP de origen |

---

### `GET /sessions/:id`

Detalle de una sesion con todos sus eventos ordenados por timestamp.

---

## Eventos

### `GET /events`

Lista de eventos con filtros opcionales.

**Query params:** `page`, `limit`, `sessionId`, `eventType`

---

## Web Hits

### `GET /web-hits`

Lista paginada de hits HTTP.

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

Hits agrupados por IP atacante con totales y tipos de ataque.

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
- Comandos clasificados por tipo
- Timeline de comandos SSH
- Historial de web hits

---

## Estadisticas

### `GET /stats/*`

Varios sub-endpoints para el overview y las graficas del dashboard:

| Path | Descripcion |
|------|-------------|
| `/stats/summary` | Totales globales (sesiones, eventos, IPs, logins) |
| `/stats/activity` | Timeline SSH + web por dia |
| `/stats/geo` | Conteo de sesiones por pais |
| `/stats/credentials` | Credenciales mas usadas |
| `/stats/campaigns` | Sesiones agrupadas por herramienta / campana |
