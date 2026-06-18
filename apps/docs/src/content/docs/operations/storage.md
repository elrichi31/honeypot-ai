---
title: Almacenamiento y retención
description: Uso de disco, tamaño de la base de datos por tabla y purga automática configurable.
---

import { Aside } from '@astrojs/starlight/components';

La página `/storage` muestra cuánto ocupa la plataforma y gestiona la **política de retención** que purga automáticamente los datos antiguos para que la base de datos no crezca sin límite.

- **Backend:** `apps/ingest-api/src/routes/storage.ts`.
- **Dashboard:** `/storage`.

---

## Qué muestra

- **Disco:** total, libre y usado del volumen.
- **Tamaño de la BD:** total y desglose por tabla.
- **Ingesta proyectada:** bytes ingeridos por fuente (ssh / web / protocol / defense) en el rango elegido.
- **Retención:** configuración por tabla con días, antigüedad del registro más viejo y filas pendientes de purgar.

---

## Retención automática

Un job programado recorre cada tabla con política activa y borra las filas más antiguas que su ventana de retención (`timestamp < NOW() - retention_days`). Cada ejecución queda registrada.

Tablas con política (por defecto **90 días** cada una):

`events` · `sessions` · `web_hits` · `protocol_hits` · `api_defense_events` · `suricata_alerts`

| Tabla | Contenido |
|-------|-----------|
| `retention_settings` | `table_name`, `retention_days`, `enabled` |
| `retention_runs` | `startedAt`, `finishedAt`, `rowsDeleted`, desglose por tabla, `ok`/`error` |

<Aside type="caution">
La purga es **irreversible**. Antes de bajar los días de retención de una tabla, ten en cuenta cuántas filas se borrarán en la próxima ejecución (la vista lo muestra).
</Aside>

---

## Endpoints

| Método | Path | Qué hace |
|--------|------|----------|
| `GET` | `/storage/stats` | Disco + tamaño de BD por tabla |
| `GET` | `/storage/ingestion` | Bytes ingeridos por fuente (`range`) |
| `GET` | `/storage/retention` | Política por tabla + última/próxima ejecución |
| `PUT` | `/storage/retention/:id` | Cambia `retentionDays` o `enabled` |

Ver [API Reference](/api-reference/#almacenamiento-y-retención).

---

## Relacionados

- [Monitoreo](/operations/monitoring/) — salud del servidor en tiempo real.
