# ANALYTICS_MODULE — Módulo de analítica histórica (ClickHouse)

## Estado (2026-07-27)

**Planificado, sin implementar.** Este plan detalla las Sub-fases 3d/3e de
[KAFKA_LAKE.md](KAFKA_LAKE.md) — ese documento se queda con el diseño de alto
nivel (split hot/cold, gating por `CLICKHOUSE_URL`); este es el plan completo
de **qué construir, en qué orden, y cómo**, para el módulo de analítica en sí.

**Prerequisito de datos:** [KAFKA_LAKE Sub-fase 3c](KAFKA_LAKE.md#sub-fase-3c--backfill-de-la-historia-existente-one-time)
(backfill desde Postgres) está implementada pero **sin correr todavía**. Hasta
que se corra, el Explorador de Tendencias (Fase A) solo tiene datos desde que
el consumer de Kafka arrancó (2026-07-27) — no bloquea empezar a construir,
pero conviene correr el backfill antes de mostrarle esto a un cliente.

## Contexto — qué gap llena esto

El dashboard ya cubre bien el **estado operacional/actual**: `sessions`,
`credentials`, `threats`, `suricata`, `web-attacks`, `campaigns`, `network`,
`reports` — todas son vistas de "qué está pasando ahora / lista filtrable".
Ninguna resuelve **"cómo evolucionó esto en los últimos 6 meses"**, porque esa
pregunta en Postgres es cara (full scan o un matview que hay que mantener).

Motivación concreta, no especulativa:

- **`credential_attempts` es un matview de ~1.6M filas** cuyo `REFRESH` cada
  30 min ya causó un incidente real de CPU en la réplica (ver
  [[replica-cpu-matview-refresh]] / `docs/project-notes`). Migrar esa
  analítica a ClickHouse **elimina el REFRESH entero** — ya estaba anotado
  como el mayor premio de rendimiento de la Fase 3 del lake.
- Las 4 tablas de ClickHouse (`cowrie_events`, `web_events`,
  `protocol_events`, `suricata_alerts`) ya están vivas, alimentándose solas
  desde Kafka (Fases 3a/3b, desplegadas 2026-07-27) — el costo de sumar
  analítica de rango largo ahora es solo trabajo de repositorio + UI, no
  infraestructura nueva.

## Arquitectura común (aplica a las 6 fases de abajo)

### Backend — capas (regla de `docs/project-notes/backend-layering.md`)

Nuevo módulo `apps/ingest-api/src/modules/analytics/`:

- **`lib/clickhouse.ts`** — cliente HTTP a ClickHouse (paquete
  `@clickhouse/client`, apunta a `http://clickhouse:8123`). Un singleton,
  igual patrón que `lakeProducer`/Redis: `connect()` gateado por
  `CLICKHOUSE_URL` presente, `null` si no está configurada.
- **`analytics.repository.ts`** (o partido por sub-dominio si crece: 
  `trends.repository.ts`, `credentials.repository.ts`, `attacker-profile.repository.ts` —
  decidir al implementar, según cuánto crezca cada uno; **no partir de
  entrada por YAGNI**, un solo archivo hasta que duela). **Todo el SQL de
  ClickHouse vive acá** — mismo principio que ya rige Prisma/`$queryRaw` en
  el resto del backend, aplicado al segundo motor de DB.
- **`analytics.service.ts`** — orquesta repos, aplica `withCache`
  (stale-while-revalidate, mismo patrón que el resto del dashboard).
- **`analytics.controller.ts`** — rutas HTTP-only (Zod + auth + `reply.send`),
  cero SQL.

### Gating — sin ClickHouse, el módulo no rompe nada

Igual que `lakeProducer`/`KAFKA_BROKERS`: si `CLICKHOUSE_URL` no está seteada
(single-host sin el lake levantado), los endpoints de `/analytics/*`
devuelven `503 { error: 'analytics_unavailable' }` — **no** caen a Postgres
(a diferencia de Sub-fase 3d original, que sugería fallback silencioso: eso
generaría queries carísimas sin avisar; mejor fallar explícito y que la UI
muestre "no disponible" que degradar en silencio a una query de minutos). La
UI oculta o deshabilita las vistas de analítica cuando el endpoint devuelve
503.

### Tenant scoping — OBLIGATORIO desde la Fase A, no una fase aparte

El resto de la API ya tiene un mecanismo maduro: `parseSensorScope()`
(`apps/ingest-api/src/lib/sensor-scope.ts`) construye el filtro `sensor_id IN
(...)` a partir de `?sensorIds=` (que el dashboard arma con
`effectiveSensorScope()`, resolviendo el tenant del usuario autenticado). Ese
helper genera `Prisma.Sql`, que no sirve directo para el cliente de
ClickHouse — hace falta un **equivalente para ClickHouse** (mismo contrato:
`all` global, `sensorIds: string[]`, `__none__` → `WHERE false`) que arme el
fragmento `AND sensor_id IN ({ids:Array(String)})` con query parameters del
cliente ClickHouse (nunca interpolando strings a mano — mismo motivo que ya
documentado en `clickhouse/backfill/*.sql`: los params van tipados, no
concatenados).

**Ninguna query de analítica se escribe sin pasar por este filtro.** Un
cliente viendo tendencias de otro cliente sería una fuga de datos cross-tenant,
exactamente lo que `docs/plans/MULTI_TENANT_ROADMAP.md` existe para evitar.

### Dashboard — estructura de UI

Nueva sección `/analytics` (top-level, sidebar), con tabs/sub-rutas por fase:

```
/analytics                    → Fase A: Trends Explorer (landing)
/analytics/credentials         → Fase B: Credential Intelligence
/analytics/suricata-trends     → Fase D: Suricata Signature Trends
/analytics/comparison          → Fase E: Sensor/Client Comparison (superadmin)
```

Fase C (perfil cross-fuente) extiende `/threats/[ip]` existente en vez de
crear una ruta nueva — ya es la vista "todo sobre este IP", tiene sentido que
viva ahí. Fase F no es una ruta, es alimentar `/reports` con los repos de A/B.

- Charts: reusar `recharts` (ya es dependencia — ver
  `container-stats-chart.tsx`), mismo estilo visual que Monitoring.
- i18n: `apps/dashboard/lib/i18n/dicts/analytics-trends.ts`,
  `analytics-credentials.ts`, etc. — un dict por fase, bajo ~150 líneas cada
  uno (regla de `CLAUDE.md`), strings fuente en inglés.
- Cache-Control / stale-while-revalidate: igual al resto del dashboard, TTLs
  más largos que las stats "calientes" (esto es histórico, no necesita
  refrescar cada minuto — 5-15 min de TTL es razonable, a decidir por fase).

---

## Fase A — Trends Explorer (núcleo, prioridad 1)

**Objetivo:** volumen de eventos en el tiempo, cualquier rango, filtrable por
protocolo/sensor, con granularidad de bucket adaptada al rango (igual patrón
que `container-stats-chart.tsx`: hora para ≤7d, día para ≤90d, semana para
más).

**Fuente:** `UNION ALL` de las 4 tablas normalizado a `(timestamp, protocol,
sensor_id, src_ip)` — o una vista ClickHouse (`CREATE VIEW`) que hace ese
UNION una vez, para no repetirlo en cada query.

```sql
CREATE VIEW honeypot_lake.all_events AS
SELECT timestamp, 'cowrie' AS protocol, sensor_id, src_ip FROM cowrie_events
UNION ALL
SELECT timestamp, 'web', sensor_id, src_ip FROM web_events
UNION ALL
SELECT timestamp, protocol, sensor_id, src_ip FROM protocol_events
UNION ALL
SELECT timestamp, 'suricata', sensor_id, src_ip FROM suricata_alerts
```

**Endpoint:** `GET /analytics/trends?range=30d&protocol=&sensorIds=`
→ `{ bucket: string, protocol: string, count: number }[]`, agregado con
`toStartOfHour`/`toStartOfDay`/`toStartOfWeek(timestamp)` según `range`.

**UI:** selector de rango (7d/30d/90d/1y/custom), gráfico de área apilada por
protocolo (o línea total, toggle), filtro de sensor/cliente (usa
`ClientSensorFilter` existente).

**Criterio de salida:** query de 1 año de datos responde en <2s; counts de una
ventana conocida coinciden con la suma equivalente en Postgres.

---

## Fase B — Credential Intelligence (prioridad 1, reemplaza el matview)

**Objetivo:** top combos usuario/contraseña, campañas de fuerza bruta en el
tiempo, tasa de éxito — y con esto, **retirar `credential_attempts`**
(Sub-fase 3e de KAFKA_LAKE).

**Fuente:**
- `cowrie_events` filtrado por `eventid IN ('cowrie.login.success',
  'cowrie.login.failed')` — success/failure ya vienen diferenciados en el
  `eventid` crudo.
- `protocol_events` filtrado por `event_type = 'auth'` (ftp/mysql/etc.) — sin
  distinción success/failure explícita en columnas tipadas hoy (vive dentro
  de `data`, que no se parseó a columna en el schema de 3a). **Alcance
  explícito de esta fase: éxito/fracaso solo para cowrie; protocol_events
  cuenta intentos, no resultado** — ampliar el schema si hace falta el
  desglose por protocolo más adelante (no ahora, YAGNI hasta que se pida).

**Endpoints:**
- `GET /analytics/credentials/top-combos?range=&sensorIds=` → top N
  `(username, password, count)`.
- `GET /analytics/credentials/campaigns?range=&sensorIds=` → ráfagas por
  `src_ip` (ventana deslizante, ej. >N intentos en <M minutos) — timeline por
  IP.
- `GET /analytics/credentials/success-rate?range=&sensorIds=` → serie
  temporal de éxito/fracaso (cowrie).

**UI:** `/analytics/credentials` — tabla top combos, timeline de campañas
(reusa el patrón de gráfico de Fase A), tarjeta de tasa de éxito.

**Criterio de salida:** los números de "top combos" y "tasa de éxito" para
una ventana coinciden con lo que hoy devuelve el matview `credential_attempts`
para la misma ventana (ver Verificación abajo) — **recién ahí** se retira el
matview.

---

## Fase C — Perfil de atacante cross-fuente

**Objetivo:** dado un IP, una timeline unificada de TODO lo que hizo — sesión
SSH, hits web, hits de protocolo, alertas Suricata — en un solo lugar, con
todo el historial (no solo lo que retiene Postgres/la vista actual).

**Fuente:** las 4 tablas filtradas por `src_ip = {ip}`, `ORDER BY timestamp`,
unidas en la capa de servicio (no en SQL — cada tabla tiene columnas
distintas; el merge de "qué pasó y cuándo" se arma en TS, cada fuente aporta
un `{ timestamp, source, summary }`).

**Endpoint:** `GET /analytics/attacker/:ip/timeline` → eventos de las 4
fuentes intercalados por tiempo.

**UI:** extender `/threats/[ip]` con una pestaña "Timeline completo" (o
sección nueva en la página existente) — no crear una ruta paralela.

**Nota:** esta fase es la única que **no** necesita `sensorIds` de tenant
scoping como filtro primario (el IP ya acota), pero el endpoint igual debe
aplicar el scope — un cliente no debería poder mirar el perfil de un IP que
solo le pegó a sensores de otro tenant.

---

## Fase D — Suricata Signature Trends

**Objetivo:** hoy `/suricata` es "últimas 24h/7d/30d" (ver
`suricata.service.ts::getStats`, rangos fijos). Esto agrega **rango
arbitrario + tendencia por semana/mes** de firmas y categorías.

**Fuente:** `suricata_alerts`, `GROUP BY toStartOfWeek(timestamp), signature`
(o `category`).

**Endpoint:** `GET /analytics/suricata-trends?range=&groupBy=signature|category&sensorIds=`

**UI:** `/analytics/suricata-trends` — mismo patrón de gráfico que Fase A,
tabla de top signatures/categorías por período seleccionado.

---

## Fase E — Comparativa por sensor/cliente (superadmin)

**Objetivo:** volumen de tráfico por sensor/cliente en el tiempo — quién
recibe más, tendencia por cliente. Solo tiene sentido para `superadmin`
viendo múltiples tenants (un cliente normal ya está acotado a los suyos).

**Fuente:** `all_events` (vista de Fase A) `GROUP BY sensor_id,
toStartOfDay(timestamp)`, después mapeado a cliente **en la capa de
servicio** vía lookup a Postgres (`sensors.client_id`) — **no** desnormalizar
`client_id` dentro de ClickHouse (evita mantener sincronizado un mapeo que ya
vive en Postgres; el join se hace en memoria sobre un resultado agregado
chico, no fila por fila).

**Depende de:** [MULTI_TENANT_ROADMAP.md](MULTI_TENANT_ROADMAP.md) — esta
fase asume que el modelo cliente↔sensor ya está estable.

**UI:** `/analytics/comparison`, gateado a `role >= superadmin`.

---

## Fase F — Alimentar `/reports` con esto

No es una ruta nueva: una vez que A y B existen, `/reports`
(`docs/plans/CLIENT_REPORTS_PDF.md`) puede sumar una sección de tendencias de
rango largo casi gratis, reusando `analytics.service.ts`. Se hace **al
final**, cuando A/B estén verificadas — no tiene sentido meterla en un reporte
antes de confiar en los números.

---

## Prerequisitos y orden recomendado

1. **Correr el backfill de 3c** (`./scripts/backfill-clickhouse.sh`) — sin
   esto, Fase A muestra un mes de historia real como si fuera todo el
   histórico.
2. **Cliente ClickHouse + helper de tenant scoping** (parte de "Arquitectura
   común" arriba) — se construye una sola vez, lo usan las 6 fases.
3. **Fase A** (Trends Explorer) — es la base visual y de infraestructura que
   las demás reutilizan (selector de rango, patrón de gráfico).
4. **Fase B** (Credential Intelligence) — prioridad igual a A por el
   matview que resuelve.
5. C, D, E, F — en el orden que convenga según qué se necesite primero; no
   tienen dependencias fuertes entre sí más allá de "usan el mismo cliente y
   el mismo helper de scoping".

## Verificación

- Cada fase: comparar el resultado contra la query equivalente en Postgres
  para una ventana conocida (mismo criterio que ya usa `up-platform.sh` /
  `backfill-clickhouse.sh` — counts que coinciden dan confianza).
- Fase B específicamente: correr en paralelo con el matview
  `credential_attempts` un tiempo antes de retirarlo, comparando números.
- Latencia: el punto entero de este módulo es que las queries de rango largo
  sean rápidas — si una tarda >2-3s, algo está mal indexado/particionado, no
  es "aceptable porque es analítica".
- Tenant scoping: test explícito (igual que `sensor-scope.test.ts` ya cubre
  para Postgres) de que un usuario scoped a un cliente nunca recibe filas de
  `sensor_id` fuera de su scope, en los 6 endpoints nuevos.

## Relación con otros planes

- **[KAFKA_LAKE.md](KAFKA_LAKE.md)** — prerequisito completo (3a/3b
  desplegadas; 3c implementada, pendiente de correr). Este plan reemplaza el
  detalle de sus Sub-fases 3d/3e.
- **[MULTI_TENANT_ROADMAP.md](MULTI_TENANT_ROADMAP.md)** — el tenant scoping
  de este módulo sigue exactamente su patrón (`parseSensorScope`); Fase E
  depende de que el modelo cliente↔sensor esté maduro.
- **[CLIENT_REPORTS_PDF.md](CLIENT_REPORTS_PDF.md)** — Fase F lo alimenta.
- **`docs/project-notes/replica-cpu-matview-refresh.md`** — el incidente que
  motiva retirar `credential_attempts` en Fase B.
