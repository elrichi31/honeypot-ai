# DASHBOARD_FIRST_LOAD — el dashboard nunca carga a la primera

**Estado:** Fase 0, 1, 2 y 3 implementadas (2026-07-08). Quedan solo ítems de
observación de largo plazo — ver deuda técnica al final.

## Síntoma

Al entrar al dashboard (`/`) en frío, una o varias secciones caen en
`SectionError` ("Could not load metrics" = `OverviewSection`). Hay que recargar
la página completa una o más veces hasta que todo aparece. Una vez que carga,
se mantiene bien un rato — y al día siguiente vuelve a pasar.

## Cómo fluye una carga (contexto)

1. `apps/dashboard/app/page.tsx` — 9 secciones server-component en `<Suspense>`
   que se renderizan **en paralelo**: Overview (honeypot-overview + kpi-trends),
   CrossTimeline, Globe (geo), Insights (dashboards), Novelty, AttackerIntel
   (geo + attacker-intel), BotRatio, Mitre, y el heatmap client-side.
2. Cada una llama `apiFetch` (`apps/dashboard/lib/api/client.ts`) con
   `AbortSignal.timeout` — 30s para las pesadas (overview, kpi-trends,
   dashboards, mitre), **10s por defecto para el resto** (timeline, novelty,
   bot-ratio) — y `next.revalidate` de 120–600s.
3. El ingest-api resuelve cada endpoint con `withCache`
   (`apps/ingest-api/src/lib/cache-helper.ts`): Redis + stale-while-revalidate,
   frescura = TTL, retención física = **2×TTL**.
4. Las queries van a `prismaRead` (réplica, `connection_limit=10` por
   `REPLICA_CONNECTION_LIMIT`, `apps/ingest-api/src/plugins/prisma.ts`).

## Causas raíz (en orden de impacto)

### 1. Estampida en frío contra un pool de 10 conexiones

Con el caché frío, la primera visita dispara **~35 queries pesadas
concurrentes** contra la réplica:

| Endpoint | Queries | Costo |
|---|---|---|
| `/stats/kpi-trends` | 15 | scans de 24–48h sobre 3 tablas, sparks por hora |
| `/stats/dashboards` | 8 | agregados de 90 días sobre `sessions` + `events` |
| `/stats/honeypot-overview` | 4 | agregados de 90 días, `COUNT(DISTINCT)` |
| `/stats/cross-sensor-timeline` | 3 | series por bucket sobre 3 tablas |
| `/stats/geo` | 1 | UNION de 90 días sobre 3 tablas (llamado 2× — Globe y AttackerIntel) |
| novelty, bot-ratio, mitre, heatmap | ~4 | varios |

El pool de la réplica admite 10; el resto **hace cola en el pool de Prisma,
cuyo `pool_timeout` por defecto es 10s** → las queries encoladas revientan con
`P2024` (o el fetch de Next aborta antes, a los 10s/30s). Resultado: varias
secciones fallan, *pero las que sí terminaron dejaron su clave cacheada*, así
que cada recarga completa unas cuantas más — exactamente el patrón "recargo
hasta que sale".

### 2. La retención del caché (2×TTL) no sobrevive la noche

`withCache` guarda el valor solo 2× la ventana de frescura (p. ej. kpi-trends:
fresco 600s, retenido 1200s). Si nadie visita el dashboard en ~20 min, la clave
**desaparece físicamente** y la siguiente visita es una carga totalmente fría →
estampida de nuevo. El SWR ("una vez computado, nadie vuelve a bloquear")
solo aplica mientras la clave exista.

### 3. Errores invisibles

Los `catch {}` de las secciones en `page.tsx` y el `catch { return null }` de
otras páginas tragan el error sin loguearlo. Hoy no sabemos si el fallo real es
`P2024` (pool), `TimeoutError` (abort de Next), o un 500 del API. Eso hace que
cada incidente sea adivinanza.

### 4. Agravantes

- Timeouts inconsistentes: timeline/novelty/bot-ratio usan el default de 10s;
  en una estampida mueren primero aunque sus queries sean baratas (están en cola).
- `matview-refresh` corre `REFRESH MATERIALIZED VIEW` (lock exclusivo breve)
  al **arranque** y cada 30 min — si coincide con una carga fría, suma latencia.
