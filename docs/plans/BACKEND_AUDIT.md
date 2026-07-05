# Backend Audit & Reorg — ingest-api

Auditoría del backend (`apps/ingest-api`) buscando bugs de seguridad,
correctness y puntos de mejora, más la reorganización de carpetas a
`modules/<domain>/*.controller.ts` que salió de la misma conversación. Hecho
el 2026-07-05 recorriendo los módulos principales (alerts, deception,
sensors, ingest, malware, storage, defense, clients) vía CodeGraph.

## Hallazgos

### 1. `alerts.ts` y `deception.ts` no requieren autenticación — CRÍTICO

Todos los demás módulos de rutas (`clients.ts`, `sensors.ts`,
`sensor-provision.ts`, `ingest.ts`, `protocol.ts`, `suricata.ts`) llaman
`ensureIngestToken(request, reply)` al inicio de cada handler
(`apps/ingest-api/src/lib/ingest-auth.ts:14`). Dos módulos son la excepción:

- `apps/ingest-api/src/routes/alerts.ts` (movido desde entonces a
  [`modules/alerts/alerts.controller.ts`](../../apps/ingest-api/src/modules/alerts/alerts.controller.ts) —
  ver sección de reorganización de carpetas más abajo) —
  `GET /alerts`, `GET /alerts/by-ip/:ip`, `POST /alerts/:id/read`,
  `POST /alerts/read-all`, `DELETE /alerts`, `DELETE /alerts/:id` — **ninguna
  ruta valida el token**. Cualquiera en la red puede leer, marcar como leídas
  o borrar todas las alertas de todos los clientes.
- `apps/ingest-api/src/routes/deception.ts` (movido desde entonces a
  [`modules/deception/deception.controller.ts`](../../apps/ingest-api/src/modules/deception/deception.controller.ts)) —
  en particular `POST /ingest/deception/portscan` (línea 30) es un endpoint de
  **ingesta** sin token, a diferencia de todos los demás `/ingest/*`. Además
  las lecturas (`/deception/overview`, `/nodes`, `/killchain`, `/events`,
  `/portscans`, y las variantes `/clients/:slug/deception/*`) tampoco están
  protegidas.

Es casi seguro un descuido al agregar estos módulos (ver commits
`8e30eaf` correlation alerts y `52d110a` client-scoped deception tab), no una
decisión intencional — el resto del código asume que todo lo que no es
público pasa por `ensureIngestToken`.

**Fix:** agregar `if (!ensureIngestToken(request, reply)) return reply` al
inicio de cada handler en ambos archivos, igual que en `clients.ts`. Revisar
si el dashboard (BFF) ya envía `X-Ingest-Token` en sus llamadas a estas rutas
(`apps/dashboard/lib/api/proxy.ts` → `ingestHeaders()`) — si no, hay que
agregarlo ahí también para no romper el flujo normal.

### 2. `ensureIngestToken` — comparación timing-safe rota

[`apps/ingest-api/src/lib/ingest-auth.ts:14-35`](../../apps/ingest-api/src/lib/ingest-auth.ts):

```ts
const expectedBuf = Buffer.from(expected);
const providedBuf = Buffer.alloc(expectedBuf.length);
Buffer.from(provided).copy(providedBuf);

if (!timingSafeEqual(expectedBuf, providedBuf) || provided.length !== expected.length) {
```

`Buffer.alloc(expectedBuf.length)` crea un buffer de tamaño fijo y
`.copy()` trunca silenciosamente el token recibido si es más largo. El chequeo
de longitud (`provided.length !== expected.length`) sí atrapa el caso, pero
ese chequeo es de tiempo variable y ocurre en el mismo `if` que el
`timingSafeEqual` — el resultado final es correcto, pero el propósito de usar
`timingSafeEqual` (evitar timing attacks) queda parcialmente anulado, porque
la rama de longitud sí filtra por early-exit de JS en el `||`. No es una
vulnerabilidad práctica dado que el secreto es largo y aleatorio, pero es un
uso incorrecto del patrón que vale la pena corregir para que sea
defendible.

**Fix:** comparar longitudes primero con un `if (provided.length !== expected.length) return false` explícito antes de construir los buffers, o usar directamente `timingSafeEqual` solo cuando las longitudes ya son iguales — el patrón estándar de Node.

### 3. SQL dinámico con `$queryRawUnsafe` en `deception.repository.ts`

