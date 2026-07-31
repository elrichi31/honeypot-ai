# ANALYTICS_MODULE — Módulo de analítica histórica (ClickHouse)

## Estado (2026-07-27)

**Fase A completa, desplegada y VERIFICADA funcionando en prod con datos
reales (2026-07-27).** Cliente ClickHouse + endpoint `GET /analytics/trends`
en `ingest-api` (**aislado del resto del backend** — el usuario fue explícito
en que este cliente es solo para analítica, todo lo demás sigue en Postgres
vía Prisma sin tocar), y el dashboard lo consume: `/analytics` muestra el
chart real (área apilada por protocolo — `cowrie`, `web`, `suricata`,
`port-scan`, `ftp`, `mysql`, `smb` — selector 7d/30d/90d/1y, tooltip con
tarjeta con borde igual al resto de la app, toggle de series por leyenda).
Confirmado visualmente por el usuario con datos reales del honeypot. Falta
correr el backfill de 3c para que el rango cubra más que "desde que arrancó
el consumer de Kafka".

**Backend de Fases B–F implementado (2026-07-27) + frontend de B–E ya cableado
(2026-07-27, mismo día).** El backend quedó disponible (Credential
Intelligence, timeline de atacante, tendencias Suricata, comparativa
superadmin sensor/cliente y el payload consolidado para reportes) y encima se
construyó el frontend completo de B, C, D y E. **F (alimentar `/reports`) quedó
cerrada en código el 2026-07-31** — sección "12-Month History" en el reporte de
cliente, integrada al HTML que ya produce el PDF por `window.print()`; detalle
en "Estado por fase" abajo.
Validación: `tsc --noEmit` limpio en los dos paquetes, suite completa de
`ingest-api` en verde (183 tests). **Sin verificar contra datos reales en
prod todavía** — falta desplegar y correr el backfill de 3c antes de darle
esto a un cliente.

**Qué quedó (frontend, 2026-07-27):**
- `components/analytics/shared.tsx` — extraído de `trends-chart.tsx` una vez
  que 3 charts más necesitaron el mismo selector de rango/tooltip/colores
  (`RangeSelector`, `ChartTooltip`, `fmtBucketLabel`, `CHART_COLORS`,
  `LoadingSpinner`). `trends-chart.tsx` se refactorizó para usarlo — mismo
  comportamiento, menos código duplicado.
- **`/analytics/credentials`** (Fase B) — top combos, campañas de fuerza
  bruta, tasa de éxito de login SSH. 3 fetches independientes por sección.
- **`/analytics/suricata-trends`** (Fase D) — área apilada por
  firma/categoría (toggle), tabla de top del rango.
- **`/analytics/comparison`** (Fase E) — **superadmin-only**, gateado en la
  página (`requireRole("superadmin")`) y en su proxy (usa
  `controlHeaders()`/`CONTROL_API_SECRET`, el mismo canal que
  sensor-control — **no** el `?sensorIds=` normal, porque este endpoint
  cruza tenants a propósito).
- **`/threats/[ip]`** (Fase C) — nueva sección `AttackerTimeline` al final de
  la página existente (no una ruta nueva), con paginación por cursor
  (`before`/`hasMore`/`nextBefore` que ya expone el backend).
- Sidebar: 3 items nuevos bajo "Data Analytics" (Comparison con
  `minRole: superadmin`); la landing `/analytics` reemplazó la tarjeta
  "coming soon" por tarjetas de navegación reales a Credentials/Suricata
  Trends/Comparison (Comparison solo visible si `auth.isSuperadmin`).
- 4 dicts nuevos (`analytics-credentials`, `analytics-suricata-trends`,
  `analytics-comparison`, `analytics-attacker`), registrados en
  `dictionaries.ts`; se limpiaron 2 claves de `analytics.ts` que quedaron
  muertas al reemplazar la tarjeta "coming soon".
- 6 proxies nuevos en `app/api/analytics/*` — mismo patrón que
  `app/api/analytics/trends/route.ts` salvo `comparison` (ver arriba).

**Dos bugs reales encontrados en el deploy, ambos resueltos:**
1. **Boot-race:** `plugins/clickhouse.ts` hacía un `ping()` una sola vez al
   arrancar y, si fallaba, desactivaba el módulo para toda la vida del
   proceso, sin reintentar. Como `ingest-api` y `clickhouse` no tienen
   `depends_on` entre sí (a propósito), `ingest-api` podía arrancar y correr
   ese ping mientras ClickHouse todavía estaba iniciando — perdió esa carrera
   en prod. Fix: el plugin ya no gatea en el ping — decora
   `fastify.clickhouse` apenas `CLICKHOUSE_URL` está seteada; la
   disponibilidad real se descubre **por request** (el controller envuelve la
   query en `try/catch` → `503` si falla), así que un ClickHouse que arrancó
   tarde se recupera solo en el próximo request.
