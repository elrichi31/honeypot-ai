# Plans — Done

Plans that are fully implemented with no open tasks.
Kept here for reference and as a changelog of what shipped.

## Index

- [KAFKA_STREAM.md](KAFKA_STREAM.md) — Kafka entre Vector e ingest-api (KRaft, HTTP fallback). Completo 2026-06-23. Tareas 0–12 + auditoría post-impl.
- [LAYERING_REFACTOR.md](LAYERING_REFACTOR.md) — Route→Service→Repository en ingest-api: dominios alerts, sensors, sessions, web, deception, protocol, suricata, stats, malware, clients. Completo 2026-06-22.
- [INTERNAL_SENSORS.md](INTERNAL_SENSORS.md) — Honeypots existentes como sensores internos de deception (SENSOR_LAYER=internal), modal rediseñado en dos secciones, real_protocol por nodo, toggle de capa en /sensors. Completo 2026-07-02.
- [BACKEND_AUDIT.md](BACKEND_AUDIT.md) — auditoría de ingest-api (auth crítica en alerts/deception, timing-safe compare, SQL dinámico) + reorganización `routes/` → `modules/<domain>/*.controller.ts` + repository/service nuevos para api-defense/attacks-today. Completo 2026-07-05, tests/build/docker verificados. (Deuda documentada a propósito, no bloqueante: lecturas GET sin token, duplicación de auth helpers en el dashboard.)
- [DB_QUERY_PERF.md](DB_QUERY_PERF.md) — auditoría de performance de queries en Postgres con `EXPLAIN ANALYZE` real + tuning de Redis. `protocol_hits` tenía estadísticas del planner rotas (arreglado con `ANALYZE`); índice parcial nuevo para el filtro de deception (99ms→0.6ms, Seq Scan→Index Scan); `maxmemory`+`allkeys-lru` agregado a Redis en los 4 compose files. Completo 2026-07-05.
- [FRONTEND_PERF_UX.md](FRONTEND_PERF_UX.md) — auditoría de feedback visual y performance de carga: `clear()` de los formularios de secretos sin pending/error, 4 rutas sin `loading.tsx`, gráficos de recharts sin code-splitting fuera de la home. Completo 2026-07-05.
- [UX_CONSISTENCY.md](UX_CONSISTENCY.md) — auditoría de UX: modal casero en `/users`, `confirm()` nativo en alerts (→ AlertDialog), validación inline (adoptando el `FieldError` ya existente en `components/ui/field.tsx`, sin uso previo), empty states consolidados (`EmptyState` compartido), overflow de tabla real en `web-attacks/[ip]`. Completo 2026-07-05.
- [DESIGN_PATTERNS.md](DESIGN_PATTERNS.md) — refactor backlog: proxy-helper unificado (`proxyRaw`/`proxyGet`), componente `SecretField`+hook `useConfigField` para los 4 formularios de secretos, registry `CONFIG_FIELDS` para `/api/config`. Los 3 confirmados implementados en el código 2026-07-05 (el índice estaba desactualizado). Ítem 4 (scoped-route HOF) deliberadamente diferido hasta que el multi-tenant rollout cree suficientes rutas uniformes — no es deuda, es una decisión de timing documentada.
