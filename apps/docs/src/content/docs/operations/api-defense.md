---
title: Defensa de la API
description: Visibilidad y bloqueo de ataques contra la propia ingest-api, con allowlist y blocklist.
---

import { Aside } from '@astrojs/starlight/components';

Además de los honeypots, la **propia ingest-api** recibe escaneos y ataques. La sección `/api-defense` da visibilidad de ese tráfico y permite bloquear IPs, manteniendo una allowlist de orígenes confiables.

- **Backend:** `apps/ingest-api/src/routes/api-defense.ts`.
- **Dashboard:** `/api-defense`.

---

## Tipos de ataque detectados

| Tipo | Qué es |
|------|--------|
| `scanner` | Muchos paths distintos en poco tiempo |
| `path_probe` | Paths sospechosos conocidos |
| `injection` | Intentos de inyección (SQL, comandos, etc.) |
| `brute_force` | Muchos intentos fallidos seguidos |

---

## Allowlist y blocklist

- **Allowlist** (`defense_allowlist`): IPs o rangos **CIDR** confiables que nunca se bloquean. Se valida el formato CIDR (incluye RFC1918 y loopback).
- **Blocklist** (`blocked_ips`): IPs bloqueadas, ya sea **automáticamente** (`auto_blocked = true`) por su comportamiento, o **manualmente** desde la interfaz (con un motivo). Ambas se respetan al ingerir.

---

## Endpoints

| Método | Path | Qué hace |
|--------|------|----------|
| `GET` | `/api-defense/events` | Eventos de ataque paginados (`attackType`, `ip`) |
| `GET` | `/api-defense/summary` | Stats de hoy: conteo por tipo, top IPs, total |
| `GET` `POST` `DELETE` | `/api-defense/allowlist[/:id]` | Gestiona la allowlist |
| `GET` `POST` `DELETE` | `/api-defense/blocked[/:id]` | Gestiona la blocklist |

Ver [API Reference](/api-reference/#defensa-de-la-api).

---

## Tablas

| Tabla | Contenido |
|-------|-----------|
| `api_defense_events` | `src_ip`, `method`, `path`, `user_agent`, `attack_type`, `status_code`, `timestamp` |
| `defense_allowlist` | `entry` (CIDR), `label` |
| `blocked_ips` | `ip`, `reason`, `auto_blocked`, `blocked_at` |

<Aside type="tip">
Añade a la allowlist las IPs de tus propios sensores remotos y de tu VPN antes de activar el bloqueo automático, para no auto-bloquearte.
</Aside>

---

## Relacionados

- [Seguridad](/security/) — postura de seguridad del despliegue.
- [Ingest API](/services/ingest-api/) — el servicio que se está protegiendo.
