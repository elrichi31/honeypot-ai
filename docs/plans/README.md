# Plans

Implementation plans and roadmaps for honeypot-ai. One file per initiative.
Each plan is the source of truth for its feature — keep it updated as work
progresses, and link the relevant commit hashes so the history stays traceable.

## Index

- [MULTI_TENANT_ROADMAP.md](MULTI_TENANT_ROADMAP.md) — multi-tenant rollout to 100%: page→endpoint table, the `effectiveScope` / `parseSensorScope` pattern, suggested order, and verification data.
- [PLAN_DECEPTION.md](PLAN_DECEPTION.md) — deception network design and plan.
- [I18N.md](I18N.md) — i18n system, the English-first convention, the 2026-06-18 Spanish cleanup, and remaining debt (move literals into dicts, AI prompt locale, backend strings).
- [DOCS.md](DOCS.md) — the documentation site schema, what's been documented, and the rule that features ship with docs.
- [CICD.md](CICD.md) — CI/CD pipeline: GitHub Actions → VPS auto-redeploy, secrets, and how to move to a new VPS.
- [REALTIME_STREAM.md](REALTIME_STREAM.md) — SSE stream extended to alert+heartbeat; 3 live features: attack badge, alert bell+toast, sensor live-dot.
- [DESIGN_PATTERNS.md](DESIGN_PATTERNS.md) — refactor backlog: 4 prioritized design-pattern opportunities to cut duplication (proxy-helper merge, secret-field component, config registry, scoped-route HOF) with smell/pattern/files/risk for each.
- [KAFKA_STREAM.md](KAFKA_STREAM.md) — insertar Kafka (autohospedado, KRaft) entre Vector y el ingest-api, manteniendo HTTP como fallback. **Completo**: Tareas 0–12 hechas y verificadas (incl. auditoría post-impl: re-throw sin pérdida de eventos, DRY del schema, /health/kafka, E2E con ataque SSH real). Deudas no bloqueantes abiertas: TD-2/4/5/6.
- [LAYERING_REFACTOR.md](LAYERING_REFACTOR.md) — sacar el SQL crudo de los ~25 routes del ingest-api y unificar la convención Route→Service→Repository en `modules/<dominio>/`. Incremental, un dominio por tarea, verificando que la respuesta HTTP no cambie.
- [MONITORING_PERF.md](MONITORING_PERF.md) — bajar la saturación de CPU/RAM del muestreo de stats de contenedores: unificar live ← snapshot del cron (elimina doble-snapshot + sleep de 500 ms), concurrencia acotada, TTL alineado al polling, cron a 2 min. Tareas 1–4 + 6 parcial implementadas 2026-06-24. Pendiente: Tarea 5 (socket lazy-check) y gemelo BFF de Tarea 6.
- [FRONT_AUDIT_NEXT.md](FRONT_AUDIT_NEXT.md) — auditoría del dashboard con el skill `vercel-labs/next-best-practices`. **Sprint 2 completo + verificado (2026-06-24):** metadata 100% rutas, error.tsx 15 segmentos, 2 páginas client→RSC (suricata + storage), 9 páginas client clasificadas como legítimas, recharts lazy en homepage + suricata + web-attacks/timeline. `next build` verde tras corregir un bug de `ssr: false` en Server Components (Next 16 lo prohíbe). Pendiente no bloqueante: Suspense granular.
- [PERF_AUDIT.md](PERF_AUDIT.md) — auditoría + plan de resolución de rendimiento (complementa MONITORING_PERF). Hallazgos con el fix paso a paso: A1 `IngestService`/`SuricataService` instanciado **por mensaje en el consumidor de Kafka** (hot-path real) y por request en HTTP; B1 doble `EventSource` SSE → provider único + reconexión con backoff; C1 escaneo full-table en malware meta → `DISTINCT ON`; C2 concurrencia FS sin acotar; C3/D verificación de réplica/índices/cron. Mejoras M1–M4 (helper de concurrencia DRY, métricas de ingesta, índice de expresión). Plan no implementado, ordenado por impacto/riesgo.
- [VECTOR_HOTRELOAD.md](VECTOR_HOTRELOAD.md) — migrar Vector de `--config` estático a `--config-dir conf.d/` + SIGHUP para que los sensores puedan instalarse incrementalmente sin reiniciar Vector. Implementado en working tree (2026-06-25): `vector/conf.d/`, `docker-compose` dev/prod, `sensors/*/vector.toml` + `install.sh`, IDs únicos en cowrie/suricata. Verificado: `docker compose config --quiet`, `vector validate --config-dir`, y reload real por `SIGHUP`. Pendiente solo la comprobación E2E de tráfico por todos los sensores.

## Conventions

- New plan? Add a file here and a one-line entry to this index.
- **Update the plan when you ship.** Whenever work lands that belongs to a plan
  here, edit that plan in the same change: date the entry, note what was done and
  what's left, link the commit. Plans must reflect the current state.
- UI strings: **English first** (source of truth). Spanish is added later via the
  i18n dictionaries in `apps/dashboard/lib/i18n/` — never hardcode Spanish in
  components.
