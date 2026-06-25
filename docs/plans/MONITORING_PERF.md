# MONITORING_PERF — bajar la saturación de CPU/RAM del monitoreo de contenedores

**Estado:** Tareas 1–4 + Tarea 6 parcial implementadas. 2026-06-24.

## Problema

En `docker stats` se observa que el muestreo de contenedores satura CPU/RAM. El
front del dashboard **no** es la causa (polling pausado con `document.hidden`,
intervalos de 60–120 s, BFF con caché de 30 s). El costo real está en cómo el
`ingest-api` lee estadísticas del socket de Docker, y se multiplica por la
cantidad de contenedores corriendo (~15: honeypots, vector, kafka, redis,
postgres, etc.).

### Causas raíz (evidencia)

1. **Doble-snapshot + sleep bloqueante en el endpoint "live".**
   [`docker-stats.ts:118-168`](../../apps/ingest-api/src/lib/docker-stats.ts#L118-L168)
   `sampleContainerStatsLive()` hace: 1 list + N llamadas `/stats` (snapshot 1) +
   `await sleep(500ms)` + N llamadas más (snapshot 2). Con N≈15 son **~31
   peticiones al daemon de Docker por refresco**. Cada `/containers/{id}/stats`
   obliga a `dockerd` a calcular cgroups — **el costo de CPU lo paga el daemon en
   el host**, que es justo lo que se ve saturado. El `sleep(500ms)` además
   mantiene vivo el handler Fastify medio segundo.

2. **El cron repite trabajo equivalente cada minuto, 24/7.**
   [`cron.ts:51-69`](../../apps/ingest-api/src/lib/cron.ts#L51-L69)
   `sampleContainerStatsForCron()` corre cada minuto haya o no alguien mirando:
   N llamadas `/stats` + `createMany` + `deleteMany` de barrido. Carga de fondo
   permanente y **redundante** con el snapshot que ya mantiene el cron
   (`cronCache`).

3. **Caché 30 s vs polling 60 s ⇒ casi siempre falla la caché.**
   [`monitoring.ts:104`](../../apps/ingest-api/src/routes/monitoring.ts#L104)
   El TTL (30 s) es la mitad del intervalo de polling del front (60 s): casi cada
   request del usuario expira la caché y dispara el muestreo completo. La caché
   solo ayuda si dos usuarios miran simultáneamente.

4. **Sin límite de concurrencia.** Todos los `dockerGet` salen con `Promise.all`
   en ráfaga simultánea contra `dockerd`, amplificando el pico de CPU del daemon.

### Por qué importa
El daemon de Docker es un proceso compartido por todos los contenedores; cuando
se satura calculando stats, afecta a honeypots y al pipeline de ingesta, no solo
al monitoreo.

---

## Objetivo

Una **sola fuente** de muestreo de stats de contenedores (el cron), reusada por
el endpoint live, con concurrencia acotada y TTL alineado al polling. Cero
doble-snapshot, cero `sleep` en el hot path HTTP. Resolución del histórico
configurable.

---

## Tareas

### Tarea 1 — Unificar live ← snapshot del cron (mayor impacto, riesgo bajo) ✅ 2026-06-24
**Qué:** Eliminar el doble-snapshot + `sleep(500ms)` de `sampleContainerStatsLive()`.
El endpoint live deja de muestrear y sirve el **último resultado del cron**.

- En [`docker-stats.ts`](../../apps/ingest-api/src/lib/docker-stats.ts): el cron
  ya calcula deltas con `cronCache`. Guardar también el **último `ContainerStat[]`
  calculado** en un módulo-level `let lastCronStats: { at: number; data:
  ContainerStat[] }`. `sampleContainerStatsForCron()` lo actualiza al final.
- Reescribir `sampleContainerStatsLive()` para devolver `lastCronStats.data` (o
  `[]` si aún no hay muestra / es más vieja que ~90 s). Borrar el doble-snapshot
  y el `sleep`.
- [`monitoring.ts:104`](../../apps/ingest-api/src/routes/monitoring.ts#L104) no
  cambia de firma; sigue llamando a `sampleContainerStatsLive()`.

**Efecto:** de ~31 llamadas/refresco a **0 extra** en el path HTTP (el muestreo
ya lo hace el cron 1×/min). Elimina el `sleep` del event loop.

**Verificación:** abrir el dashboard, confirmar que la tabla "live" se sigue
llenando; `docker stats` debe mostrar el pico de `dockerd` solo 1×/min (cron), no
en cada refresco del front. Apagar el cron temporalmente ⇒ el endpoint live
devuelve `[]` tras 90 s (no crashea).

### Tarea 2 — Limitar concurrencia de `dockerGet` en el cron ✅ 2026-06-24
**Qué:** Reemplazar el `Promise.allSettled(running.map(...))` de
`sampleContainerStatsForCron()` por un pool acotado (lotes de 4–5) para no
martillar `dockerd` de golpe.

- Helper local `mapWithConcurrency(items, limit, fn)` (KISS, sin dependencia
  nueva). Aplicarlo donde se itera `running`.
- `limit` = `Math.min(5, running.length)`.

**Verificación:** el pico instantáneo de `dockerd` en `docker stats` durante el
tick del cron baja y se reparte en ~0.5–1 s en vez de un spike único.

### Tarea 3 — Alinear TTL de caché al polling ✅ 2026-06-24
**Qué:** Subir el TTL de `monitoring:containers:stats` a 60 s (igual o > intervalo
de polling del front).

- [`monitoring.ts:104`](../../apps/ingest-api/src/routes/monitoring.ts#L104):
  `withCache(..., 60, ...)`. Tras Tarea 1 el costo de un miss es ~0, así que esto
  es defensa en profundidad; mantenerlo coherente con el ciclo del cron.
- Verificar también el TTL del BFF en
  [`app/api/monitoring/containers/stats/route.ts`](../../apps/dashboard/app/api/monitoring/containers/stats/route.ts#L7)
  (`CACHE_TTL = 30_000`) — subir a 60_000 para coherencia.

### Tarea 4 — Frecuencia del cron configurable (resolución vs costo) ✅ 2026-06-24
**Qué:** El cron muestrea cada minuto. Para 24h el front ya agrupa en buckets de
5 min ([`monitoring.service.ts:5`](../../apps/ingest-api/src/modules/monitoring/monitoring.service.ts#L5)),
así que 1 min es sobre-muestreo. Pasar a cada 2 min reduce a la mitad la carga de
fondo sin pérdida visible en el gráfico.

- En [`cron.ts`](../../apps/ingest-api/src/lib/cron.ts): separar el snapshot de
  contenedores a su propio `cron.schedule('*/2 * * * *', ...)` (hoy comparte
  schedule con el sensor-health en `SENSOR_HEALTH_SCHEDULE`).
- **Decisión a tomar:** ¿el snapshot de sistema (`monitoringSnapshot`) también
  baja a 2 min, o se queda en 1 min? `readSystemMetrics()` lee `/proc/*` (barato,
  no toca Docker) ⇒ se puede dejar en 1 min. Solo el de **contenedores** es caro.

**Verificación:** el histórico 24h/7d/30d se ve igual; el gasto de fondo del cron
de contenedores cae ~50 %.

### Tarea 5 — (Mejora) Robustez del socket Docker
**Qué:** `SOCKET_AVAILABLE` se evalúa **una vez al import**
([`docker-stats.ts:8`](../../apps/ingest-api/src/lib/docker-stats.ts#L8)). Si el
contenedor arranca antes de que el mount del socket esté listo, queda "no
disponible" para siempre. Reevaluar perezosamente o cachear con TTL corto.

- Mínimo: log de un `warn` 1× cuando el socket falta, para que sea visible en el
  monitoreo en vez de un silencioso `[]`.

### Tarea 6 — (Mejora) `body += chunk` → acumular buffers ✅ 2026-06-24 (parcial)
**Qué:** En `dockerGet` ([`docker-stats.ts:33-47`](../../apps/ingest-api/src/lib/docker-stats.ts#L33-L47)
y el gemelo en [`app/api/monitoring/containers/route.ts`](../../apps/dashboard/app/api/monitoring/containers/route.ts#L20-L33))
se concatenan strings. Para payloads de `/stats` (cada uno KBs) ×N×frecuencia
genera GC. Acumular `Buffer[]` y `Buffer.concat(...).toString()` al final.
Impacto menor; hacerlo solo si Tareas 1–4 no bastan.
**Hecho:** `dockerGet` en `docker-stats.ts` ahora acumula `Buffer[]`. El gemelo en el BFF queda pendiente (impacto menor dado que ya no muestrea live).

---

## Orden sugerido y criterio de "listo"

1 → 3 → 2 → 4 primero (las que mueven la aguja). 5 y 6 son pulido.

**Métrica de éxito:** en `docker stats`, el CPU de `dockerd` atribuible al
monitoreo pasa de "en cada refresco del dashboard + cada minuto" a "un pico
acotado cada 2 min", y el `ingest-api` deja de tener picos de CPU al abrir la
página de monitoreo.

## Riesgos / notas

- Tarea 1 cambia la semántica de "live": ya no es una lectura fresca al instante,
  sino la última del cron (≤2 min de antigüedad). Para CPU/RAM de contenedores
  esto es perfectamente aceptable; el label del UI dice "refreshes every 60s"
  ([`container-stats-chart.tsx:103`](../../apps/dashboard/components/monitoring/container-stats-chart.tsx#L103))
  — ajustar el texto si la cadencia del cron cambia a 2 min.
- Mantener el contrato HTTP (`ContainerStat[]`) intacto: el front no se toca salvo
  el copy del intervalo. Todo el SQL sigue en `monitoring.repository.ts` (regla de
  layering).
- No introducir dependencias nuevas (KISS): el pool de concurrencia es un helper
  de ~10 líneas.