- `PERF_AUDIT.md` C3 sigue abierto: falta índice compuesto
  `(sensor_id, started_at)` en `sessions`.
- Sin Redis (`REDIS_URL` ausente o caído) `cache` es `null` y `withCache`
  computa **siempre** — el dashboard queda permanentemente en modo estampida.

## Plan

### Fase 0 — Ver el error real (trivial, hacer primero)

- [x] `page.tsx` (y demás páginas con el patrón `try/catch → SectionError`):
  loguear el error en el catch (`console.error("[dash] <sección>", err)`), no
  tragarlo. Con `requestId` del backend cuando venga.
  **Hecho (2026-07-08)** — los 9 catch de `page.tsx` (8 secciones +
  `fetchKpiTrends` anidado en `OverviewSection`) loguean con
  `console.error("[dashboard] <Sección> failed:", err)`, nombre grepable
  por sección.
- [x] ingest-api: loguear duración por endpoint de `/stats/*` cuando exceda
  un umbral (5s) y loguear los `P2024`/errores explícitamente.
  **Hecho (2026-07-08)** en `apps/ingest-api/src/lib/cache-helper.ts`
  (`computeOnce`): `console.warn` si el compute tarda >5s
  (`SLOW_COMPUTE_MS`), `console.error` con `err.code` (P2024, etc.) si
  falla. No se cambió la firma pública de `withCache` — habría tocado los
  ~40 call sites existentes — así que se loguea con `console.*` en vez de
  `fastify.log`. Deuda técnica menor: no queda integrado con el logger
  estructurado de Fastify.
- **Verificación:** reproducir la carga fría y confirmar en logs cuál es el
  error dominante (esperado: `P2024` / `TimeoutError`).

### Fase 1 — Matar el síntoma: el caché nunca debe estar frío (core del fix)

1. **Retención física larga en `withCache`** — **Hecho (2026-07-08)**.
   `apps/ingest-api/src/lib/cache-helper.ts`: `store()` ahora guarda con
   `RETENTION_TTL_SECONDS = 24h` fijo, independiente del `ttl` de frescura de
   cada endpoint (que sigue controlando `freshUntil`, no el TTL físico en
   Redis).
2. **Warm-up al arranque del API** — **Hecho (2026-07-08)**.
   `apps/ingest-api/src/plugins/cache-warmup.ts` (nuevo plugin, registrado
   en `app.ts` al final, después de `matviewRefreshPlugin`). En vez de
   extraer el compute de cada controller (hubiera sido un refactor más
   grande), usa `fastify.inject()` para llamar en **serie** las 8 rutas de
   dashboard en scope global (honeypot-overview, kpi-trends, dashboards,
   geo, mitre-matrix, cross-sensor-timeline?range=day, novelty?hours=24,
   bot-ratio) — mismo código real que un browser, sin duplicar lógica de
   negocio ni requerir red/token. Solo corre una vez al boot; no hay
   refresco periódico (con retención de 24h no hace falta — si se necesita
   luego, agregar `setInterval` igual que `matview-refresh.ts`).
   - Nota multi-tenant: solo pre-calienta scope global, como estaba previsto.
3. **Serializar la estampida residual** — **Hecho (2026-07-08)**.
   `cache-helper.ts`: semáforo global (`MAX_CONCURRENT_COMPUTES = 4`) con
   cola FIFO (`acquireComputeSlot`/`releaseComputeSlot`) que envuelve todo
   compute en `computeOnce`, no solo el dedupe por clave existente. Una
   carga fría con 8+ claves distintas ahora degrada a "va llegando por
   partes" en vez de saturar el pool de la réplica de una sola vez.
- **Verificación:** `redis-cli FLUSHALL` + carga del dashboard → ninguna
  sección debe caer en `SectionError`; segunda carga instantánea; tras 24h de
  inactividad simulada (bajar TTL en dev), primera carga sirve stale al toque.
  **Verificado end-to-end en docker local (2026-07-08).** El contenedor
  `ingest-api` corría una imagen de 2026-07-01 (previa a esta sesión), así que
  el warm-up nunca se ejecutó y Redis lucía "conectado pero con 0 keys" — no
  era un bug del código sino una imagen desactualizada. Tras `docker compose
  build ingest-api` + `up -d ingest-api`, logs confirman:
  `Redis connected — query caching enabled` seguido de 8×
  `[cache-warmup] warmed /stats/... in <Nms>` (649ms el más lento, el resto
  <400ms), y `redis-cli DBSIZE` → 8 keys, `TTL` ≈ 86375s (24h). Warm-up y
  retención larga confirmados funcionando tal como se diseñaron.