[`apps/ingest-api/src/modules/deception/deception.repository.ts`](../../apps/ingest-api/src/modules/deception/deception.repository.ts)
usa `$queryRawUnsafe` con placeholders posicionales (`$1`, `$2`...) construidos
a mano combinando `sensorScopeClause(scope, index, col)` con índices que
dependen del orden de los parámetros (ver `getEvents`, `getPortscans`,
`getKillchain`). Ningún valor de usuario se interpola directamente en el SQL
(los valores van todos como parámetros), así que no hay inyección — pero el
cálculo manual de índices (`rowsNodeIdx = 3 + rowsScope.params.length`, etc.)
es frágil: un cambio futuro en el orden de los `Promise.all` o un parámetro
agregado sin actualizar el índice correspondiente rompe la query en runtime
sin que TypeScript lo detecte.

**Fix (mejora, no urgente):** migrar estas queries a `Prisma.sql` con
`Prisma.join` / template tags (como ya hace `web.repository.ts` y
`stats.repository.ts`) en vez de `$queryRawUnsafe` + índices manuales. Elimina
la clase entera de bug "índice de parámetro desincronizado".

### 4. Rutas de sensores no protegidas — revisar `probeSensorPorts`

Confirmar (no llegué a leer `sensor-queries.ts` en detalle) que
`GET /sensors` no expone IPs internas de sensores a un caller sin token — la
ruta si llama `ensureIngestToken` según el grep, así que está bien, pero
vale la pena una pasada rápida al armar el fix de (1) para verificar que no
quedó ninguna otra ruta pública por descuido (grep completo de `fastify.get\(` / `.post\(` / `.patch\(` / `.delete\(` en `routes/` contra los que llaman `ensureIngestToken`).

### 5. `malware.service.ts` — `getDownloadStream` construye rutas con `md5` validado por regex (bien)

`HASH_RE = /^[a-f0-9]{32}$|^[a-f0-9]{64}$/i` valida el hash antes de usarlo en
`join(BASE_PATH, md5)`, así que no hay path traversal — este quedó bien
implementado, lo marco solo para que quede registrado que se revisó.

## Plan de acción

1. **[x] Auth en alerts.ts y deception.ts** (crítico) — hecho 2026-07-05.
   - `ensureIngestToken` agregado a las 6 rutas de `alerts.ts`.
   - `ensureIngestToken` agregado a las 11 rutas de `deception.ts` (incluyendo
     el ingest de portscan y las 5 variantes `/clients/:slug/deception/*`).
   - Verificado (agente de exploración) que el dashboard ya manda
     `X-Ingest-Token` en todas las llamadas a estas rutas: las de `alerts`
     vía `proxyJson`/`proxyGet` (`apps/dashboard/lib/api/proxy.ts` →
     `ingestHeaders()`), y las de `deception` vía `apiFetch`
     (`apps/dashboard/lib/api/client.ts`), que adjunta el header
     centralmente leyendo `INGEST_SHARED_SECRET`. No hizo falta tocar nada
     del dashboard — el fix es transparente para el flujo normal.
   - `POST /ingest/deception/portscan` no tiene ningún caller en el
     dashboard (solo lo llaman los sensores/honeypots directamente).

2. **[x] Arreglar `ensureIngestToken`** — hecho 2026-07-05. Ahora compara
   longitudes primero (`providedBuf.length !== expectedBuf.length`) antes de
   llamar `timingSafeEqual`, sin truncar el buffer recibido.

3. **[x] Migrar `deception.repository.ts` a `Prisma.sql`** — hecho
   2026-07-05. Reemplazado `$queryRawUnsafe` + índices posicionales manuales
   (`sensorScopeClause(scope, index, col)`) por template tags `Prisma.sql` /
   `Prisma.raw` / `Prisma.empty`, mismo patrón que `web.repository.ts` y
   `stats.repository.ts`. `sensorScopeClause` ya no recibe ni calcula
   índices — solo arma el fragmento SQL con el placeholder que Prisma
   resuelve automáticamente. `npx tsc --noEmit` limpio tras el cambio.

4. **[x] Auditoría rápida de rutas públicas** — hecho 2026-07-05, con un
   grep sistemático de `fastify.(get|post|patch|put|delete)(` vs
   `ensureIngestToken` en los 20 archivos de `routes/`. Resultado: **el
   patrón dominante en el proyecto no es "todo protegido"**. La mayoría de
   los módulos (`protocol.ts`, `web.ts`, `suricata.ts`, `sensors.ts`
   parcialmente) solo protegen los `POST /ingest/*` — el punto donde
   escriben los sensores — y dejan las lecturas `GET` sin token, confiando
   en que solo el dashboard/BFF las llama por red interna. `clients.ts` (y
   ahora `alerts.ts`/`deception.ts`) son más estrictos y protegen todo,
   incluidas las lecturas. Se decidió (con el usuario) **no** extender la
   protección a las lecturas de los demás módulos — cambiar ese criterio es
   una decisión de arquitectura más amplia, no un bug puntual, y el objetivo
   de esta pasada era cerrar el hueco de escritura/ingesta sin auth, que sí
   era crítico. Ver "Deuda técnica" abajo.

