# Multi-Tenant — Roadmap to 100%

> Estado a **jul 2026**. Este documento describe **qué ya funciona** del multi-tenant y
> **qué falta** para que sea 100% (cada cliente/tenant ve SOLO sus datos en toda la app).
> El patrón ya está establecido y probado; lo que queda es replicarlo de forma mecánica.
>
> **Nota estructural (jul 2026):** el backend ya NO vive en `src/routes/*.ts`. Está en
> `apps/ingest-api/src/modules/<domain>/<domain>.{controller,service,repository}.ts`
> (ver [backend-layering](../project-notes/backend-layering.md)). Los ejemplos de rutas
> abajo se actualizaron a esa estructura.

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
  Backend `apps/ingest-api/src/modules/alerts/`. Front vía `effectiveScope`.
- **Dashboard home** (`/`): filtra por `sensorIds` del tenant. Endpoints scopeados en
  `apps/ingest-api/src/modules/stats/controllers/`: `dashboard`, `kpi-trends`, `mitre-matrix`,
  `bot-ratio`, `misc` (geo, cross-sensor-timeline, honeypot-overview).
- **Novelty** (home): ✅ hecho — `stats/controllers/novelty.ts` usa `parseSensorScope`
  (era deuda #2). Front: `app/api/stats/novelty/route.ts` re-deriva el scope server-side.
- **AttackHeatmap** (home): ✅ hecho — `app/api/stats/heatmap/route.ts` usa `effectiveSensorScope`
  (era deuda #2).
- **Reports** (`/reports`): ✅ `app/reports/page.tsx` usa `effectiveSensorScope`. Solo on-demand
  (no hay jobs agendados que hagan egress sin cookie — si se agregan, resolver scope desde el
  registro del cliente, no de la cookie).
- **Services / protocolos** (`/services`, `/services/{ftp,mysql,mssql,smb,mqtt,ports}`): ✅ hecho
  (jul 2026). Backend `modules/protocol/` scopea `list`, `count`, `insights`, `stats`, `ports/stats`
  con `parseSensorScope` + `scope.cond('sensor_id')` y `cacheSuffix` en cada key. Front:
  `fetchProtocolStats/TargetPortStats/Insights/Hits` aceptan `sensorIds?`; `app/services/page.tsx`
  y `protocol-service-page.tsx` los derivan con `effectiveSensorScope`. Todos los consumers son
  server components (la tabla pagina por searchParams, no hace fetch client-side).
- **Sessions** (`/sessions`, `/sessions/[id]`, `/sessions/scan-groups`): ✅ hecho (jul 2026).
  Ya tenía el filtro manual `ClientSensorFilter` (`clientSlug`/`sensorId`) — se **unificó** con el
  techo de tenant vía el nuevo helper `narrowToTenant(tenant, manual)` en `lib/sensor-scope.ts`
  (el filtro manual solo puede estrechar DENTRO de los sensores del tenant; nunca amplía). El
  detail `getById` es fail-closed: un tenant no puede leer una sesión de otro sensor aunque sepa el
  id. Front: `fetchSessionsPage/ScanGroupsPage/Session` aceptan `sensorIds?`; `sessions/page.tsx`,
  `sessions/[id]/page.tsx` y `campaigns/page.tsx` lo derivan con `effectiveSensorScope`.
  Helper `narrowToTenant` cubierto por `sensor-scope.test.ts` (reusable para threats/web).
  `campaigns` ✅ totalmente scopeado (jul 2026): `fetchSessionCommands` / `/stats/session-commands`
  también scopea vía `session.sensorId` (`in: []` = fail-closed), con `cacheSuffix` en la key.
- **Threats** (`/threats`, `/threats/[ip]`): ✅ hecho (jul 2026). `resolveScope` usa `narrowToTenant`
  (techo de tenant + filtro manual `clientSlug`/`sensorId`). `getThreatByIp` ahora es fail-closed:
  scopea las 6 queries del detalle por `sensor_id` y devuelve 404 si el IP no tiene telemetría en los
  sensores del tenant. Front: `fetchThreatsPage/Threats/Threat` aceptan `sensorIds?`; scopeados en
  `threats/page.tsx`, `threats/[ip]`, y en los `fetchThreat` de `sessions/[id]` y `web-attacks/[ip]`.
- **Web-attacks** (`/web-attacks` + `bursts`/`geo`/`paths`/`timeline`/`sessions`/`sessions/[fp]`/`[ip]`):
  ✅ hecho (jul 2026). `resolveSensorScope` unificado con `narrowToTenant`. Se scopearon TAMBIÉN los
  endpoints que antes eran globales (`/web-hits`, `/timeline`, `/paths`, `/hourly`, `/sessions/:fp`) vía
  el helper `sensorCondition` en `web.repository.ts`; `scopeKey` incluye `t=${cacheSuffix}` en cada
  `withCache` (anti cache-poisoning). Detail `/sessions/:fp` fail-closed. Front: los 9 fetchers de
  `lib/api/web.ts` aceptan `sensorIds?`; las 8 páginas derivan con `effectiveSensorScope`.
  Verificado contra `honeypot_full`: web Saludsa=5537/Cooperativa=0; threat detail de un IP web-only
  visible a Saludsa, 404 a Cooperativa, visible a global.
- **Credentials, Malware, IoCs, Commands**: ✅ hecho (jul 2026).
  - `credentials`: `credential_attempts` tiene `sensor_id`; `EventScope` manual unificado con
    `narrowToTenant`. Client-fetch vía `/api/credentials` (re-deriva scope, strippea `sensorIds` del cliente).
  - `malware`: `listFromDb` scopea por `sensor_id`; el disk-scan fallback **no** corre para tenant
    scopeado; download fail-closed (`sampleInScope`) vía `/api/malware/[md5]/download`.
  - `iocs`: reusa threats+malware ya scopeados + `queryCommandRowsForIocs` scopeado por sesión.
  - `commands`: `/events` scopeado por `session.sensorId` (ORM; `in: []` = fail-closed).
  - Verificado contra `honeypot_full`: creds Cooperativa=343468/Test=58606/Saludsa=0/none=0;
    commands Test=1213/Cooperativa=0; iocs Cooperativa=0/none=0. (malware sin datos en el dump local.)

### Infra de scoping (reusable, ya construida)
- Backend: `parseSensorScope(query)` en `apps/ingest-api/src/lib/sensor-scope.ts` →
  `{ all, cond('sensor_id'), cacheSuffix }`. `cond()` da `AND sensor_id IN (...)` / `AND false` /
  vacío. **Importante**: añadir `cacheSuffix` a la cache key de cada endpoint.
  Para `events` (sin `sensor_id`): scopear vía `session_id IN (SELECT id FROM sessions WHERE … sensor_id IN …)`.
- Front: `effectiveSensorScope()` (cacheado por request, `apps/dashboard/lib/tenant-scope.ts`)
  → `sensorIds`; `sensorScopeParam()` en `apps/dashboard/lib/api/stats.ts` arma `?sensorIds=a,b`
  (`__none__` = fail-closed).

> ⚠️ **Existen DOS mecanismos de scope y NO son equivalentes:**
> - `parseSensorScope` (query `?sensorIds=`, derivado de la cookie por un server component /
>   route handler) → **límite duro del tenant**. Es el bueno. Lo usan home + reports.
> - `resolveSensorScope(prisma, clientSlug, sensorId)` (`ClientSensorFilter`) → **filtro manual
>   opcional** por query params `clientSlug`/`sensorId`. Lo usan threats y web-attacks. **NO es
>   un boundary de tenant**: si el usuario no aplica el filtro, ve todo. Hay que atarlo al scope
>   de tenant como techo (el filtro manual solo puede estrechar DENTRO de los sensores del tenant).

### Modelo de confianza (importante)
El **único punto de enforcement es el dashboard**. Los fetches salen server-side al
`INTERNAL_API_URL` con `X-Ingest-Token` (secret compartido); el `ingest-api` **confía ciegamente
en el `sensorIds` que recibe** — no re-valida por usuario. Invariantes que sostienen esto:
1. **Ningún fetch client-side puede llevar `sensorIds`.** Todo cálculo de scope ocurre en un
   server component o en un route handler `app/api/*` que re-deriva con `effectiveSensorScope`.
   Componentes client-fetched (ej. AttackHeatmap) deben pegar a un route handler propio, nunca
   al ingest-api directo.
2. **El `ingest-api` nunca debe estar expuesto a internet.** Su única credencial es el secret
   compartido; si es alcanzable, cualquiera con el token consulta cualquier `sensorIds`.

---

## ❌ LO QUE FALTA (para llegar a 100%)

### 1. Páginas de datos NO scopeadas (la mayor parte del trabajo)
Estas vistas hoy muestran datos **globales** sin importar el tenant seleccionado. Cada una usa
`fetch*` de `lib/api` que pega a su endpoint de backend. Hay que: (a) en la página, calcular
`effectiveSensorScope()` y pasar `sensorIds` al fetcher; (b) en `lib/api`, aceptar `sensorIds?` y
mandarlo; (c) en el endpoint backend, `parseSensorScope` + `cond('sensor_id')` + cache key por scope.

| Página (`app/…`) | Módulo backend (`modules/<x>/`) | Notas |
|---|---|---|
| ~~`sessions`~~ | `sessions/` | ✅ hecho (jul 2026). Unificado `ClientSensorFilter` + techo de tenant con `narrowToTenant`. Ver "Vistas YA scopeadas". |
| ~~`threats` + `threats/[ip]`~~ | `threats/` | ✅ hecho (jul 2026). `narrowToTenant` + `getThreatByIp` fail-closed. Ver "Vistas YA scopeadas". |
| ~~`web-attacks` (+ `bursts`, `geo`, `paths`, `timeline`, `sessions`, `[ip]`)~~ | `web/` | ✅ hecho (jul 2026). `narrowToTenant` + se scopearon los endpoints antes globales. Ver "Vistas YA scopeadas". |
| ~~`credentials`~~ | `stats/` (`credentials`) | ✅ hecho (jul 2026). `credential_attempts` **sí** tiene `sensor_id` (la nota de #4 era stale); ya tenía `EventScope` manual → unificado con `narrowToTenant`. El fetch client-side va por el route handler `/api/credentials` que re-deriva el scope y **strippea** cualquier `sensorIds` del cliente. |
| ~~`malware`~~ | `malware/` | ✅ hecho (jul 2026). `listFromDb` scopea por `sensor_id`; el fallback de disk-scan **no** corre para un tenant scopeado (evita fuga). Download fail-closed (`sampleInScope`), el route handler `/api/malware/[md5]/download` re-deriva el scope. |
| ~~`iocs`~~ | `iocs/` | ✅ hecho (jul 2026). Reusa threats + malware (ya scopeados) + `fetchAggregatedIocs` scopeado vía sesión (`queryCommandRowsForIocs`). |
| ~~`commands`~~ | `events/` | ✅ hecho (jul 2026). `events` no tiene `sensor_id` → scope vía relación `session.sensorId` (`in: []` = fail-closed). |
| ~~`services` + `services/*` (ftp, mysql, mssql, smb, mqtt, ports)~~ | `protocol/` | ✅ hecho (jul 2026). Ver "Vistas YA scopeadas". |
| `deception` | `deception/` | Verificar relación con sensores del cliente. |
| `network`, `campaigns` | varios | Reusan telemetría de otras vistas; caen cuando esas caigan. |
| `live` | `live/` | **Websockets/SSE — caso aparte, ver #7.** El modelo cookie-por-request no aplica a un stream de larga vida. |
| `suricata` | `suricata/` | `suricata_alerts` tiene `sensor_id`. |
| `api-defense` | `api-defense/` | `api_defense_events` NO tiene sensor_id — decidir (¿es global?). |

### 2. Deuda pendiente del Dashboard home — ✅ CERRADA (jul 2026)
- ~~`/stats/novelty` no scopeado~~ → hecho, `stats/controllers/novelty.ts` + route handler.
- ~~`AttackHeatmap` no scopeado~~ → hecho vía `app/api/stats/heatmap/route.ts`.
  (Patrón a reusar: componente client-fetched → route handler `app/api/*` que re-deriva el scope.)

### 3. Aislamiento de la gestión — ✅ RESUELTO POR DISEÑO (jul 2026, modelo `cliente`)
El modelo de roles cambió: **staff = global** (superadmin/admin/analyst/viewer ven todos los
tenants), y el **único rol scopeado es `cliente`** (atado a su `clientId`, solo lectura). Así que
no existe "admin de tenant" — la gestión es global para staff, y un `cliente` **no puede llegar** a
ninguna página de gestión/infra:
- Nav: el sidebar oculta Infrastructure/Administration + Network IDS + API Defense para `cliente`, y
  muestra SSH/Web/Network solo si tiene ese tipo de sensor (`/api/me` → `modules`, derivado de
  `sensors.protocol`).
- URL: guard server-side `forbidCliente()` (`lib/page-guards.ts`) redirige a `/` desde
  `users/sensors/clients/settings/storage/monitoring/install/audit/sessions-admin/suricata/api-defense/network`.
- Permisos: `cliente` tiene rank de `viewer` (no pasa `requireRole('analyst'|'admin')`), y la
  creación de usuarios corre por `authAdmin` (sin `nextCookies`) para no secuestrar la sesión del admin.

### 4. Vistas materializadas / rollups sin `sensor_id`
Tablas que agregan y **no** tienen `sensor_id` → no se pueden filtrar directo:
`threat_ip_summary`, `daily_summary`, `daily_attacker_stats`, `daily_credential_stats`,
`daily_command_stats`. Para cada KPI que las use: recalcular desde tablas
base (más lento) **o** añadir `sensor_id`/`client_id` al rollup (migración + recálculo). Decidir
caso por caso.
> Nota (jul 2026): `credential_attempts` **sí** tiene `sensor_id` — se removió de esta lista;
> `/credentials` ya scopea directo.
> `threat_ip_summary` (rollup global sin `sensor_id`) fue el caso más sutil: el `EXISTS` inicial
> solo decidía **qué IPs** aparecían, pero los números por IP (ssh/web/protocols) seguían siendo
> globales → un tenant web-only veía correlación SSH de otros tenants. **Resuelto (jul 2026):**
> `querySummaryRows` es scope-aware — **global** lee la materialized view (correlación cross-sensor
> intacta); **scoped** re-agrega desde tablas base con `sensor_id IN (…)` + ventana temporal, así
> cada número refleja solo los sensores del tenant. El detalle (`getThreatByIp`) ya era fail-closed.

### 5. SIEM / forwarding por tenant (verificar)
- Las alertas a CrowdStrike ya se enrutan por cliente (`resolveClientCrowdStrike`). Confirmar que
  el `forward_url` por cliente y cualquier otro egress respeten el tenant.

### 6. Endurecimiento / pruebas de seguridad
- Test automatizado por endpoint: un usuario de tenant A pidiendo datos de B (vía cookie/param
  manipulado) **nunca** recibe datos de B. Hoy verificado solo en alertas + overview.
- Idealmente un `/security-review` enfocado en aislamiento antes de dar acceso a clientes reales.

### 7. `live` stream (websockets/SSE) — caso arquitectónico aparte
El scope hoy es "por request" (cookie → server component → `sensorIds`). Un stream de larga vida
no encaja: hay que **resolver el scope una vez al abrir la conexión** (a partir de la sesión
autenticada, no de un param) y **filtrar cada evento empujado** por `sensor_id ∈ sensores del
tenant`. Si la conexión no lleva sesión válida o el tenant no tiene sensores → cerrar / no emitir.
Es el único punto donde el patrón mecánico de las demás páginas no aplica; diseñarlo antes de
tocar `live`.

---

## 🔎 Mejoras / cosas que el plan no contemplaba (jul 2026)

Detectadas al auditar el código; valen la pena antes de abrir a clientes reales:

- **Cache-key poisoning entre tenants (invariante de seguridad, no solo perf).** Si un endpoint
  scopeado hace `withCache` sin el scope en la key, el tenant A puebla la cache y el B recibe sus
  datos. Hoy los endpoints scopeados sí lo hacen (`:${scope.cacheSuffix}` / `scopeKey`), pero **no
  hay nada que lo garantice para endpoints nuevos**. Acción: (a) auditar TODOS los `withCache` de
  módulos con telemetría; (b) test que falle si un endpoint scopeado cachea sin scope en la key.

- **No hay red de seguridad contra regresiones.** Un endpoint de telemetría nuevo puede shippear
  sin `parseSensorScope` y nadie se entera. Opción barata: un test que recorra los módulos de
  telemetría y falle si un handler que toca `sessions/web_hits/protocol_hits/...` no referencia
  `parseSensorScope`. (Heurístico, pero corta el 90% de los olvidos.)

- **Unificar los dos mecanismos de scope.** ✅ RESUELTO (jul 2026) en sessions, threats y web-attacks:
  el helper `narrowToTenant(tenant, manual)` en `lib/sensor-scope.ts` convierte el filtro manual en un
  *narrow* que solo opera DENTRO del `sensorIds` del tenant (el techo lo pone siempre `parseSensorScope`).
  Ya no quedan boundaries falsos de `ClientSensorFilter` en las vistas de telemetría scopeadas.

- **Reports agendados / egress futuro.** Hoy reports es on-demand (con cookie). Si se agregan
  reportes por email/cron, corren **sin request** → deben resolver el scope desde el registro del
  cliente, nunca de una cookie. Dejar esto escrito para no reintroducir una fuga.

- **`user.clientId` inmutable tras crear datos.** Verificar qué pasa si se reasigna un usuario/
  sensor de cliente: la telemetría es por `sensor_id`, así que mover un sensor re-scopea solo — 
  pero conviene un test que lo confirme (sensor movido de A→B deja de verse en A).

---

## Patrón a seguir (plantilla para cada página)

**Backend** — `modules/<x>/<x>.controller.ts` parsea el scope y lo pasa al service; el SQL vive en
`<x>.repository.ts` (SQL solo en repos, ver CLAUDE.md):
```ts
// <x>.controller.ts
import { parseSensorScope } from '../../lib/sensor-scope.js'
fastify.get('/<x>', (request) => {
  const scope = parseSensorScope(request.query as Record<string, unknown>)
  return withCache(fastify.cache, `<x>:${scope.cacheSuffix}`, TTL,   // ⚠️ scope SIEMPRE en la key
    () => svc.get<X>(scope))
})

// <x>.repository.ts
await prisma.$queryRaw`... WHERE ... ${scope.cond('sensor_id')} ...`
// para tablas sin sensor_id (events): ${scope.all ? Prisma.empty
//   : Prisma.sql`AND session_id IN (SELECT id FROM sessions WHERE true ${scope.cond('sensor_id')})`}
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
1. ✅ ~~Deuda del home (novelty, heatmap)~~ — hecho.
2. ✅ ~~Services/protocolos~~ — hecho (jul 2026). Patrón mecánico fijado; reusar tal cual.
3. ✅ ~~Sessions, Threats, Web-attacks~~ — hecho (jul 2026). Unificación `narrowToTenant` aplicada a
   los tres; detalles fail-closed (`getById`, `getThreatByIp`, `/web-hits/sessions/:fp`).
4. ✅ ~~Credentials, Malware, IoCs, Commands~~ — hecho (jul 2026). Detalles fail-closed
   (malware download, credentials via route handler que strippea `sensorIds` del cliente).
5. Aislamiento de gestión (/users, /sensors, /clients).
6. Rollups sin sensor_id (solo los KPIs que falten).
7. `live` stream (diseño aparte, #7).
8. Tests de aislamiento + cache-key + security review.

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