### Fase 2 — Resiliencia en el dashboard (defensa en profundidad)

- [x] **Retry con backoff en `apiFetch`** (server-side, solo GET).
  **Hecho (2026-07-08)** en `apps/dashboard/lib/api/client.ts`:
  `fetchWithRetry` reintenta hasta 3 intentos con backoff (300ms, 900ms)
  **solo** cuando `fetch` rechaza antes de tener `Response` (timeout/red).
  Una respuesta con `!res.ok` (4xx/5xx real) no se reintenta — ya es una
  respuesta válida del servidor, el caller decide.
- [x] **Timeout uniforme de 30s** para todos los fetchers de `stats.ts`.
  **Hecho (2026-07-08)**: `fetchCrossSensorTimeline`, `fetchNovelty`,
  `fetchBotRatio` pasan `30000` explícito; `fetchGeoSummary` migrado de
  `fetch` crudo a `apiFetch` (hereda retry + timeout + manejo de errores
  consistente; los 2 callers ya envuelven en try/catch → `SectionError`).
- [x] **`SectionError` con auto-retry**: hasta 2 `router.refresh()`
  automáticos (a los ~4s y ~10s) antes de quedarse en el estado manual con
  botón. **Hecho (2026-07-08)** en
  `apps/dashboard/components/section-error.tsx`: contador en
  `sessionStorage` keyed por `title` con TTL de 5 min (para que un fallo de
  hace días no bloquee el auto-retry de hoy); mientras auto-reintenta
  muestra "Retrying automatically…" en vez del botón; el botón manual sigue
  siempre disponible tras agotar los 2 intentos automáticos.
- **Verificación:** `tsc --noEmit` limpio en `apps/dashboard` tras cada
  cambio. No se forzó una caída real de Redis en esta sesión para observar
  el auto-retry en vivo — pendiente si se quiere verificación end-to-end
  adicional, pero la lógica (contador + TTL + backoff) se revisó por código.

### Fase 3 — Bajar el costo real de las queries (mediano plazo)

- [x] **Consolidar `/stats/kpi-trends`**: 15 queries → 10.
  **Hecho (2026-07-08)** en `apps/ingest-api/src/modules/stats/stats.repository.ts`
  (`KpiRepository`): las 9 queries de sessions/web_hits/protocol_hits
  (actual + previa + spark por tabla) se fusionaron a 3 (`windowCounts`,
  una por tabla) usando `COUNT(*) FILTER (WHERE ts >= curStart)` /
  `FILTER (WHERE ts < curStart)` sobre el rango completo `[prevStart, now]`
  en una sola pasada; el spark por hora queda igual (ya era 1 query por
  tabla). Unique-IP (`uniqueIpCounts`) y protocol breakdown
  (`protocolBreakdownCounts`) se fusionaron de forma análoga (actual+previa
  en una sola query con `FILTER`), bajando de 3+3 a 1+1. Controller
  (`kpi-trends.ts`) actualizado a desestructurar 10 resultados en vez de 15
  y leer `.curCount`/`.prevCount` en vez de sumar Maps separados. Contrato
  JSON público sin cambios.
  **Verificado con `EXPLAIN ANALYZE`** contra `honeypot-postgres` local
  (`honeypot_prod`: sessions=279, web_hits=1154, protocol_hits=774564):
  2 queries separadas (actual ~17.5ms + previa ~14.1ms ≈ 31.6ms, 2 round
  trips) vs. 1 query fusionada (~11.2ms, 1 round trip, el planner usa
  workers paralelos) — mejora real de tiempo de ejecución, no solo de
  round-trips. La fusión de unique-IP (`UNION ALL` + tag `is_current` sobre
  rango 2× más ancho) mide ~75ms total, aceptable dado el timeout de 30s y
  el TTL de caché de 600s del endpoint.