## Deuda técnica (no implementada, documentada a propósito)

- **Lecturas `GET` sin `ensureIngestToken` en la mayoría de los módulos**:
  `api-defense.ts`, `attacksToday.ts`, `client-observability.ts`,
  `events.ts`, `malware.ts` (lecturas de artifacts/lookup, no el ingest),
  `monitoring.ts`, `protocol.ts` (todo menos el POST de ingest),
  `sessions.ts`, `storage.ts`, `suricata.ts` (todo menos el
  POST de ingest), `threats.ts`, `web.ts` (todo menos los dos POST de
  ingest), y `GET /sensors` en `sensors.ts`. Ninguno permite escribir sin
  token — solo exponen lectura si el puerto de ingest-api es alcanzable sin
  pasar por el dashboard. Si en algún deployment `INTERNAL_API_URL` queda
  expuesto fuera de una red privada, esto sí sería un problema de
  confidencialidad (no de integridad). Decisión pendiente: o se documenta
  como "asumido detrás de red privada" en `docs/project-notes/`, o se
  extiende `ensureIngestToken` a todas las lecturas en una pasada aparte
  (fuera del alcance de esta auditoría).
- **Duplicación de lógica de header de auth en el dashboard**: `alerts.ts`
  (BFF) usa `proxyJson`/`proxyGet` (`apps/dashboard/lib/api/proxy.ts`), y
  `deception.ts` usa `apiFetch` (`apps/dashboard/lib/api/client.ts`) — dos
  mecanismos paralelos que ambos adjuntan `X-Ingest-Token` leyendo el mismo
  env var, pero están implementados dos veces. No es un bug, pero vale la
  pena consolidar a una sola fuente de verdad si se toca ese código de
  nuevo (candidato para `DESIGN_PATTERNS.md`, no para este plan).

## 5. Reorganización de carpetas: `routes/` → `modules/<domain>/*.controller.ts`

Hecho 2026-07-05, en la misma sesión, a pedido del usuario: el backend ya
estaba modularizado por dominio (`modules/<domain>/{service,repository}.ts`)
pero los "controllers" (antes `routes/<domain>.ts`) vivían todos juntos en una
carpeta separada, no dentro de su módulo. Se movieron con `git mv` (preserva
historial) los 20 archivos de `routes/` (incluida la subcarpeta
`routes/stats/` con 11 archivos) a `modules/<domain>/`, renombrando cada uno a
`<domain>.controller.ts`:

- Dominios que ya tenían carpeta en `modules/` (alerts, clients, deception,
  events, ingest, malware, monitoring, protocol, sensors, sessions, stats,
  storage, suricata, threats, web) recibieron su controller adentro.
  `clients` y `sensors` recibieron dos controllers cada uno
  (`clients.controller.ts` + `clients.observability.controller.ts`;
  `sensors.controller.ts` + `sensors.provision.controller.ts`), porque ya
  eran dos archivos de rutas separados que comparten el mismo service.
- Dominios sin carpeta propia (`health`, `live`, `attacksToday` →
  `attacks-today`, `api-defense`) recibieron una carpeta `modules/<nombre>/`
  nueva, con solo el controller adentro (no tienen service/repository propio
  — ver deuda técnica).
- `routes/stats/*.ts` (11 archivos: `index.ts`, `dashboard.ts`,
  `kpi-trends.ts`, `credentials.ts`, `mitre-matrix.ts`, `novelty.ts`,
  `bot-ratio.ts`, `misc.ts`, `timeline.ts`, `types.ts`, `utils.ts`) se movió
  entero a `modules/stats/controllers/`, junto a `stats.repository.ts` (que
  ya vivía en `modules/stats/`).
- `src/routes/` quedó vacío y se eliminó.

Se actualizaron todos los imports afectados: `app.ts` (los 20 registros de
plugin), los imports relativos dentro de cada controller movido (`../lib/` →
`../../lib/`, `../modules/<domain>/x.service.js` → `./x.service.js` al quedar
en la misma carpeta), `stats.repository.ts` (importaba `types.ts`/`utils.ts`
desde la vieja ruta `routes/stats/`, ahora `./controllers/`), y
`lib/cron.ts` (importaba `readSystemMetrics` desde `routes/monitoring.js`,
ahora `modules/monitoring/monitoring.controller.js`). Verificado con
`npx tsc --noEmit` (limpio), `npx tsc` build completo (limpio) y
`npx vitest run` (79/79 tests pasan). Documentado en
[`docs/project-notes/backend-layering.md`](../project-notes/backend-layering.md),
que ahora refleja la nueva convención `modules/<domain>/<domain>.controller.ts`.

No se tocó AdonisJS ni ningún otro framework — se evaluó y se descartó por
ser una reescritura completa (routing, DI, ORM Lucid vs Prisma) para resolver
un problema que ya se resolvía reorganizando carpetas dentro de Fastify.

