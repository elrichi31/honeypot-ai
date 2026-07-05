# DB Query Performance & Redis Tuning

Auditoría de performance de queries en Postgres (con datos reales de
producción/staging local, no estimados) y de la configuración de Redis.
Hecho el 2026-07-05. Metodología: medir primero con `EXPLAIN (ANALYZE,
BUFFERS)` contra la base real, después decidir qué tocar.

## Hallazgos y estado

### 1. `protocol_hits` tenía las estadísticas del planner rotas — ARREGLADO

La tabla real tenía **983,974 filas**, pero `pg_stat_user_tables` reportaba
`n_live_tup = 0` — `last_analyze`, `last_autovacuum` y `last_autoanalyze`
estaban todos vacíos (solo `n_dead_tup = 64098` sugiere deletes de retención
sin que el autoanalyze disparara nunca). Con esas estadísticas, el planner de
Postgres puede elegir planes catastróficamente malos porque cree que la
tabla no tiene filas.

**Fix aplicado:** `ANALYZE protocol_hits;` manual, corrido en local. Después
de esto `n_live_tup` pasó a reflejar el conteo real (~984k).

**Pendiente de decisión:** confirmar en el Postgres de producción/VPS si el
mismo problema existe (correr `SELECT relname, n_live_tup, last_autoanalyze
FROM pg_stat_user_tables WHERE relname = 'protocol_hits';`) y, si autovacuum
no está disparando ahí tampoco, investigar por qué — candidatos: el patrón de
insert masivo + delete masivo por retención puede estar confundiendo las
heurísticas de autovacuum, o `autovacuum_analyze_scale_factor` (10% por
defecto) es demasiado alto para una tabla de este tamaño y debería bajarse
específicamente para `protocol_hits` vía `ALTER TABLE ... SET
(autovacuum_analyze_scale_factor = 0.02)` o similar.

### 2. Filtro de deception sin índice — Seq Scan de ~984k filas — ARREGLADO

`DeceptionRepository.getOverview()` y `.getNodes()`
([`deception.repository.ts`](../../apps/ingest-api/src/modules/deception/deception.repository.ts))
filtran `protocol_hits` con:

```sql
WHERE (data->>'layer' = 'internal' OR data->>'source' = 'opencanary')
```

Solo **263 de 984,473 filas** matchean este predicado. Sin un índice que lo
cubra, Postgres no tiene forma de indexar un `OR` entre dos expresiones JSONB
distintas con un índice B-tree normal — terminaba en **Parallel Seq Scan**
sobre toda la tabla:

| Query | Antes | Buffers leídos | Después | Buffers leídos |
|---|---|---|---|---|
| `getOverview` activity aggregate | ~99.9ms | 84,161 (~657MB) | ~0.58ms | 241 |
| `getNodes` activity aggregate | ~107.2ms | 84,161 | ~0.81ms | 241 |

**Fix aplicado:** índice parcial de expresión, migración
[`20260705000000_idx_protocol_hits_deception_filter`](../../apps/ingest-api/prisma/migrations/20260705000000_idx_protocol_hits_deception_filter/migration.sql):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "protocol_hits_deception_filter_idx"
  ON "protocol_hits" ("timestamp" DESC)
  WHERE (data->>'layer' = 'internal' OR data->>'source' = 'opencanary');