2. **`listen_host` — el bug más grande de los dos.** Aun con el fix #1,
   `ingest-api` seguía sin poder llegar a `clickhouse:8123` (`fetch failed`
   puro, nada que ver con el cliente/credenciales) — el healthcheck de
   ClickHouse pasaba porque corre *dentro* del contenedor, pero nadie de
   afuera podía conectarse. Causa: sin configurar, el entrypoint arranca con
   `--listen_host=127.0.0.1`. **Primer intento fallido:** una env var
   `CLICKHOUSE_LISTEN_HOST` en el compose — no existe, el entrypoint no la
   lee. **Fix real:** `<listen_host>0.0.0.0</listen_host>` en
   `clickhouse/config.d/limits.xml` (mismo archivo que ya sobreescribe
   `max_server_memory_usage`). Ver detalle completo en
   [KAFKA_LAKE.md, incidente #7](KAFKA_LAKE.md#sub-fase-3a--clickhouse-arriba--schema).

Verificado: `tsc --noEmit` limpio en los dos paquetes, 166 tests en verde,
chart renderizando datos reales en el browser.

**Dashboard (nuevo, 2026-07-27):**
- `app/api/analytics/trends/route.ts` — proxy server-side: resuelve
  `effectiveSensorScope()` (el tenant del usuario autenticado) y lo reenvía
  como `?sensorIds=` a `ingest-api`, mismo patrón que
  `app/api/stats/novelty/route.ts`. Un cliente scoped no puede ampliar su
  vista editando el query string — el scope se resuelve server-side, nunca se
  confía en lo que mande el browser.
- `components/analytics/trends-chart.tsx` + `trends-explorer.tsx` — mismo
  split que `container-stats-chart.tsx`/`container-stats.tsx` (el wrapper
  hace el `dynamic(..., { ssr: false })` porque recharts toca `window`).
  Pivotea `{bucket, protocol, count}[]` a filas por bucket, un `Area` por
  protocolo detectado en la respuesta (no hardcodeado).
- Maneja los 3 estados que importan: `503` → "analytics no disponible"
  (ClickHouse caído/no configurado, distinto de "sin datos"), sin filas →
  empty state, error de red → `ErrorState` con retry.
- **Fix de UI post-deploy:** el tooltip al pasar el mouse salía como texto
  flotante sin la tarjeta con borde/sombra que tiene el resto de la app —
  `contentStyle` de Recharts no levantaba bien las variables CSS. Se
  reemplazó por el mismo patrón de tooltip custom (`content={<Tooltip/>}`)
  que ya usa `container-stats-chart.tsx`.
- **Omitido a propósito (YAGNI por ahora):** filtro manual de sensor/cliente
  (`ClientSensorFilter`) y el toggle "línea total vs. apilado" que sugería
  este plan — el scope automático por tenant ya filtra correctamente sin
  eso; agregar si alguien lo pide.

**Arquitectura implementada — resumen:**
- `apps/ingest-api/src/lib/clickhouse.ts` — cliente (`@clickhouse/client`),
  creado apenas `CLICKHOUSE_URL` está seteada (ya no gateado por un ping de
  boot, ver bug #1 arriba).
- `apps/ingest-api/src/plugins/clickhouse.ts` — decora `fastify.clickhouse`
  sin bloquear el arranque; el ping de boot es solo un log en background.
- `apps/ingest-api/src/lib/clickhouse-scope.ts` — equivalente de
  `sensor-scope.ts` pero para el cliente de ClickHouse (`Prisma.Sql` no
  aplica ahí). Mismo contrato (`?sensorIds=`, `__none__` fail-closed,
  `cacheSuffix` estable), con test (`clickhouse-scope.test.ts`) — es lógica
  de seguridad (fuga cross-tenant si se rompe), no queda sin verificación.
- `apps/ingest-api/src/modules/analytics/` (`*.repository/service/controller.ts`) —
  `GET /analytics/trends?range=7d|30d|90d|1y&protocol=&sensorIds=`. El
  `UNION ALL` de las 4 tablas (boceto como `all_events` VIEW en este plan)
  quedó **inline en el repositorio**, no como VIEW — un solo call site hoy,
  YAGNI crear la vista hasta que haga falta en un segundo lugar. `503`
  explícito (configurado-pero-caído o directamente no configurado), nunca
  cae a Postgres en silencio.
- `clickhouse/config.d/limits.xml` — suma `<listen_host>0.0.0.0</listen_host>`
  (bug #2 arriba).
- `CLICKHOUSE_URL/USER/PASSWORD/DATABASE` en el `environment` de `ingest-api`,
  dashboard con `app/api/analytics/trends/route.ts` +
  `components/analytics/trends-{chart,explorer}.tsx`.

**Estado por fase y pendientes operativos:**
- Correr `./scripts/backfill-clickhouse.sh` (Sub-fase 3c) para que el
  endpoint tenga historia real, no solo desde que arrancó el consumer.
- Fase B (Credential Intelligence) — **backend implementado (2026-07-27);
  verificación de datos pendiente:** agregado
  `analytics-credentials.repository.ts` con las queries
  ClickHouse tenant-scoped para top combos, campañas en ventanas de 5 minutos
  (umbral de 10 intentos) y tasa de éxito/fracaso exclusiva de Cowrie. El
  servicio ya orquesta las tres consultas con cache SWR de 10 minutos y claves
  separadas por rango, límite y tenant. Expuestos los tres endpoints HTTP del
  contrato con validación Zod, `503` recuperable por request y metadata
  explícita para umbral/ventana/fuente. El primer pase de TypeScript detectó y
  se corrigió un cast/import residual en la ruta de tendencias. Pendiente:
  validación final y verificación con datos reales antes de retirar el matview.
  Agregados tests unitarios del repositorio que fijan el `UNION` de fuentes,
  scope tenant fail-closed, parámetros tipados, ventana de campañas y que la
  tasa de éxito no mezcle resultados desconocidos de `protocol_events`.
  Analytics ahora responde `400` estructurado para queries inválidas (incluida
  la ruta de Fase A) y tiene tests de integración Fastify para `503`, validación,
  propagación del scope y metadata de campañas/tasa de éxito. Validación local:
  `tsc --noEmit` limpio y suite completa de `ingest-api` en verde (173 tests;
  35 integraciones omitidas por no tener `TEST_DATABASE_URL`). No había un
  contenedor ClickHouse local activo, así que sigue pendiente comparar contra
  el matview con datos reales; **no retirar ni detener su refresh todavía**.
- Fase C (perfil de atacante cross-fuente) — **backend implementado
  (2026-07-27):** agregado `analytics-attacker.repository.ts` con una
  consulta tenant-scoped por cada fuente ClickHouse. El contrato normaliza
  campos útiles sin devolver `raw` ni contraseñas, admite límite y cursor
  temporal exclusivo (`before`) para evitar respuestas sin cota. Agregado
  `analytics-attacker.service.ts`: ejecuta las cuatro fuentes en paralelo,
  genera resúmenes seguros en inglés, hace merge estable descendente y devuelve
  `hasMore`/`nextBefore` con cache SWR de 5 minutos por IP, cursor y tenant.
  Expuesto `GET /analytics/attacker/:ip/timeline?limit=&before=&sensorIds=`
  con validación de IPv4/IPv6, rechazo de IPs internas consistente con
  `/threats/:ip`, `503` recuperable y scope ClickHouse obligatorio. Agregados
  tests del merge/resúmenes, orden estable, paginación, ausencia de
  `raw`/contraseñas, propagación tenant/cursor a las cuatro fuentes y contrato
  HTTP. Validación local: `tsc --noEmit` limpio y suite completa de
  `ingest-api` en verde (177 tests; 35 integraciones omitidas por no tener
  `TEST_DATABASE_URL`). Pendiente únicamente validar la consulta contra un
  ClickHouse con datos reales después del backfill.
- Fase D (Suricata Signature Trends) — **backend implementado
  (2026-07-27):** agregado `analytics-suricata.repository.ts`. La consulta
  tenant-scoped selecciona primero los grupos principales para acotar
  cardinalidad y luego genera buckets adaptativos por `signature` o `category`,
  incluyendo severidad mínima del grupo. Agregado
  `analytics-suricata.service.ts`, que reutiliza la configuración común de
  rangos, aplica cache SWR de 10 minutos, normaliza números de ClickHouse y
  deriva el ranking total desde la misma serie. Expuesto
  `GET /analytics/suricata-trends?range=&groupBy=&limit=&sensorIds=` con Zod,
  `503` recuperable y scope tenant obligatorio. Agregados tests de columna
  segura, granularidad adaptativa, normalización/ranking, propagación del scope
  a ambas partes de la query y contrato HTTP. Validación local:
  `tsc --noEmit` limpio y suite completa de `ingest-api` en verde (180 tests;
  35 integraciones omitidas por no tener `TEST_DATABASE_URL`). Pendiente
  únicamente validar latencia y resultados contra un ClickHouse con datos
  reales después del backfill.
- Fase E (comparativa por sensor/cliente) — **backend implementado
  (2026-07-27):** agregado `analytics-comparison.repository.ts`.
  ClickHouse agrega las cuatro fuentes por bucket+sensor con scope parametrizado;
  un repositorio Postgres separado obtiene el directorio sensor→cliente. El join
  queda para el servicio sobre resultados agregados, sin desnormalizar
  `client_id` en el lake. Agregado `analytics-comparison.service.ts`: consulta
  lake+directorio en paralelo, normaliza conteos, conserva sensores sin asignar,
  agrega una segunda serie por cliente y cachea 10 minutos por rango/scope.
  Expuesto `GET /analytics/comparison?range=&sensorIds=`. La ruta exige el token
  interno con comparación timing-safe y actor firmado `superadmin` en scope
  global; rechaza roles inferiores o superadmins tenant-scoped antes de consultar
  datos. Agregados tests del join en memoria, suma por cliente, sensores sin
  asignar, parámetros tenant y autorización (un viewer no alcanza ClickHouse).
  Validación local incluida en el pase acumulado de 183 tests; pendiente
  contrastar agregados sensor/cliente con datos reales.
- Fase F (alimentar reportes) — **backend implementado (2026-07-27):**
  agregado `AnalyticsService.getReportSummary` y
  `GET /analytics/report-summary?range=&credentialLimit=&sensorIds=`. El
  contrato ejecuta A+B en paralelo y entrega volumen histórico, top credenciales
  y serie de éxito Cowrie con el mismo scope/cache de sus fuentes, sin SQL
  duplicado. Agregado test HTTP que fija el payload consolidado y la propagación
  tenant a las tres consultas. Validación local incluida en el pase acumulado de
  183 tests.
  **Frontend cableado (2026-07-31) — Fase F cerrada en código, falta QA con
  datos reales.** El reporte de cliente (`/reports`) ahora incluye una sección
  **"12-Month History"** alimentada por el lake:
  - `lib/api/analytics.ts` (nuevo) — `fetchAnalyticsReportSummary({range,
    credentialLimit, sensorIds})`, mismo patrón scopeado que los fetchers de
    `lib/api/stats.ts`. **Normaliza los counts con `Number()` una sola vez acá**
    — ClickHouse serializa `UInt64` como string y el `+` concatena en silencio
    (es el bug que produjo el "170,142,..." de eventos totales en el overview).
  - `lib/reports/shared/history.ts` (nuevo) — `summarizeHistory()` puro: agrega
    trends por protocolo, deriva la tasa de éxito y ordena por volumen. Con test
    (`history.test.ts`, 3 casos incluido el de lake vacío → 0, no `NaN`).
  - `collect.ts` — décima tarea del `Promise.allSettled` (`REPORT_STEPS` 9→10,
    la barra de progreso ya lo refleja). Rango **fijo en `1y`**, a propósito: el
    resto del reporte está ventaneado al período pedido contra Postgres, y el
    valor de esta sección es justo el contexto que queda **fuera** de esa
    ventana. Si ClickHouse está caído/no configurado el fetch rechaza, el
    `allSettled` lo degrada a `history: null` y la sección **no se renderiza**
    (nada de mostrarla vacía y parecer "no hubo actividad en un año").
  - `components/reports/report-view.tsx` — sección nueva con los primitivos que
    ya existían (`Kpi`/`Bars`/`Table`), sin componentes ni charts nuevos. Como
    el PDF sale del mismo HTML por `window.print()` (Fase 1.6), la sección entra
    al PDF gratis, sin tocar nada del path de generación.
  - 4 claves nuevas en `dicts/reports.ts` (`en` + `es`).
  - Validación: `tsc --noEmit` limpio en dashboard e ingest-api; 102 tests del
    dashboard en verde.
  - **Pendiente:** verlo contra datos reales — hoy el lake solo tiene desde el
    27/07, así que hasta que corra el backfill de 3c la sección "12 meses" va a
    mostrar semanas, no meses.
- Fase G (experiencia visual de Analytics) — **implementación completa,
  QA visual con datos pendiente (2026-07-27):**
  rediseño del frontend autorizado para convertir los endpoints A-E en una
  vista operativa útil. La dirección visual es una “signal room” sobria:
  jerarquía KPI → tendencia → distribución → detalle, gráficas mixtas y
  controles de exploración compartidos. El alcance incluye overview,
  credenciales, Suricata y comparación; no cambia contratos ni scoping del
  backend. Implementado el primer pase visual: componentes compartidos de
  métricas/rango/modo/tooltip; overview con cards, área-barra-línea, brush y
  donut; credenciales con composición barra+línea y ranking horizontal;
  Suricata con modos de serie, distribución y ranking; comparación con KPIs,
  modos de serie y share por entidad. Pendiente validación visual responsive,
  accesibilidad y ajustes derivados del QA. Validación técnica: `tsc --noEmit`,
  build de producción de Next.js y 71 tests del dashboard en verde. El intento
  de QA en navegador llegó al onboarding `/setup` porque el entorno local no
  tiene una sesión/instalación configurada; repetir el pase desktop+móvil con
  una sesión válida y datos reales de ClickHouse.
- Fase G-backend (datos para exploración visual) — **backend implementado
  (2026-07-27):** por definición explícita de alcance, este hilo trabaja solo
  `ingest-api`; el frontend queda a cargo de otra persona. Se absorben H1 y H3:
  tendencias tenant-scoped por sensor y ranking global cross-fuente de
  atacantes. Ambos reutilizan el lake/scoping/cache actual y no agregan proxies
  ni componentes al dashboard. Implementados repositorio/servicio/rutas y
  pruebas de SQL, normalización, directorio de sensores, contrato HTTP, límites
  y propagación de scope. El `UNION ALL` normalizado de las cuatro fuentes quedó
  extraído en `analytics-all-events.repository.ts` y es compartido por Trends,
  comparación y ranking. Validación local: build TypeScript limpio y suite
  completa de `ingest-api` en verde (190 tests; 35 integraciones omitidas por
  no tener `TEST_DATABASE_URL`). Pendiente solo contrastar resultados/latencia
  con ClickHouse real después del backfill.

El resto de este plan detalla las Sub-fases 3d/3e de
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

**Fase A ya implementada es la referencia viva de todo lo de abajo** —
`apps/ingest-api/src/modules/analytics/*`, `lib/clickhouse.ts`,
`lib/clickhouse-scope.ts`, `plugins/clickhouse.ts`,
`apps/dashboard/app/api/analytics/trends/route.ts`,
`apps/dashboard/components/analytics/*`. Ante cualquier duda de "¿cómo hago
esto en Fase B/C/D?", el código de Fase A responde más confiable que el
prosa de abajo (el código no se desactualiza solo).

### Backend — capas (regla de `docs/project-notes/backend-layering.md`)

Módulo `apps/ingest-api/src/modules/analytics/` (ya existe, extender ahí —
no crear uno nuevo):

- **`lib/clickhouse.ts` + `plugins/clickhouse.ts`** — YA IMPLEMENTADOS, no
  tocar el patrón: el cliente se crea (y `fastify.clickhouse` se decora) en
  cuanto `CLICKHOUSE_URL` está presente — **sin** gatear en un ping de
  conexión al boot. Un ping ahí perdió una carrera real en prod contra el
  arranque de ClickHouse (`ingest-api`/`clickhouse` no tienen `depends_on`
  entre sí, a propósito) y dejó el módulo desactivado para toda la vida del
  proceso — ver "Estado" arriba, bug #1. La disponibilidad real se descubre
  **por request**: cada controller envuelve su query en `try/catch` y
  devuelve `503` si falla (ver `analytics.controller.ts`, `getTrends`) — así
  un ClickHouse caído/lento se recupera solo en el próximo request. Cualquier
  endpoint nuevo (Fase B en adelante) sigue este mismo `try/catch` → `503`,
  no un chequeo de disponibilidad al boot.
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

**Antes de tocar Server/Client Components acá, leer
[docs/project-notes/dashboard-dev-conventions.md](../project-notes/dashboard-dev-conventions.md)**
— tiene el gotcha real de RSC (pasar una función/componente de un Server
Component a uno `"use client"` compila con `tsc` pero explota en runtime con
recursión infinita) que ya mordió una vez en `/iocs`, más las convenciones de
testing y el trap de Tailwind purge en prod.

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
- i18n: Fase A agregó sus claves a `apps/dashboard/lib/i18n/dicts/analytics.ts`
  (un solo archivo, no uno por fase como sugería la versión original de este
  plan). Seguir sumando ahí mientras quede bajo ~150 líneas (regla de
  `CLAUDE.md`); recién partirlo en `analytics-credentials.ts` etc. si lo
  supera — YAGNI antes de eso. Strings fuente en inglés.
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

## Fase G — Experiencia visual e interacción

**Objetivo:** que un analista pueda responder en segundos cuánto cambió la
actividad, qué fuente concentra el riesgo y dónde debe investigar, sin leer
tablas crudas.

**Dirección y estructura (2026-07-27):**

1. Overview con cards de volumen, protocolos, pico y momentum; gráfica principal
   interactiva, distribución por protocolo y ranking con share.
2. Credential Intelligence con KPIs de intentos/éxito/campañas, composición
   intentos vs. tasa de éxito y visualización de concentración de combinaciones.
3. Suricata con volumen, severidad y concentración, serie temporal y ranking de
   firmas/categorías.
4. Comparison con KPIs globales, share por entidad, ranking y cambio entre
   vistas cliente/sensor.
5. Estados loading/empty/error coherentes, tooltips legibles, responsive,
   navegación por teclado y respeto por `prefers-reduced-motion`.

**Criterios de aceptación:**

- Las gráficas derivan exclusivamente de endpoints tenant-scoped existentes.
- Cada visual explica unidad, rango y agrupación; no usa “números bonitos” sin
  significado operativo.
- El selector temporal y los patrones de cards/gráficas son compartidos (DRY).
- Las librerías pesadas de visualización se cargan solo en rutas de Analytics.
- Verificación visual en desktop y viewport móvil, además de TypeScript/lint.

### Fase G-backend — contratos de datos

Alcance acordado el 2026-07-27: implementar únicamente backend; cualquier
consumo o representación visual queda fuera de este hilo.

1. `GET /analytics/trends/by-sensor?range=&sensorIds=` devuelve
   `{ bucket, sensorId, sensorName, count }[]`. Usa scope tenant normal, no el
   gate global-superadmin de `/analytics/comparison`; el nombre se resuelve en
   el servicio mediante el directorio Postgres existente.
2. `GET /analytics/top-attackers?range=&limit=&sensorIds=` devuelve
   `{ srcIp, count, firstSeen, lastSeen, sources }[]`, agregado sobre las cuatro
   fuentes del lake y limitado obligatoriamente por `ClickHouseScope`.
3. Las rutas solo validan/scopian/responden; SQL exclusivamente en repositorios,
   composición y normalización en servicios, cache separado por rango/límite y
   `scope.cacheSuffix`.
4. Tests de consulta segura, propagación de scope, mapeo de sensor, contrato
   HTTP y `503` sin ClickHouse. Validación contra datos reales sigue en la deuda
   operativa hasta disponer del lake/backfill.

**Implementado (2026-07-27):** `AnalyticsComparisonService` expone la serie
scoped de sensores reutilizando su repositorio/directorio; el nuevo
`AnalyticsRankingRepository` agrega atacantes sobre el subquery común de las
cuatro fuentes y `AnalyticsRankingService` normaliza/cachea el contrato. Las dos
rutas quedaron registradas en `analytics.controller.ts`, sin cambios en
`apps/dashboard`.

**Frontend de G-backend + H2 implementado (2026-07-27, mismo día):** 3
proxies nuevos en `app/api/analytics/*` (mismo patrón que los 7 existentes):
`trends/by-sensor/route.ts`, `top-attackers/route.ts`,
`report-summary/route.ts` (este último no existía — Fase F nunca lo había
conectado). Cambios en `/analytics`:
- **H1 (desglose por sensor):** `trends-chart.tsx` ganó un toggle
  "By protocol / By sensor" (mismo patrón visual que el toggle
  signature/category de `suricata-trends-chart.tsx`) en vez de una página
  separada — la fila de datos de `/trends/by-sensor` se remapea a la forma
  `{bucket, protocol, count}` antes de pivotear, así el `pivot()`/KPI/chart
  existentes de Fase A se reusan sin duplicar código. Los colores de sensor
  usan el mismo ciclo categórico que `comparison-chart.tsx` (no hay mapa
  canónico de color por sensor como sí existe para protocolos).
- **H2 (resumen ejecutivo):** nuevo `components/analytics/overview-summary.tsx`
  arriba del Trends Explorer — 3 `StatCard` (eventos totales 30d, tasa de éxito
  de credenciales, top combo) alimentados por `report-summary`. Rango fijo a
  30d a propósito (es un snapshot, no otro selector interactivo — el Trends
  Explorer de abajo ya da control total del rango).
- **H3 (top atacantes):** nuevo `components/analytics/top-attackers-table.tsx`
  entre el Trends Explorer y las tarjetas de navegación — selector de rango
  propio, filas clickeables a `/threats/[ip]` (mismo patrón `onClick` +
  `cursor-pointer` que la tabla de campañas de credenciales).
- 15 claves i18n nuevas en `analytics.ts` (90 líneas, sigue bajo el límite de
  150 de `CLAUDE.md`).
- Validado: `tsc --noEmit` limpio, 71 tests en verde, build de producción sin
  errores (rutas `/api/analytics/trends/by-sensor`, `/api/analytics/top-attackers`,
  `/api/analytics/report-summary` generadas). QA visual en navegador con datos
  reales sigue pendiente (mismo motivo que el resto de Fase G: sin ClickHouse
  local ni sesión autenticada disponibles en este entorno).
- Fase F sigue con la otra mitad pendiente: `report-summary` ahora se consume
  en `/analytics`, pero `/reports` (el PDF) todavía no lo usa.

**QA visual real, dos bugs encontrados y corregidos (2026-07-27, mismo día):**
el usuario mandó screenshots de `/analytics` con datos reales de prod — la
primera verificación visual real de todo lo construido en Fase G/H. Encontró:
1. **Overview mostraba "170,142,279,210,162,014,029,917" eventos totales.**
   ClickHouse serializa los counts como **strings** (precisión de UInt64), y
   `overview-summary.tsx` sumaba con `+` sin `Number(...)` — `0 + "123"` en JS
   da el string `"0123"`, no el número 123, así que cada `reduce` iba
   *concatenando* dígitos en vez de sumarlos. El resto del módulo (Fase A-G)
   ya se defendía de esto en todos lados (`Number(point[protocol] ?? 0)` en
   `trends-chart.tsx`, `Number(row.count)` en `analytics-ranking.service.ts`
   del backend) — el código nuevo de esta sesión (`overview-summary.tsx`,
   `top-attackers-table.tsx`) no seguía esa convención. Corregido: `Number(...)`
   antes de cualquier `+`/`.toLocaleString()` sobre un campo numérico venido
   de un endpoint de analytics, en los 2 archivos nuevos y también en
   `comparison-chart.tsx` (tenía el mismo bug a medias: recasteaba el
   acumulador pero no `row.count`) y en las 6 celdas de
   `credentials-explorer.tsx` que nunca lo tuvieron pero comparten el mismo
   riesgo.
2. **Los timestamps ignoraban la timezone configurada.** Todo el módulo
   (incluida `attacker-timeline.tsx` de Fase C, preexistente) parseaba los
   timestamps de ClickHouse (`"YYYY-MM-DD HH:MM:SS"`, UTC, sin sufijo) con
   `new Date(x.replace(" ","T"))` y los mostraba con `.toLocaleString()` sin
   argumentos — dos bugs apilados: (a) sin `Z`, `new Date(...)` interpreta ese
   string como hora **local del navegador**, no UTC, corriendo la hora real
   según el offset de quien mire la pantalla; (b) `.toLocaleString()` sin
   opciones usa la timezone del navegador, no la configurada en Settings
   (`useTimezone()`/`DASHBOARD_TIMEZONE`) — exactamente el patrón que ya sigue
   el resto de la app (`suricata-client.tsx`, `credential-campaigns.tsx`,
   `timeline-chart.tsx`: `const tz = useTimezone(); formatInTimezone(value, tz, opts)`).
   Corregido: nuevo helper `chTimestampToIso()` en `shared.tsx` (agrega la `Z`
   que falta) + `fmtBucketLabel()` ahora recibe `timezone` como parámetro
   obligatorio; los 4 charts (`trends`, `credentials`, `suricata-trends`,
   `comparison`) y las 3 tablas con timestamps absolutos (`credentials`
   top-combos/campaigns, `top-attackers`, `attacker-timeline`) ahora usan
   `useTimezone()` + `formatInTimezone()`, igual que el resto del dashboard.
   También se limpió un header duplicado en `/analytics/credentials` (la
   tabla de detalle de top-combos repetía el título/descripción del chart de
   al lado — ahora tiene copy propio, `topCombos.tableTitle`/`tableDescription`).
   Validado: `tsc --noEmit` limpio, 71 tests en verde, build de producción sin
   errores, y un script de Node que reproduce el bug de timezone confirmando
   que el fix da la hora correcta en la zona configurada.

**Ajuste de consistencia + interactividad (2026-07-27, mismo día):** el primer
pase visual de Fase G había construido su propio "mini design system" en
`components/analytics/shared.tsx` (tarjeta KPI con badges en gradiente,
acento "sky" hardcodeado, tooltip propio, eyebrow labels) en vez de reusar los
componentes ya establecidos en el resto del dashboard. Corregido:
- `AnalyticsMetric` (custom) eliminado por completo — las 4 páginas
  (`trends-chart.tsx`, `credentials-explorer.tsx`, `suricata-trends-chart.tsx`,
  `comparison-chart.tsx`) ahora usan `StatCard` (`components/ui/stat-card.tsx`)
  directamente, el mismo componente que usan `/suricata`, `/threats`,
  `/web-attacks`, `/iocs` — sin wrapper intermedio (YAGNI, `StatCard` ya
  hacía exactamente el trabajo).
- `RangeSelector`/`ChartModeSelector` (`shared.tsx`): acento activo pasó de
  `bg-sky-500/15 text-sky-300` a `bg-white/[0.08] text-foreground` — el mismo
  tono neutro que ya usaban los selectores inline de tab/groupBy dentro de
  `suricata-trends-chart.tsx`/`comparison-chart.tsx` (antes había dos acentos
  distintos en las mismas páginas) y que usa el segmented control de
  `monitoring/container-stats-chart.tsx`.
- `ChartTooltip` (`shared.tsx`) restyleado a los tokens de `ChartTooltipContent`
  (`components/ui/chart.tsx`): `border-border/50 bg-background rounded-lg`
  en vez de `border-white/10 bg-card/95 backdrop-blur rounded-xl`.
- `ChartHeader`'s eyebrow: de `text-sky-400` a `text-muted-foreground`
  (se mantiene la estructura, se quita el tinte de marca).
- Colores de protocolo en `trends-chart.tsx` (área/barra/línea + donut): de
  `CHART_COLORS[index % ...]` (ciclo arbitrario) a `getProtocolMarkerColor()`
  (`lib/protocol-colors.ts`) — el mismo mapa que usa el mapa en vivo y los
  chips de IP, para que "ssh"/"http" no cambien de color según el orden en
  que llegan del backend. Se agregaron alias `cowrie`→ssh, `web`→http,
  `suricata`→ids a ese mapa (los "protocolos" de nivel superior que devuelve
  `all_events`, sin equivalente previo en el mapa).
- Suricata: donut/ranking/serie ahora colorean por severidad
  (`SEVERITY_COLOR` en `suricata-trends-chart.tsx`, mismo mapeo 1-4 →
  crítico/alto/medio/bajo que `SEVERITY_CONFIG` en `suricata-client.tsx`) en
  vez de un color categórico arbitrario por índice — el color ahora comunica
  riesgo real.
- Nuevas interacciones con datos que ya se pedían al backend pero no se
  mostraban: filas de la tabla de campañas de credenciales navegan a
  `/threats/[ip]` (mismo patrón que `app/threats/threats-table.tsx`); nueva
  tabla de "Top credential combos" con `uniqueIps`/`firstSeen`/`lastSeen`
  (esos 3 campos venían del backend y tenían claves i18n ya reservadas —
  `analytics-credentials.ts` col.username/password/uniqueIps/lastSeen — pero
  nunca se habían renderizado); columna `unknownCount` agregada a la tabla de
  campañas (también fetcheada y descartada antes).
- Deliberadamente fuera de alcance por ahora: migrar los 4 charts a
  `ChartContainer`/`ChartConfig` (`components/ui/chart.tsx`) — es un segundo
  patrón legítimo ya presente en el codebase (`monitoring/container-stats-chart.tsx`
  también usa recharts crudo + tooltip propio en vez de `ChartContainer`), y
  las series de analytics son dinámicas (protocolos/firmas no se conocen en
  build-time), lo que no calza tan bien con un `ChartConfig` estático. Se
  dejó la implementación actual (recharts crudo + `ChartTooltip` restyleado)
  en vez de forzar la migración — agregar si el segundo patrón deja de
  tolerarse. Tampoco se migró `RangeSelector` a `TimeRangeFilter`
  (`components/time-range-filter.tsx`, URL-driven `?range=`) porque maneja un
  set de valores distinto (`7d/30d/90d/1y` vs `24h/7d/30d/all`) — forzarlo
  hubiera sido más complejidad que beneficio.
- Validado: `tsc --noEmit` limpio, 71 tests del dashboard en verde, build de
  producción de Next.js sin errores (rutas `/analytics/*` y sus proxies
  generadas correctamente). QA visual en navegador con datos reales todavía
  pendiente (mismo pendiente que dejó el primer pase de Fase G).

---

## Deuda pendiente de Fases A-G (antes de sumar Fase H)

No es trabajo nuevo — es re-surfacear lo que ya estaba anotado como pendiente
en cada fase para que no se pierda entre tanto texto. **Ninguna de las fases
B, C, D, E, G tiene verificación contra datos reales de ClickHouse todavía**
— todas pasaron `tsc`/tests unitarios pero corrieron sin un ClickHouse local
disponible. Antes (o en paralelo) de construir Fase H:

1. **Correr el backfill (`./scripts/backfill-clickhouse.sh`, Sub-fase 3c de
   KAFKA_LAKE)** — sigue sin correr. Sin esto, cualquier fase nueva se prueba
   contra "un mes de historia" en vez del histórico real.
2. **Fase B vs. matview**: correr Credential Intelligence en paralelo con
   `credential_attempts` y comparar números en una ventana conocida — recién
   ahí se retira el matview (Sub-fase 3e de KAFKA_LAKE, sigue vivo).
3. **Fases C/D/E**: validar latencia y resultados contra ClickHouse con datos
   reales — quedó explícitamente pendiente en las tres.
4. **Fase F**: `report-summary` ya se consume en `/analytics` (H2, ver Fase G
   arriba) — **pero sigue sin conectarse a `/reports`** (el PDF), que era el
   objetivo original de la fase. Esa mitad sigue sin dueño.
5. **Fase G**: QA visual en navegador con datos reales sigue pendiente (dos
   intentos fallidos por falta de sesión/ClickHouse local — ver entradas de
   Fase G arriba).

Si la próxima persona/IA en tocar este módulo tiene acceso a un ClickHouse
con datos (local o prod), resolver 1-3 primero da más valor que features
nuevas: ahora mismo *nada* de B-G está confirmado contra datos reales.

---

## Fase H — Analítica avanzada — **backend completo**

H1 y H3 quedaron implementadas el 2026-07-27 como Fase G-backend para respetar
el alcance solicitado; **las tres (H1, H2, H3) tienen frontend implementado y
conectado el mismo día** (ver entrada de Fase G arriba, "Frontend de
G-backend + H2 implementado").

**Auditoría backend (2026-07-27):** no queda implementación backend pendiente
en esta fase. H1 está cubierta por
`GET /analytics/trends/by-sensor?range=&sensorIds=`; H2 consume el contrato ya
existente `GET /analytics/report-summary?range=&credentialLimit=&sensorIds=`
de Fase F y deliberadamente no requiere otra ruta; H3 está cubierta por
`GET /analytics/top-attackers?range=&limit=&sensorIds=`. Los tres contratos
tienen validación, cache separado por scope y pruebas HTTP/tenant. El bloque
"Backlog sin spec completa" de abajo no forma parte del criterio de salida de
H; deberá convertirse en una fase nueva con decisiones explícitas de schema
antes de implementarse. Auditoría validada con build TypeScript limpio, 17
tests específicos de los contratos H y suite completa de `ingest-api` en verde
(190 tests; 35 integraciones omitidas por falta de `TEST_DATABASE_URL`).

### H1 — Desglose por sensor propio — **implementado (backend + frontend)**

**Objetivo:** hoy un cliente con varios sensores no tiene forma de ver "¿cuál
de mis sensores concentra más actividad?" dentro de `/analytics` — esa vista
existe (Fase E, `bySensor`) pero está **gateada a superadmin** porque cruza
tenants a propósito. Esto es la versión "solo mis sensores", disponible para
cualquier rol.

**Fuente:** el mismo `all_events` (UNION de Fase A) ya trae `sensor_id` por
fila (`analytics.repository.ts` lo selecciona pero lo descarta al agregar
por protocolo) — no hace falta tocar ClickHouse, solo agregar
`GROUP BY sensor_id` además de `toStartOf*(timestamp)`, con el join a nombre
de sensor **en la capa de servicio** vía Postgres (mismo patrón que
`analytics-comparison.service.ts`, pero sin el join a `client_id` — acá el
scope de tenant ya resuelve qué sensores puede ver el usuario).

**Endpoint:** `GET /analytics/trends/by-sensor?range=&sensorIds=` →
`{ bucket, sensorId, sensorName, count }[]` — **scope normal** (`?sensorIds=`
resuelto server-side por `effectiveSensorScope()`, como Fase A/B/D), no el
canal de superadmin de Fase E. Cualquier rol con acceso a analytics lo puede
pedir; el propio scope ya limita a sus sensores.

**UI (referencia para quien conecte el frontend):** el pivot y el gráfico ya
existen en `comparison-chart.tsx` (`tab="bySensor"`) — es prácticamente el
mismo componente sin el tab de cliente ni el gate de superadmin. Vive bien
como una pestaña extra en `/analytics` (Trends) o un tab dentro de la propia
página, no necesita ruta nueva.

**Criterio de salida:** mismo que Fase A — la suma de todos los sensores de
un tenant en una ventana coincide con el total que hoy da `/analytics/trends`
sin desglose.

### H2 — Resumen ejecutivo en `/analytics` — **implementado (frontend, 2026-07-27)**

**Objetivo:** ahora mismo la landing de `/analytics` es solo el Trends
Explorer + 3 tarjetas de navegación — se siente vacía como primera pantalla.
`GET /analytics/report-summary` (Fase F) ya devuelve exactamente lo que hace
falta (volumen histórico + top credenciales + serie de éxito Cowrie) pero
**nadie lo consume** — Fase F lo dejó explícitamente para alimentar
`/reports`, y eso tampoco se hizo (ver deuda pendiente arriba).

**No hay endpoint nuevo que construir.** Esto es 100% trabajo de frontend:
un proxy `app/api/analytics/report-summary/route.ts` (mismo patrón que los
otros 6 proxies) + una tarjeta "Overview" arriba del Trends Explorer en
`app/analytics/page.tsx`. Si la IA de backend llega hasta acá sin nada más
que hacer, este ítem **no es para ella** — es la próxima tarea de frontend,
y de paso resuelve la mitad de Fase F pendiente (la otra mitad, `/reports`,
sigue siendo un trabajo aparte).

### H3 — Top atacantes global cross-fuente — **implementado (backend + frontend)**

**Objetivo:** hoy el único ranking de IPs dentro de analytics vive adentro de
"campañas de fuerza bruta" (solo credenciales). Un ranking que cruce las 4
fuentes — "¿quién nos pegó más este mes, sin importar SSH/web/protocolo/IDS?"
— no existe todavía, y es el punto de entrada natural hacia el perfil
cross-fuente que ya construyó Fase C.

**Fuente:** `all_events` (vista/union de Fase A) `GROUP BY src_ip ORDER BY
count DESC LIMIT N`, con el scope de tenant obligatorio de siempre. Agregar
`min(timestamp)`/`max(timestamp)` como `firstSeen`/`lastSeen`, y qué tablas
aportaron (`groupUniqArray` o equivalente sobre la columna `protocol` ya
normalizada) para poder mostrar de qué vectores viene cada atacante — mismo
uso que ya le da la UI a `protocols: string[]` en la tabla de campañas de
credenciales.

**Endpoint:** `GET /analytics/top-attackers?range=&limit=&sensorIds=` →
`{ srcIp, count, firstSeen, lastSeen, sources: string[] }[]`.

**UI (referencia):** una tabla más en `/analytics` (o su propia sub-ruta),
mismo patrón de fila-clickeable-a-`/threats/[ip]` que ya se implementó en
`credentials-explorer.tsx` (`onClick` + `cursor-pointer`, ver commit
`7b79b72`) — el perfil cross-fuente de Fase C es exactamente lo que se abre
al hacer click.

**Criterio de salida:** mismo criterio de Fase A/E — verificar contra una
consulta equivalente en Postgres para una ventana conocida antes de confiar
en los números.

### Backlog sin espec completa (mencionar, no implementar todavía)

Salieron en la misma conversación pero son más trabajo y menos prioridad que
H1/H3 — anotados para no perderlos, no para que la IA de backend los tome ya:

- **Versiones de largo plazo de las vistas "foto actual" de `/insights`**:
  Bot vs Human (`bot-ratio.tsx`, hoy fijo a 90d contra Postgres), Novelty
  (`novelty-stats.tsx`, atacantes nuevos vs. recurrentes) y MITRE ATT&CK
  (`mitre-matrix.tsx`) — llevarlas a ClickHouse como series temporales
  (¿sube el % de bots en el tiempo? ¿crece la tasa de atacantes nuevos?)
  sería la analítica más "ejecutiva" que le falta a la sección, pero son 3
  fuentes/queries nuevas, no una extensión de lo que ya existe.
- **Geográfico**: `/web-attacks/geo` ya tiene enriquecimiento IP→país: un
  ranking/serie de países atacantes en el tiempo dentro de analytics
  reutilizaría esa base, pero requiere confirmar que el país queda accesible
  desde las tablas de ClickHouse (hoy no está en el schema de 3a/3b, según
  este plan) antes de prometerlo.

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
