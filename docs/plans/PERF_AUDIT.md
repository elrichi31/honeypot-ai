# PERF_AUDIT — auditoría + plan de resolución de rendimiento

**Estado:** Implementado — 2026-06-24. A1, C1, C2, D1, B1, B2, M1, M2 resueltos.
M3 implementado 2026-07-05 (métricas de ingesta). C3 auditado 2026-07-07 (ver
sección). Pendiente: A2/D2 — requieren datos reales del endpoint de M3 bajo
tráfico de producción.
Complementa [MONITORING_PERF.md](MONITORING_PERF.md) (ya resuelve la saturación de
`dockerd`). Aquí están el resto de cuellos de botella detectados barriendo
`ingest-api` y `dashboard`, con **el arreglo paso a paso** para cada uno.

Hallazgos verificados con archivo:línea. Las tareas incluyen el código del fix,
los archivos a tocar y cómo verificar.

> Refinamiento tras lectura de cerca:
> - El insert por evento **no** es 1×1 ingenuo: `event.repository` ya usa
>   `createMany({ skipDuplicates })` (1 call) y `session.repository` usa `upsert`
>   (1 call). El costo real por evento son **dos round-trips secuenciales**
>   (`session.upsert` → `event.createMany`) + la construcción de objetos por
>   request.
> - **A1 aplica al hot-path REAL de producción**: el consumidor de Kafka
>   ([`kafka-consumer.ts:45`](../../apps/ingest-api/src/plugins/kafka-consumer.ts#L45))
>   instancia `new IngestService` **por cada mensaje**, no solo el endpoint HTTP
>   de fallback. Sube la prioridad de A1.

---

## A. Hot-path de ingesta — corre bajo ataque (máxima prioridad)

### A1 — Reusar `IngestService` / `SuricataService` en vez de instanciar por evento ⚠️ ✅ 2026-06-24
**Evidencia:**
- Kafka (producción): [`kafka-consumer.ts:45`](../../apps/ingest-api/src/plugins/kafka-consumer.ts#L45)
  `new IngestService(fastify.prisma)` y [`:57`](../../apps/ingest-api/src/plugins/kafka-consumer.ts#L57)
  `new SuricataService(...)` — **por mensaje**.
- HTTP (fallback): [`ingest.ts:37,56,88,135`](../../apps/ingest-api/src/routes/ingest.ts#L37)
  `new IngestService` **por request**.
- Contraste: el resto de rutas instancian **una vez** en el closure del plugin
  (`monitoring.ts:81`, `stats/*`, …).

**Por qué cuesta:** `new IngestService` crea además `new SessionRepository` +
`new EventRepository` (ver [`ingest.service.ts:15-19`](../../apps/ingest-api/src/modules/ingest/ingest.service.ts#L15-L19)).
Bajo ataque = miles de eventos → asignación + GC proporcional al volumen, justo
en el punto más caliente. `IngestService` es **stateless** salvo el `prisma`
inyectado (verificado: sin estado mutable por request) ⇒ compartir es seguro.

**Arreglo (Kafka):** crear los services una vez al registrar el plugin y pasarlos
a los handlers.
```ts
// kafka-consumer.ts — dentro de fp(async (fastify) => { ... }), tras validar brokers
const ingestSvc   = new IngestService(fastify.prisma)
const suricataSvc = new SuricataService(fastify.prisma, fastify.prismaRead)
// handleCowrie/handleSuricata reciben el svc por parámetro en vez de instanciarlo
```
**Arreglo (HTTP):** subir `const service = new IngestService(fastify.prisma)` al
cuerpo de `ingestRoutes` (una vez) y reusarlo en los 4 handlers.

**Riesgo:** bajo. **Verificación:** suite verde + ingesta de un batch real;
confirmar mismo conteo de sessions/events. Opcional: medir RSS/GC bajo carga
sintética antes/después.

### A2 — (Investigación) Colapsar los 2 round-trips por evento ⏳ requiere M3 primero
**Evidencia:** [`ingest.service.ts:21-28`](../../apps/ingest-api/src/modules/ingest/ingest.service.ts#L21-L28)
hace `await sessionRepo.upsert(...)` y **luego** `await eventRepo.createIfNotExists(...)`
— secuencial porque el event necesita el `sessionDbId`. Con Kafka procesando
mensaje a mensaje, son 2 viajes a Postgres por evento en serie.

**Opciones (medir antes de elegir):**
1. **Batch a nivel de consumidor.** `eachBatch` de kafkajs en vez de
   `eachMessage`: agrupar N mensajes, hacer los upserts de sesión y los inserts
   de evento en 2 `createMany`/transacción por lote. Mayor ganancia, más cambio.
2. **Pipeline con `protocol-batch` existente.** Ya hay un batcher probado
   ([`protocol-batch.ts`](../../apps/ingest-api/src/lib/protocol-batch.ts)); evaluar
   un patrón equivalente para events.
3. **No tocar** si el throughput actual sobra. Decisión basada en métricas: medir
   eventos/s sostenibles hoy vs. pico de ataque observado.

**Acción:** instrumentado 2026-07-05 (M3): `GET /health/ingest-metrics` ya da
latencia p50/p99 de `processLine` y eventos/s reales. **Falta:** observar esos
números bajo tráfico de producción real (o un ataque real, no sintético) antes
de elegir entre las 3 opciones — no especular con datos de desarrollo/idle.

---

## B. Frontend — conexiones SSE

### B1 — Unificar el doble `EventSource` en un provider compartido ✅ 2026-06-24
**Evidencia:** [`use-live-stream.ts:47`](../../apps/dashboard/hooks/use-live-stream.ts#L47)
y [`live-attack-map.tsx:128`](../../apps/dashboard/components/live-attack-map.tsx#L128)
abren **cada uno** `new EventSource("/api/events/live")`. Mapa + sidebar montados
⇒ 2 conexiones SSE por usuario; el `eventBus` hace fan-out a ambas.

**Arreglo:** un `LiveStreamProvider` (contexto React) que mantiene **una**
conexión y expone una API de suscripción:
```tsx
// components/live-stream-provider.tsx
const LiveStreamCtx = createContext<{ subscribe: (h: LiveStreamHandlers) => () => void }>(...)
// abre 1 EventSource en useEffect([]), guarda un Set<handlers>, despacha a todos.
// useLiveStream() pasa a leer del contexto en vez de abrir su propio ES.
// live-attack-map deja de crear su ES y usa subscribe({ onAttack }).
```
Montar el provider alto en el árbol (layout). Riesgo medio (toca 2 componentes +
1 nuevo); alto valor en multiusuario. Mantener el contrato de eventos intacto.

**Verificación:** dashboard con mapa + sidebar visibles → contar conexiones a
`/events/live` en el backend = 1 por usuario.

### B2 — Reconexión SSE con backoff + jitter ✅ 2026-06-24
**Evidencia:** ni `use-live-stream.ts` ni `live-attack-map.tsx` manejan
`es.onerror`. EventSource reconecta solo pero sin jitter → al redeploy del
backend, todos los clientes reconectan a la vez (tormenta).

**Arreglo:** en el provider de B1, `onerror` → cerrar, esperar
`min(30s, base * 2^intento) + random(0..1s)`, reabrir. Centralizado en un solo
sitio gracias a B1.

---

## C. Backend — queries y FS

### C1 — `getCowrieDownloadMeta`: escaneo full-table sin LIMIT ✅ 2026-06-24
**Evidencia:** [`malware.repository.ts:62-76`](../../apps/ingest-api/src/modules/malware/malware.repository.ts#L62-L76)
`SELECT … FROM events WHERE event_type='file.download' … ORDER BY event_ts DESC`
**sin LIMIT**, y el JS se queda solo con la primera fila por shasum
(`if (!meta.has(shasum))`). Trae **toda** la historia de descargas para usar 1
fila por shasum. `events` es la tabla más grande.

**Arreglo:** que Postgres haga el dedup con `DISTINCT ON`:
```sql
SELECT DISTINCT ON (normalized_json->>'shasum')
       normalized_json->>'shasum' AS shasum,
       normalized_json->>'url'    AS url,
       src_ip
FROM events
WHERE event_type = 'file.download' AND normalized_json->>'shasum' IS NOT NULL
ORDER BY normalized_json->>'shasum', event_ts DESC
```
Devuelve N shasums únicos en vez de N descargas. Verificar/crear índice que apoye
el filtro (`event_type, event_ts`) — evaluar índice de expresión sobre el shasum
si el plan lo pide. SQL se queda en el repository (regla de layering).

**Verificación:** `EXPLAIN ANALYZE` antes/después; filas devueltas y tiempo caen.

### C2 — Lectura de artefactos: concurrencia FS sin acotar + sin caché de tipo ✅ 2026-06-24
**Evidencia:** [`malware.repository.ts:47-59,91-99`](../../apps/ingest-api/src/modules/malware/malware.repository.ts#L47-L59)
— `Promise.all` sobre **todos** los archivos: `stat` + abrir + leer 16 bytes +
leer `.meta.json` por archivo. Con muchos artefactos → ráfaga de file descriptors
(riesgo EMFILE) y recálculo del `fileType` en cada listado.

**Arreglo:** (a) acotar concurrencia reusando el helper `mapWithConcurrency`
introducido en MONITORING_PERF (DRY, sin dep nueva); (b) cachear `fileType` por
`(md5, mtime)` en memoria — el contenido de un artefacto es inmutable. Riesgo bajo.

### C3 — (Verificación) Réplica de lectura e índices en stats ✅ auditado 2026-07-07
**Evidencia:** los repos de `stats/*` ya reciben `fastify.prismaRead` (bien).
`getHoneypotOverview` ([`stats.repository.ts:35-70`](../../apps/ingest-api/src/modules/stats/stats.repository.ts#L35-L70))
lanza varias queries en `Promise.all` con cutoff de 90 días sobre
`sessions`/`web_hits`/`protocol_hits`.

**Auditoría (2026-07-07):**
- (a) Grep de control: ninguna ruta de `stats/*` usa `fastify.prisma` (escritura)
  por error — todo pasa por `prismaRead` vía constructor de cada repository.
- (b) Índices: `protocol_hits` sí tiene el compuesto
  `protocol_hits_sensor_id_timestamp_idx (sensor_id, timestamp)`. **`sessions`
  no tiene el equivalente** — solo `sessions_sensor_id_idx` (single-column) más
  el `started_at` sin combinar. Todas las queries de `getHoneypotOverview`,
  `getKpiTrends`, `getWindow`, `getRecurringIps`, etc. filtran
  `WHERE started_at >= cutoff AND sensor_id = ...`, así que el índice compuesto
  faltante es un gap real, no solo una casilla por marcar. No se puede medir el
  impacto con `EXPLAIN ANALYZE` en local (252 filas → seq scan de todos modos),
  pero el gap estructural es independiente del volumen de datos. **Pendiente:**
  crear `CREATE INDEX CONCURRENTLY sessions_sensor_id_started_at_idx ON sessions (sensor_id, started_at)`
  en un cambio aparte (índice nuevo en prod = migración cuidadosa, no bloquea
  el cierre de este plan).
- (c) Confirmado: las páginas pesadas leen de los matviews
  (`stats.repository.ts`, `stats.utils.ts`, `threats.repository.ts`,
  `credentials.ts` controller), no de tablas crudas.

---

## D. Cron y trabajo de fondo

### D1 — Un `cron.schedule` por responsabilidad ✅ 2026-06-24
**Evidencia:** [`cron.ts`](../../apps/ingest-api/src/lib/cron.ts) registra
`SENSOR_HEALTH_SCHEDULE` ('* * * * *') **dos veces** (sensor-health + snapshot de
sistema). MONITORING_PERF ya saca el de contenedores; rematar separando cada
trabajo en su propio schedule nombrado para no tener 2 callbacks compitiendo en
el mismo tick :00.

**Arreglo:** un schedule por trabajo, comentado. Cosmético + evita contención de
event loop en el mismo segundo. Riesgo nulo.

### D2 — (Opcional) Saltar `matview-refresh` si no hubo inserts
**Evidencia:** [`matview-refresh.ts:67`](../../apps/ingest-api/src/plugins/matview-refresh.ts#L67)
refresca 2 matviews cada 5 min **siempre**, aunque las tablas base no cambien.

**Arreglo (solo si las métricas lo justifican):** marca `dirty` puesta por el
hot-path de ingesta; el refresh la consulta y se salta si está limpia. No
implementar sin evidencia de que el refresh pese.

---

## Mejoras propuestas (más allá de tapar los hallazgos)

### Credentials first-load — optimización revertida 2026-07-10

- La consolidación de seis agregados con varios `COUNT DISTINCT` en una sola
  query y el warm-up de Credentials causaron timeouts contra el volumen real de
  `credential_attempts`. Se revirtió ese enfoque. Las queries originales se
  mantienen, pero su concurrencia interna se limita a 4 para no agotar el pool
  de 10 conexiones de la réplica; el timeout server-side vuelve a 30 segundos.
- El cache key conserva `protocol`, evitando reutilizar datos de otro protocolo.
- Antes de intentar otra optimización, medir `EXPLAIN ANALYZE` y duración real
  de cada agregado en producción; no reintroducir warm-up sin reducir primero
  la presión total sobre la réplica.
- Los tabs ahora cargan su propia respuesta desde el cliente y mantienen una
  caché en memoria por combinación de filtros. El resumen y los datos visibles
  no se reemplazan durante la carga; el cambio deja de navegar/renderizar de
  nuevo toda la página. Pendiente: medir y dividir el endpoint si la primera
  carga de un tab sigue excediendo el umbral aceptable.
- Commits: [`c43fd2d`](https://github.com/elrichi31/honeypot-ai/commit/c43fd2d), [`a34b4d8`](https://github.com/elrichi31/honeypot-ai/commit/a34b4d8), [`34fc42a`](https://github.com/elrichi31/honeypot-ai/commit/34fc42a), [`35e980a`](https://github.com/elrichi31/honeypot-ai/commit/35e980a), [`635a8f2`](https://github.com/elrichi31/honeypot-ai/commit/635a8f2), [`7aaf1dc`](https://github.com/elrichi31/honeypot-ai/commit/7aaf1dc).

- **M1 — Helper de concurrencia compartido.** ✅ 2026-06-24 — `lib/concurrency.ts`
  exporta `mapWithConcurrency`; `docker-stats.ts` y `malware.repository.ts` lo importan.
- **M2 — Instancia de service por plugin como convención explícita.** ✅ 2026-06-24 —
  documentado en `docs/project-notes/backend-layering.md` (sección Instantiation).
- **M3 — Métricas de ingesta.** ✅ 2026-07-05 —
  [`lib/ingest-metrics.ts`](../../apps/ingest-api/src/lib/ingest-metrics.ts):
  ring buffer de 1000 muestras en memoria (sin deps nuevas) para p50/p99 de
  `processLine`, más contador total y eventos/s (ventana de 10s). Medido en el
  hot-path real de producción: `kafka-consumer.ts`'s `handleCowrie` envuelve
  `svc.processLine(event)` con `performance.now()` antes/después. Expuesto en
  `GET /health/ingest-metrics` (nuevo, en
  [`health.controller.ts`](../../apps/ingest-api/src/modules/health/health.controller.ts)).
  Tests en
  [`ingest-metrics.test.ts`](../../apps/ingest-api/tests/ingest-metrics.test.ts)
  (percentiles, orden de inserción, wraparound del ring buffer). **No incluye
  lag del consumer group**: kafkajs no lo expone en `eachMessage` (solo estaría
  disponible vía `eachBatch` o una llamada aparte al admin API
  `fetchTopicOffsets` para comparar contra el offset consumido) — se dejó fuera
  para no fabricar un cálculo aproximado poco confiable; si se necesita, es
  trabajo aparte, no una extensión trivial de esto.
- **M4 — Índice de expresión para el shasum** (apoya C1) si `EXPLAIN` muestra
  scan secuencial: `CREATE INDEX CONCURRENTLY ... ON events ((normalized_json->>'shasum'))
  WHERE event_type = 'file.download'`. Una migración, una `CREATE INDEX
  CONCURRENTLY` por archivo (ver nota de proyecto sobre migraciones concurrentes).

---

## D2 — matview `credential_attempts`: CPU de la réplica ✅ 2026-07-07

**Incidente (2026-07-06/07):** la réplica de Postgres consumía CPU sostenida
(133–157%) muy por encima del primary. Causa raíz medida en prod:
`REFRESH MATERIALIZED VIEW CONCURRENTLY credential_attempts` cada 5 min tardaba
232–275 s sobre una vista derivada de ~1.6M filas. `CONCURRENTLY` hace un diff
fila-por-fila (UPDATE/DELETE/INSERT diferencial) del resultado nuevo contra el
viejo → mucho CPU y **WAL enorme**, que la réplica replaya en single-thread.

**Descarte de hipótesis previa:** primero se redujo la ventana de 90→30 días
(migración `20260706120000_credential_attempts_30d_window`), pero al medir en
prod el 100% de las filas ya eran de <30 días (`min(event_ts)` = exactamente 30d
atrás): el honeypot genera ~1.6M intentos de auth cada 30 días. La ventana **no**
era el cuello de botella; el costo es `CONCURRENTLY` sobre el volumen puro.

**Fix aplicado** ([matview-refresh.ts](../../apps/ingest-api/src/plugins/matview-refresh.ts)):
- `REFRESH` normal (TRUNCATE + INSERT) en vez de `CONCURRENTLY`. Salta el diff →
  mucho menos CPU/WAL. Costo: `AccessExclusiveLock` de unos segundos que bloquea
  lecturas del matview, invisible al usuario porque el dashboard lee tras
  `withCache` (TTL 600 s, stale-while-revalidate).
- `MATVIEW_REFRESH_MINUTES` default 5 → **30** (el evento caro corre menos seguido).

**Pendiente / seguimiento:**
- Verificar en prod que el CPU de la réplica bajó y el refresh nuevo tarda menos.
- El índice único `credential_attempts_id_idx` ya no es requerido (era solo para
  `CONCURRENTLY`); se deja porque no molesta. Podría eliminarse en una migración
  futura junto con el `ROW_NUMBER() AS id` si se quiere aligerar el refresh.
- Si el `REFRESH` normal aún pesa demasiado, el siguiente escalón es convertir la
  vista en tabla real y refrescar solo el borde (append de filas nuevas + borrado
  de las expiradas) en vez de reconstruir 1.6M filas.
- `threat_ip_summary` no tiene filtro de ventana (agrega toda la historia); hoy es
  chico (~11MB/7.2k filas) pero vigilar su crecimiento.

---

## Orden de ejecución sugerido

1. **A1** — hot-path real (Kafka + HTTP), cambio pequeño, riesgo bajo, máximo retorno.
2. **C1** — query sin techo, arreglo localizado y medible.
3. **B1 (+B2)** — alto valor multiusuario; B2 sale gratis dentro del provider.
4. **C2 / D1 / M1 / M2** — pulido y consolidación (DRY).
5. **M3** — instrumentación ✅ 2026-07-05. **A2 / C3 / D2** — pendientes,
   ahora decidibles con los datos de `/health/ingest-metrics` (A2) o pendientes
   de auditoría de índices (C3) / evidencia de que el refresh pese (D2).

**Principios:** SQL nuevo solo en repositories; sin dependencias nuevas (reusar
`mapWithConcurrency`); medir antes de las tareas marcadas "investigación".

## Riesgos / notas

- A1: confirmado que `IngestService` no tiene estado por-request → seguro
  compartir; igual correr la suite.
- B1: reestructura el stream del front; aislarlo en un provider para no tocar cada
  consumidor y centralizar reconexión (B2).
- C1: validar que `DISTINCT ON` preserva "meta más reciente por shasum" (la
  semántica que el JS hace hoy con `if (!meta.has)`).
- A2/D2: **no** implementar sin métricas (M3). El insert ya está razonablemente
  optimizado; el siguiente paso es batching, que es más invasivo y solo vale si
  el throughput lo pide.