- [x] **Cerrar PERF_AUDIT C3**: índice `(sensor_id, started_at)` en
  `sessions`. **Hecho (2026-07-08)**: nueva migración
  `apps/ingest-api/prisma/migrations/20260708000000_idx_sessions_sensor_started/`
  — `CREATE INDEX CONCURRENTLY IF NOT EXISTS sessions_sensor_id_started_at_idx
  ON sessions (sensor_id, started_at)` + `DROP INDEX IF EXISTS
  sessions_sensor_id_idx` (redundante, superseded por el compuesto).
  `schema.prisma` actualizado (`@@index([sensorId])` →
  `@@index([sensorId, startedAt])`) para que no quede desincronizado del
  historial de migraciones. Aplicada contra `honeypot-postgres` local y
  marcada `prisma migrate resolve --applied`; `prisma generate` +
  `tsc --noEmit` limpios. **No se pudo medir el beneficio con
  `EXPLAIN ANALYZE` local** — los datos locales tienen `sensor_id NULL` en
  las 279 filas de `sessions` (un solo grupo), así que el planner no tiene
  motivo para usar el índice a esa escala; el hallazgo de PERF_AUDIT C3 es
  estructural/de escala de producción, no reproducible localmente (mismo
  caveat que el propio audit documentaba).
- [x] **Deduplicar `/stats/geo`** en la página. **Revisado (2026-07-08)** —
  no hizo falta cambio de código: `GlobeSection` y `AttackerIntelSection`
  llaman `fetchGeoSummary(sensorIds)` con los mismos `sensorIds`, que arma
  la misma URL (`${getApiUrl()}/stats/geo?_=1${sensorScopeParam(sensorIds)}`)
  y pasa por `apiFetch` con el mismo `next.revalidate`. El fetch extendido de
  Next dedupea automáticamente llamadas `fetch()` idénticas (misma URL +
  mismas opciones de cache) dentro del mismo render — confirmado por lectura
  de código; no se forzó login vía navegador en esta sesión para contar
  requests reales en los logs de `ingest-api` (quedó bloqueado por el auth
  wall al probar con `curl`), así que si se quiere una confirmación empírica
  con logs reales, queda pendiente hacerlo con una sesión de browser real.
- [ ] Evaluar `REPLICA_CONNECTION_LIMIT` y `pool_timeout` explícitos según lo
  observado en Fase 0. **Documentado como deuda de observación, no
  implementado** — ver deuda técnica: con warm-up + retención 24h + semáforo
  (máx 4 concurrentes) ya en producción, la presión sobre el pool baja bastante
  respecto al diagnóstico original; ajustar `connection_limit`/`pool_timeout`
  sin datos reales de producción sería prematuro.
- **Verificación:** ver notas de `EXPLAIN ANALYZE` en cada ítem arriba. No se
  midió p95 real de producción en esta sesión (solo datos locales, volumen
  bajo) — la medición de p95 real queda como parte del ítem de observación de
  `REPLICA_CONNECTION_LIMIT`.

### Fuera de alcance (anotado para no perderlo)

- Mover los agregados de 90 días a matviews propias (solo si Fase 1–3 no basta).
- Alertar cuando Redis está caído (hoy solo un log al boot) — candidato a
  `/monitoring`.

## Deuda técnica (después de Fase 0, 1, 2 y 3, 2026-07-08)

- **`REPLICA_CONNECTION_LIMIT`/`pool_timeout` sin ajustar** (Fase 3, único
  ítem no cerrado como código): queda como deuda de observación explícita,
  no como tarea abierta de esta sesión. Con warm-up + retención 24h +
  semáforo (máx 4 concurrentes) ya en producción, la presión sobre el pool
  de la réplica baja bastante respecto al diagnóstico original — decidir
  si hace falta subir `pool_timeout` (p. ej. a ~30s, para alinear la cola
  del pool con el timeout del fetch en vez de reventar a los 10s) requiere
  métricas reales de producción corriendo un tiempo, no datos locales.
