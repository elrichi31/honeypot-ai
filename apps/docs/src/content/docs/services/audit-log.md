---
title: Audit Log (Control de Cambios)
description: Registro de todas las acciones realizadas en el dashboard — quien creo, modifico o elimino que y cuando.
---

import { Aside } from '@astrojs/starlight/components';

El audit log es un registro inmutable de todas las acciones que los usuarios realizan en la plataforma. Permite saber quien hizo que, en que momento y desde que IP — sin depender de memory o de preguntar al equipo.

---

## Que se registra

Cada entrada del audit log captura:

| Campo | Descripcion |
|-------|-------------|
| `userId` | ID del usuario que realizo la accion |
| `userEmail` | Email del usuario (desnormalizado para lectura directa) |
| `userName` | Nombre del usuario |
| `action` | Tipo de accion (`CREATE`, `UPDATE`, `DELETE`, `DOWNLOAD`, `LOGIN`, `LOGOUT`) |
| `resource` | Tipo de recurso afectado (`USER`, `CLIENT`, `SENSOR`, `TOKEN`, etc.) |
| `resourceId` | ID del recurso afectado |
| `resourceName` | Nombre legible del recurso (ej: email del usuario, nombre del cliente) |
| `details` | JSON con contexto adicional de la accion |
| `ipAddress` | IP desde donde se realizo la accion |
| `userAgent` | Navegador/cliente HTTP del actor |
| `createdAt` | Timestamp exacto de la accion |

---

## Acciones auditadas

### Sesion (Login / Logout)

| Accion | Cuando ocurre | Datos adicionales |
|--------|--------------|-------------------|
| `LOGIN USER` | Un usuario inicia sesion | IP, pais, ciudad, region, timezone, user-agent |
| `LOGOUT USER` | Un usuario cierra sesion | IP, pais, ciudad |

El pais y la ciudad se resuelven offline con **geoip-lite** — sin llamadas externas. Aparecen en la columna **Detalle** de la tabla y en el JSON expandible.

### Usuarios

| Accion | Cuando ocurre |
|--------|--------------|
| `CREATE USER` | Se crea un nuevo usuario desde `/users` |
| `DELETE USER` | Se elimina un usuario |
| `UPDATE USER` | Se actualiza el nombre de un usuario |

### Clientes

| Accion | Cuando ocurre |
|--------|--------------|
| `CREATE CLIENT` | Se crea un cliente desde `/clients` |
| `UPDATE CLIENT` | Se edita nombre, descripcion o forwardUrl de un cliente |
| `DELETE CLIENT` | Se elimina un cliente |

### Sensores

| Accion | Cuando ocurre |
|--------|--------------|
| `DELETE SENSOR` | Se elimina un sensor desde `/sensors` |
| `UPDATE SENSOR` | Se asigna o desasigna un sensor a un cliente |
| `DOWNLOAD SENSOR` | Se descarga el `.env` de configuracion de un sensor |
| `DOWNLOAD SENSOR` | Se descarga el `docker-compose.sensor.yml` |
| `DOWNLOAD SENSOR` | Se descarga el script `install-sensor.sh` |

### Tokens de provision

| Accion | Cuando ocurre |
|--------|--------------|
| `CREATE TOKEN` | Se genera un token de provision para desplegar un sensor |

### Configuracion

| Accion | Cuando ocurre |
|--------|--------------|
| `UPDATE SETTINGS` | Se guarda cualquier cambio en `/settings` (Discord, OpenAI, timezone, IPs, etc.) |

---

## Donde se almacena

El audit log se guarda en la tabla `audit_log` de PostgreSQL, creada automaticamente al iniciar el contenedor. La tabla es independiente de las tablas de Cowrie/web-attacks/protocol — no tiene impacto en el rendimiento de ingesta.

```mermaid
graph LR
    USER[Usuario en dashboard] --> API[API route /api/*]
    API --> ACTION[Accion principal\ncliente, sensor, etc.]
    API --> AUDIT[logAudit\nlib/audit.ts]
    AUDIT --> PG[(audit_log\nPostgreSQL)]
    DASH[/audit page] --> AUDITAPI[GET /api/audit]
    AUDITAPI --> PG
```

<Aside type="note">
El audit log usa `try/catch` interno: si falla al escribir (ej. por un error de conexion transitorio), la accion principal **no** se revierte. El registro de auditoria es no-critico — nunca bloquea la operacion real.
</Aside>

---

## Vista en el dashboard (`/audit`)

La pagina `/audit` muestra el historial completo de eventos en una tabla paginada.

### Columnas