## 6. Resolución de la deuda técnica del reorg (2026-07-05, misma sesión)

De los 5 puntos de deuda anotados al cerrar la sección 5, se resolvieron los
3 que eran acotados y de bajo riesgo:

- **`lib/cron.ts` importaba de un controller** — se extrajeron
  `readSystemMetrics`, `parseMeminfo`, `parseLoadAvg`, `parseUptime`,
  `parseRedisInfo` (funciones puras, sin `prisma` ni `reply`) de
  `monitoring.controller.ts` a un archivo nuevo,
  [`lib/system-metrics.ts`](../../apps/ingest-api/src/lib/system-metrics.ts) —
  es exactamente el tipo de utilidad pura sin DB que pertenece a `lib/` según
  la regla del propio `backend-layering.md`. `cron.ts` y
  `monitoring.controller.ts` ahora importan desde ahí.
- **`modules/stats/controllers/` con dirección de import invertida** —
  `types.ts` y `utils.ts` se movieron de `modules/stats/controllers/` a
  `modules/stats/stats.types.ts` y `modules/stats/stats.utils.ts` (hermanos
  de `stats.repository.ts`, no hijos de `controllers/`). Los 3 controllers
  que los usaban (`credentials.ts`, `dashboard.ts`, `timeline.ts`) y
  `stats.repository.ts` se actualizaron para importar desde la nueva
  ubicación. La carpeta `controllers/` sigue teniendo 11 archivos de rutas
  (no se aplanó — ver deuda restante abajo) pero ya no hay un import que
  suba desde el repository hacia el controller.
- **`api-defense.controller.ts` y `attacks-today.controller.ts` corrían SQL
  directo** — se les creó `*.repository.ts` (todo el `$queryRaw`/`$executeRaw`)
  y `*.service.ts` (orquestación, mapeo de filas, agregación de geo/país en
  el caso de attacks-today, detección de duplicate-key en el caso de
  api-defense), dejando el controller solo con Zod + llamada al service +
  `reply.send()`, igual que el resto de módulos.

Verificado: `npx tsc --noEmit` limpio, `npx vitest run` 79/79, y probado en
vivo contra el contenedor Docker local (`docker compose up -d --build
ingest-api`) — `GET /api-defense/summary` y `GET /attacks/today` responden
con la forma esperada tras el refactor, y el Kafka consumer llega a
`running`.

No se tocaron los otros 2 puntos de deuda (fuera de alcance de esta pasada,
ver "Deuda técnica restante" abajo):
- La decisión de no endurecer las lecturas `GET` con `ensureIngestToken` en
  el resto de módulos.
- La duplicación de helpers de auth en el dashboard (`proxyJson` vs `apiFetch`).

## Estado

Ítems 1–6 implementados y verificados:
- 1–4 (2026-07-05): hueco crítico de auth cerrado, timing-safe compare
  arreglado, SQL dinámico de deception migrado a `Prisma.sql`, auditoría de
  rutas hecha.
- 5 (2026-07-05): reorganización completa `routes/` →
  `modules/<domain>/*.controller.ts`.
- 6 (2026-07-05, misma sesión): 3 de los 5 puntos de deuda del reorg
  resueltos (`cron.ts`, `modules/stats/controllers` import direction,
  repository/service para `api-defense`/`attacks-today`).

Cada paso verificado con `npx tsc --noEmit`, build completo, y
`npx vitest run` (79/79) — más una verificación en vivo contra Docker local
para los cambios de la sección 6.

## Deuda técnica restante (documentada a propósito, no atacada aún)

- **Lecturas `GET` sin `ensureIngestToken`** en la mayoría de módulos
  (`api-defense`, `attacks-today`, `client-observability`, `events`,
  `malware`, `monitoring`, `protocol`, `sessions`, `storage`, `suricata`,
  `threats`, `web`, y `GET /sensors`). Decisión consciente: es el patrón
  dominante del proyecto (solo se protege la escritura/ingesta), cambiarlo
  es una decisión de arquitectura más amplia, no un bug puntual.
- **Duplicación de helpers de auth en el dashboard**: `alerts` (BFF) usa
  `proxyJson`/`proxyGet`, `deception` usa `apiFetch` — dos mecanismos
  paralelos que hacen lo mismo. Candidato para `DESIGN_PATTERNS.md`, no para
  este plan.
- **`modules/stats/controllers/`** sigue siendo una carpeta de 11 archivos
  en vez de seguir el naming plano `<domain>.controller.ts` del resto de
  módulos — no se aplanó porque partirlo en 11 controllers separados de
  primer nivel sería más ruido que beneficio dado que ya comparten un
  `index.ts` que los registra a todos.