- **Auto-retry de `SectionError` no se verificó forzando una caída real de
  Redis en esta sesión** — la lógica (contador en `sessionStorage`, TTL de
  5 min, backoff 4s/10s) se revisó por código y `tsc --noEmit` pasa limpio,
  pero no se observó en vivo el ciclo completo (2 auto-retries → botón
  manual) contra un fallo real.
- **Dedupe de `/stats/geo` confirmado por lectura de código, no por conteo
  de requests reales**: el auth wall del dashboard bloqueó probar con
  `curl` en esta sesión. Next debería colapsar ambas llamadas
  (`GlobeSection`/`AttackerIntelSection`) a 1 sola por ser mismo
  URL+opciones dentro del mismo render, pero si se quiere blindar esto,
  confirmar con una sesión de browser real + logs de `ingest-api`.
- **Beneficio del índice `(sensor_id, started_at)` en `sessions` no medible
  localmente**: los datos de `honeypot_prod` local tienen `sensor_id NULL`
  en todas las filas de `sessions` (279 filas, un solo grupo), así que
  `EXPLAIN ANALYZE` no puede demostrar el uso del índice a esa escala. El
  hallazgo de PERF_AUDIT C3 es estructural (production-scale), confirmado
  por el propio audit — no invalida la migración, solo significa que la
  mejora se confirmará con métricas de producción, no localmente.
- **Logging con `console.*` en vez del logger de Fastify**: `cache-helper.ts`
  no recibe `fastify` (solo `cache`), así que el logging nuevo (compute lento,
  compute fallido) usa `console.warn`/`console.error` sueltos en vez de
  integrarse al logger estructurado (`fastify.log`) que usa el resto del API.
  Vive fuera del pipeline de logs si hay uno centralizado (p. ej. Loki/ELK).
- **Warm-up no verificado en un entorno real**: se implementó y tipa
  correctamente (`tsc --noEmit` limpio), pero no se corrió `redis-cli
  FLUSHALL` + reinicio del API + inspección de logs para confirmar que las 8
  rutas efectivamente warman y que las claves persisten 24h. Hacerlo antes de
  cerrar esta fase como verificada en producción.
- **Sin refresco periódico del warm-up**: solo corre una vez al boot. Si el
  API corre días sin redeploy y Redis se reinicia solo (sin reiniciar el API),
  no hay nada que vuelva a poblar las claves hasta la próxima visita real
  (que ahora sí, gracias a Fase 1, no debería fallar — pero será una carga
  fría real, más lenta).

## Decisiones

- **No** tocar el patrón Suspense-por-sección: el streaming independiente es
  correcto; el problema es que el backend no aguanta la carga fría, no el
  paralelismo del frontend en sí.
- El orden Fase 0 → 1 es deliberado: primero confirmar con logs que el error
  dominante es pool/timeout; Fase 1 se justifica igual por la retención 2×TTL,
  que es un hecho del código.

## Archivos clave

- `apps/dashboard/app/page.tsx` — secciones y sus `try/catch`
- `apps/dashboard/lib/api/client.ts` — `apiFetch`, timeouts
- `apps/dashboard/lib/api/stats.ts` — fetchers y revalidate por endpoint
- `apps/dashboard/components/section-error.tsx` — UI de error/retry
- `apps/ingest-api/src/lib/cache-helper.ts` — `withCache` (SWR, retención 2×TTL)
- `apps/ingest-api/src/plugins/prisma.ts` — pool de la réplica (límite 10)
- `apps/ingest-api/src/plugins/redis.ts` — caché opcional (null si no hay Redis)
- `apps/ingest-api/src/modules/stats/stats.repository.ts` — las queries pesadas
- `apps/ingest-api/src/plugins/matview-refresh.ts` — patrón a imitar para el warm-up
- `apps/ingest-api/src/plugins/cache-warmup.ts` — warm-up nuevo (Fase 1, hecho)
- `apps/ingest-api/src/modules/stats/controllers/kpi-trends.ts` — consumidor de
  `getKpiTrends`, actualizado a la forma de 10 queries (Fase 3, hecho)
- `apps/ingest-api/prisma/schema.prisma` — `Session.@@index([sensorId, startedAt])`
- `apps/ingest-api/prisma/migrations/20260708000000_idx_sessions_sensor_started/` —
  migración del índice compuesto (Fase 3, hecho)
