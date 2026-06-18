---
title: Monitoreo
description: Salud del servidor — CPU, RAM, caché Redis y métricas por contenedor.
---

import { Aside } from '@astrojs/starlight/components';

La página `/monitoring` muestra la salud del servidor que aloja la plataforma: carga de CPU, memoria, estado de la caché Redis y consumo por contenedor, con histórico por rango.

- **Backend:** `apps/ingest-api/src/routes/monitoring.ts`.
- **Dashboard:** `/monitoring` (se refresca cada 60s).

---

## Métricas

| Métrica | Fuente |
|---------|--------|
| CPU load 1m / 5m / 15m | `/proc/loadavg` |
| RAM usada / total / % | `/proc/meminfo` (`MemTotal`, `MemAvailable`) |
| Uptime | `/proc/uptime` |
| Redis | `REDIS INFO`: versión, `keyspace_hits`/`misses`, hit rate, ops/seg, clientes conectados |
| Contenedores | `docker stats`: CPU % y memoria por contenedor |

---

## Endpoints

| Método | Path | Qué devuelve |
|--------|------|--------------|
| `GET` | `/monitoring/system` | Snapshot actual (CPU, RAM, uptime, Redis) |
| `GET` | `/monitoring/history` | Timeline de CPU y RAM (`range`: `24h`/`7d`/`30d`) |
| `GET` | `/monitoring/containers/stats` | Snapshot por contenedor |
| `GET` | `/monitoring/containers/history` | Timeline de los 6 contenedores más pesados |

Los snapshots se cachean ~30s y el histórico ~120s para no martillar el sistema.

---

## Tablas

| Tabla | Contenido |
|-------|-----------|
| `monitoring_snapshots` | `sampled_at`, `cpu_load_1m`, `ram_used_kb`, `ram_total_kb`, `ram_pct` |
| `container_snapshots` | `container`, `cpu_pct`, `mem_mb`, `sampled_at` |

<Aside type="note">
El histórico se agrega por intervalo según el rango (5m para 24h, 1h para 7d, 1d para 30d) para mantener las gráficas ligeras.
</Aside>

---

## Relacionados

- [Almacenamiento y retención](/operations/storage/) — uso de disco y tamaño de la BD.
- [API Reference](/api-reference/#monitoreo).