```

Como el predicado solo matchea el 0.03% de la tabla, el índice se queda en
**16KB** sin importar cuánto crezca `protocol_hits` — la relación se mantiene
mientras la proporción de tráfico de deception vs. tráfico externo no cambie
drásticamente. Verificado con `EXPLAIN` (antes/después, en transacción con
rollback antes de aplicar de verdad) y en vivo contra el contenedor: la
migración se aplicó con `CONCURRENTLY` (no bloquea la tabla más grande y más
escrita del sistema mientras se construye) y `prisma migrate deploy` la
registró correctamente en un rebuild limpio del contenedor.

`getKillchain` y `getEvents` (mismo repository) usan el mismo
`DECEPTION_FILTER` combinado con `sensorScopeClause` — se benefician del
mismo índice parcial como condición base, aunque no se midieron
individualmente (la ganancia relativa debería ser equivalente, dado que
comparten el filtro base más costoso).

### 3. Otras queries pesadas ya usan bien los índices — sin acción

- `MitreRepository.getMitreData()` (rango de 30 días sobre `protocol_hits`)
  usa `Index Only Scan` sobre `protocol_hits_overview_covering_idx`
  correctamente. Tarda ~147ms porque el rango de 30 días cubre ~33% de la
  tabla completa (327,991 de 984,473 filas) — no es un problema de índice
  faltante, es que la consulta pide "casi todo". Reducir esto requeriría
  agregados pre-computados (rollups), que en parte ya existen
  (`daily_attacker_stats`, `daily_credential_stats`) pero no cubren MITRE. No
  se tocó — el costo/beneficio de agregar un rollup de MITRE no está claro
  sin saber cuánto se llama ese endpoint en producción real.
- `web_hits` (12 índices, 1276 filas hoy) y `SensorScope.cond()` (usado en
  threats/stats para scoping multi-tenant) están bien diseñados — parametrizado,
  sin injection, cache-key estable independiente del orden de sensorIds. Sin
  hallazgos aquí; volumen de datos demasiado bajo hoy para que importe, pero la
  estructura de índices ya anticipa el crecimiento (`src_ip, timestamp DESC`,
  `attack_type, timestamp DESC`, parcial `is_chain_attack`, etc.).

### 4. Redis: patrón de cache correcto, faltaba `maxmemory` — ARREGLADO

El código (`withCache` en
[`cache-helper.ts`](../../apps/ingest-api/src/lib/cache-helper.ts)) ya
implementa **stale-while-revalidate** con dedupe de cómputo concurrente
(`computeOnce`): la primera request cachea el valor con `freshUntil` +
TTL×2 de retención; requests posteriores devuelven el valor stale
inmediatamente mientras un refresh corre en background, deduplicado si ya
hay uno en vuelo para la misma key. 51 call-sites en el código lo usan.
Verificado en vivo: 1 miss + 4 hits consecutivos contra
`/deception/overview`.

El único gap real: `docker-compose*.yml` levantaba Redis sin `maxmemory`
(`0` = ilimitado) y con la política por defecto `noeviction` — si el cache
alguna vez creciera sin control, Redis rechazaría escrituras nuevas con OOM
en vez de descartar entradas viejas. Bajo riesgo hoy (memoria usada ~1MB,
TTLs cortos de 20-120s), pero es una config de higiene barata.

**Fix aplicado**, en los 4 compose files (`docker-compose.yml`,
`docker-compose.prod.app.yml`, `docker-compose.prod.platform.yml`,
`docker-compose.prod.single-host.yml`):

```
command: redis-server --save "" --appendonly no --maxmemory 256mb --maxmemory-policy allkeys-lru
```

`allkeys-lru` porque es un cache puro — todo valor es recomputable vía
`withCache`, así que perder la entrada menos usada recientemente cuando se
llena la memoria es seguro (el siguiente `GET` simplemente recalcula).
Verificado: `CONFIG GET maxmemory` → `268435456` (256MB exactos), `CONFIG GET
maxmemory-policy` → `allkeys-lru`, y `ingest-api` reconecta y sigue cacheando
correctamente después del restart de Redis.

## Deuda técnica / pendiente (no atacado en esta pasada)

- **Confirmar en producción** si `protocol_hits` (o cualquier otra tabla
  grande) tiene el mismo problema de estadísticas rotas que se encontró en
  local — puede que sea específico de este entorno de desarrollo (recreado
  varias veces durante la sesión) y no reproduzca en el servidor real. Correr
  la query de diagnóstico de la sección 1 ahí antes de asumir que aplica.
- **Rollup de MITRE matrix** (`daily_mitre_stats` o similar) si el endpoint
  `/stats/mitre-matrix` resulta ser un hot path real en producción — no se
  midió el volumen de tráfico a ese endpoint específico, así que no se
  justificó todavía el costo de mantener otro rollup.
- **`getKillchain`/`getEvents`** de deception no se midieron individualmente
  con `EXPLAIN ANALYZE` con distintos valores de `scope`/`nodeId` — se asume
  que se benefician del mismo índice parcial por compartir `DECEPTION_FILTER`,
  pero valdría la pena confirmarlo si killchain se vuelve lento con más datos
  (el `LEFT JOIN LATERAL` contra `sessions` en `getKillchain` es la parte más
  cara de esa query específica, no el filtro de deception).
- **`web_hits` y `sensor_id`-scoped queries** no tienen hallazgos hoy porque
  el volumen de datos es bajo (1276 filas) — revisar de nuevo cuando el
  volumen crezca a un orden de magnitud similar a `protocol_hits`.

## Cómo reproducir las mediciones

```bash
# Tamaño y stats reales de tabla
docker exec honeypot-postgres psql -U honeypot -d honeypot_prod -c "
  SELECT relname, n_live_tup, n_dead_tup, last_analyze, last_autovacuum
  FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"

# EXPLAIN de una query puntual
docker exec honeypot-postgres psql -U honeypot -d honeypot_prod -c "
  EXPLAIN (ANALYZE, BUFFERS) <query>;"

# Redis: hit rate y memoria
docker exec honeypot-redis redis-cli INFO stats | grep -E "keyspace_hits|keyspace_misses"
docker exec honeypot-redis redis-cli INFO memory | grep -E "used_memory_human|maxmemory"
```

## Estado

Ítems 1, 2 y 4 implementados y verificados el 2026-07-05 (localmente; el
índice y la config de Redis están en el código/migraciones, listos para
desplegar). Ítem 3 revisado sin hallazgos que ameriten acción ahora. Deuda
documentada arriba para revisar cuando el volumen de datos de producción lo
justifique.
