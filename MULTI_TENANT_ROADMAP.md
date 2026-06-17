# Multi-Tenant — Roadmap to 100%

> Estado a jun 2026. Este documento describe **qué ya funciona** del multi-tenant y
> **qué falta** para que sea 100% (cada cliente/tenant ve SOLO sus datos en toda la app).
> El patrón ya está establecido y probado; lo que queda es replicarlo de forma mecánica.

---

## Concepto

- Un **cliente = un tenant**. Cada tenant tiene sus propios **sensores**; toda la telemetría
  (`sessions`, `web_hits`, `protocol_hits`, `events`…) lleva `sensor_id`.
- **Roles**: `viewer < analyst < admin < superadmin` (`apps/dashboard/lib/roles-shared.ts`).
  - `superadmin` → acceso global; puede "entrar" a un tenant con el selector del sidebar.
  - Cualquier otro rol → atado a su `user.clientId` (ve solo su tenant). Sin `clientId` y no
    superadmin → **no ve nada** (fail-closed).
- **Regla de oro de seguridad**: el `clientId`/scope efectivo se deriva del usuario **en el
  servidor**, NUNCA del query param o cookie crudos. El selector solo es un "request"; el
  enforcement lo decide `resolveScopeClientId`.

---

## ✅ YA FUNCIONA

### Identidad y modelo
- `user.clientId` (Better Auth `additionalFields` + columna idempotente en `migrate-auth.mjs`).
- Rol `superadmin`. Asignación de tenant/rol desde `/users`.
- `requireRole` expone `clientId` + `isSuperadmin` (`apps/dashboard/lib/roles.ts`).
- `resolveScopeClientId` (puro, testeado) en `apps/dashboard/lib/roles-shared.ts`.

### Selector de tenant (UI)
- `TenantSwitcher` en el sidebar (solo superadmin), guarda el tenant en la cookie `tenant_scope`.
- `TenantProvider` (`apps/dashboard/components/tenant-context.tsx`) + `effectiveScope`/
  `effectiveSensorScope` (`apps/dashboard/lib/tenant-scope.ts`).

### Vistas YA scopeadas (enforcement real por tenant)
- **Alertas** (`/alerts`): filtra por `clientId` (las alertas tienen columna `client_id`).
  Backend `apps/ingest-api/src/routes/alerts.ts`.
- **Dashboard home** (`/`): filtra por `sensorIds` del tenant. Endpoints scopeados:
  `honeypot-overview`, `kpi-trends`, `geo`, `cross-sensor-timeline`, `mitre-matrix`, `bot-ratio`,
  `dashboards` (todos en `apps/ingest-api/src/routes/stats/`).

### Infra de scoping (reusable, ya construida)
- Backend: `parseSensorScope(query)` en `apps/ingest-api/src/lib/sensor-scope.ts` →
  `{ all, cond('sensor_id'), cacheSuffix }`. `cond()` da `AND sensor_id IN (...)` / `AND false` /
  vacío. **Importante**: añadir `cacheSuffix` a la cache key de cada endpoint.
  Para `events` (sin `sensor_id`): scopear vía `session_id IN (SELECT id FROM sessions WHERE … sensor_id IN …)`.
- Front: `effectiveSensorScope()` (cacheado por request) → `sensorIds`; `sensorScopeParam()` en
  `apps/dashboard/lib/api/stats.ts` arma `?sensorIds=a,b` (`__none__` = fail-closed).

---

## ❌ LO QUE FALTA (para llegar a 100%)

### 1. Páginas de datos NO scopeadas (la mayor parte del trabajo)
Estas vistas hoy muestran datos **globales** sin importar el tenant seleccionado. Cada una usa
`fetch*` de `lib/api` que pega a su endpoint de backend. Hay que: (a) en la página, calcular
`effectiveSensorScope()` y pasar `sensorIds` al fetcher; (b) en `lib/api`, aceptar `sensorIds?` y
mandarlo; (c) en el endpoint backend, `parseSensorScope` + `cond('sensor_id')` + cache key por scope.

| Página (`app/…`) | Endpoint(s) backend (`src/routes/…`) | Notas |
|---|---|---|
| `sessions` | `sessions.ts` | Hoy usa `ClientSensorFilter` (filtro por query, no por cookie). Migrar a la cookie de tenant. |
| `threats` + `threats/[ip]` | `threats.ts` | `ClientSensorFilter` presente. La vista por IP también debe respetar scope. |
| `web-attacks` (+ `bursts`, `geo`, `paths`, `timeline`, `sessions`, `[ip]`) | `web.ts` | `ClientSensorFilter` en varias. |
| `credentials` | `stats/credentials.ts` | Usa la vista materializada `credential_attempts` (¿tiene sensor_id? verificar — si no, scopear desde tablas base). |
| `malware` | `malware.ts` | Artefactos tienen `srcIp`/`sensorId`. |
| `iocs` | reusa `threats` + `malware` | Se scopea solo cuando esos dos lo estén. |
| `commands` | `events.ts` / `stats` | `events` se scopea vía sesión. |
| `services` + `services/*` (ftp, mysql, mssql, smb, mqtt, ports) | `protocol.ts` | `protocol_hits` tiene `sensor_id` directo. |
| `deception` | `deception.ts` | Verificar relación con sensores del cliente. |
| `network`, `campaigns`, `live` | varios | `live` es websockets/SSE — scopear el stream. |
| `suricata` | `suricata.ts` | `suricata_alerts` tiene `sensor_id`. |
| `api-defense` | `api-defense.ts` | `api_defense_events` NO tiene sensor_id — decidir (¿es global?). |