| Columna | Descripcion |
|---------|-------------|
| **Fecha** | Dia, hora, minuto y segundo de la accion |
| **Usuario** | Nombre y email del actor |
| **Accion** | Badge de color por tipo (`Creacion`, `Actualizacion`, `Eliminacion`, etc.) |
| **Recurso** | Badge por tipo de recurso (`Usuario`, `Cliente`, `Sensor`, `Token`, etc.) |
| **Detalle** | Nombre del recurso afectado. Click en la fila para expandir el JSON completo |
| **IP** | Direccion IP del actor |

### Filtros disponibles

- **Por accion**: Creacion, Actualizacion, Eliminacion, Descarga, Inicio de sesion, Cierre de sesion.
- **Por recurso**: Usuario, Cliente, Sensor, Token, Malware, Configuracion, Sesion.
- Los filtros se pueden combinar. El boton **Limpiar** resetea ambos.

### Paginacion

50 entradas por pagina, navegacion con flechas. El total de registros se muestra junto al contador de eventos.

### Expansion de detalles

Al hacer clic en una fila que tenga contexto adicional, se expande una seccion con el JSON crudo del campo `details` y el `User-Agent` del actor:

```json
{
  "name": "Cliente Nuevo",
  "slug": "cliente-nuevo",
  "description": "SOC retail"
}
```

---

## API

### `GET /api/audit`

Lista paginada del audit log. Requiere sesion activa.

**Query params:**

| Param | Tipo | Descripcion |
|-------|------|-------------|
| `page` | number | Numero de pagina (default: 1) |
| `limit` | number | Resultados por pagina, max 100 (default: 50) |
| `action` | string | Filtrar por accion (`CREATE`, `UPDATE`, `DELETE`, etc.) |
| `resource` | string | Filtrar por recurso (`USER`, `CLIENT`, `SENSOR`, etc.) |
| `userId` | string | Filtrar por ID de usuario especifico |

**Ejemplo:**

```http
GET /api/audit?action=DELETE&resource=SENSOR&page=1
Cookie: better-auth.session_token=<tu-sesion>
```

**Respuesta:**

```json
{
  "entries": [
    {
      "id": "a1b2c3d4-...",
      "userId": "usr_abc123",
      "userEmail": "nicolas@empresa.com",
      "userName": "Nicolas Moina",
      "action": "DELETE",
      "resource": "SENSOR",
      "resourceId": "cowrie-ssh-prod-01",
      "resourceName": "cowrie-ssh-prod-01",
      "details": {},
      "ipAddress": "192.168.1.10",
      "userAgent": "Mozilla/5.0 ...",
      "createdAt": "2026-05-17T14:23:11.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50,
  "pages": 1
}
```

---

## Esquema de la tabla

```sql
CREATE TABLE "audit_log" (
  "id"           TEXT        NOT NULL PRIMARY KEY,
  "userId"       TEXT        NOT NULL,
  "userEmail"    TEXT        NOT NULL,
  "userName"     TEXT        NOT NULL DEFAULT '',
  "action"       TEXT        NOT NULL,
  "resource"     TEXT        NOT NULL,
  "resourceId"   TEXT,
  "resourceName" TEXT,
  "details"      JSONB       NOT NULL DEFAULT '{}',
  "ipAddress"    TEXT,
  "userAgent"    TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Indices creados automaticamente en `userId`, `resource`, `action` y `createdAt DESC` para consultas eficientes en la vista del dashboard.

---

## Como extender el audit log

Para agregar auditoria a una nueva ruta del dashboard, importa `logAudit` desde `lib/audit.ts`:

```typescript
import { logAudit } from "@/lib/audit"

// Dentro de un API route handler:
await logAudit({
  action: "CREATE",        // AuditAction
  resource: "CLIENT",      // AuditResource
  resourceId: client.id,
  resourceName: client.name,
  details: { name: client.name, slug: client.slug },
  request: req,            // NextRequest — para extraer IP y User-Agent
})
```

`logAudit` resuelve la sesion activa automaticamente a partir del header `Cookie` del request. No es necesario pasar el usuario manualmente.

**Tipos disponibles:**

```typescript
type AuditAction   = "CREATE" | "UPDATE" | "DELETE" | "DOWNLOAD" | "LOGIN" | "LOGOUT"
type AuditResource = "USER" | "CLIENT" | "SENSOR" | "TOKEN" | "MALWARE" | "SETTINGS" | "SESSION"
```

Para agregar nuevos tipos, edita el union type en `apps/dashboard/lib/audit.ts`.

---

## Retencion de datos

No hay politica de borrado automatico — los registros se acumulan indefinidamente. En despliegues de larga duracion, considera crear un job de limpieza si el volumen de la tabla crece mas alla de lo esperado:

```sql
-- Ejemplo: borrar registros de mas de 1 ano
DELETE FROM audit_log WHERE "createdAt" < now() - interval '1 year';
```