### 2. Deuda pendiente del Dashboard home
- `/stats/novelty` (`stats/novelty.ts`) **no scopeado** — usa la vista materializada
  `credential_attempts` (sin `sensor_id`). Opciones: recalcular desde tablas base, o añadir
  `sensor_id` a la vista (migración).
- `AttackHeatmap` (componente client-fetched en el home) **no scopeado** — hace su propio fetch
  desde el cliente; hay que pasarle el scope o que su endpoint lo lea de la cookie.

### 3. Aislamiento de la gestión (no solo telemetría)
- **`/users`**: hoy un admin de tenant vería TODOS los usuarios de todos los clientes. Debe
  limitarse a los usuarios de su tenant (y no poder crear superadmins). superadmin ve todos.
- **`/sensors`** y **`/clients`**: un usuario de tenant no debería ver sensores/clientes de otros.
- **`/settings`**, **`/storage`**, **`/monitoring`**, **`/audit`**: decidir si son globales
  (solo superadmin) o por-tenant.

### 4. Vistas materializadas / rollups sin `sensor_id`
Tablas que agregan y **no** tienen `sensor_id` → no se pueden filtrar directo:
`threat_ip_summary`, `daily_summary`, `daily_attacker_stats`, `daily_credential_stats`,
`daily_command_stats`, `credential_attempts`. Para cada KPI que las use: recalcular desde tablas
base (más lento) **o** añadir `sensor_id`/`client_id` al rollup (migración + recálculo). Decidir
caso por caso.

### 5. SIEM / forwarding por tenant (verificar)
- Las alertas a CrowdStrike ya se enrutan por cliente (`resolveClientCrowdStrike`). Confirmar que
  el `forward_url` por cliente y cualquier otro egress respeten el tenant.

### 6. Endurecimiento / pruebas de seguridad
- Test automatizado por endpoint: un usuario de tenant A pidiendo datos de B (vía cookie/param
  manipulado) **nunca** recibe datos de B. Hoy verificado solo en alertas + overview.
- Idealmente un `/security-review` enfocado en aislamiento antes de dar acceso a clientes reales.

---

## Patrón a seguir (plantilla para cada página)

**Backend** (`src/routes/<x>.ts`):
```ts
import { parseSensorScope } from '../lib/sensor-scope.js'
fastify.get('/<x>', (request) => {
  const scope = parseSensorScope(request.query as Record<string, unknown>)
  return withCache(cache, `<x>:${scope.cacheSuffix}`, TTL, async () => {
    await prisma.$queryRaw`... WHERE ... ${scope.cond('sensor_id')} ...`
    // para events: ${scope.all ? Prisma.empty : Prisma.sql`AND session_id IN (SELECT id FROM sessions WHERE true ${scope.cond('sensor_id')})`}
  })
})
```

**Front lib/api** (`lib/api/<x>.ts`):
```ts
export async function fetchX(sensorIds?: string[]) {
  return apiFetch(`${getApiUrl()}/<x>?_=1${sensorScopeParam(sensorIds)}`)
}
```

**Página** (`app/<x>/page.tsx`, Server Component):
```ts
import { effectiveSensorScope } from "@/lib/tenant-scope"
const { sensorIds } = await effectiveSensorScope()
const data = await fetchX(sensorIds)
```

Para páginas con `ClientSensorFilter`: el filtro manual de query y el scope de tenant deben
combinarse (el scope del tenant es el límite duro; el filtro de sensor solo puede estrechar
DENTRO de los sensores del tenant — nunca ampliar).

---

## Orden sugerido
1. Sessions, Threats, Web-attacks (las más usadas para investigar).
2. Services/protocolos, Credentials, Malware, IoCs, Commands.
3. Deuda del home (novelty, heatmap).
4. Aislamiento de gestión (/users, /sensors, /clients).
5. Rollups sin sensor_id (solo los KPIs que falten).
6. Tests de aislamiento + security review.

## Verificación (cada página)
- Local: superadmin + DB `honeypot_full` (4 clientes con sensores distintos). Seleccionar un
  tenant → la página muestra solo sus datos; "Global" → todo. Datos de referencia por cliente:
  - Cooperativa Pastaza → protocol ~1.03M, ssh 0, web 0
  - Saludsa → web ~5.5k, resto 0
  - Test Client → ssh ~120k, resto ~0
  - Decption Client → casi 0
- Como usuario de tenant (no superadmin): sin selector, siempre su cliente; manipular la cookie
  NO debe darle otro tenant.
- `tsc --noEmit` 0 errores; `vitest` backend verde.

## Deploy (recordatorio)
Cambios que tocan **backend** requieren rebuild de `ingest-api`; los de **front**, de `dashboard`.
Ante la duda, ambos:
```bash
docker compose -f docker-compose.prod.single-host.yml build --no-cache dashboard ingest-api
docker compose -f docker-compose.prod.single-host.yml up -d dashboard ingest-api
```
Verificar que el backend nuevo entró: `docker exec ingest-api ls dist/lib/sensor-scope.js`.
