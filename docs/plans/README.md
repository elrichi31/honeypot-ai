# Plans

Implementation plans and roadmaps for honeypot-ai. One file per initiative.
Each plan is the source of truth for its feature — keep it updated as work
progresses, and link the relevant commit hashes so the history stays traceable.

## Active plans

- [CLIENT_REPORTS_PDF.md](CLIENT_REPORTS_PDF.md) — módulo de reportería por cliente: PDF semanal/mensual scopeado por tenant, generado HTML→PDF con Playwright. Fase 1: descarga on-demand en `/reports`. Fase 2: cron automático.
- [SENSOR_REMOTE_CONTROL.md](SENSOR_REMOTE_CONTROL.md) — WebSocket control plane para sensores: config remota, comandos con ACK, estado en vivo, fallback HTTP, seguridad, auditoría y rollout por fases.
- [SENSOR_IDENTITY.md](SENSOR_IDENTITY.md) — IDs únicos de sensor (UUID por instalación) + enlace Application/Client. Fases 0-3 implementadas (2026-06-27). Pendiente: verificación E2E en prod.
- [SENSOR_REALISM.md](SENSOR_REALISM.md) — realismo e reestructuración de los 5 honeypots Python: paquetes con responsabilidad única, identidad de marca unificada, corrección de fingerprint tells.
- [MULTI_TENANT_ROADMAP.md](MULTI_TENANT_ROADMAP.md) — multi-tenant rollout al 100%: tabla página→endpoint, patrón `effectiveScope`/`parseSensorScope`, orden sugerido y datos de verificación.
- [PLAN_DECEPTION.md](PLAN_DECEPTION.md) — diseño y plan de la red de deception. Track C implementado vía INTERNAL_SENSORS (done/).
- [I18N.md](I18N.md) — sistema i18n, convención English-first, cleanup español 2026-06-18, deuda pendiente (mover literales a dicts, locale de prompts AI, strings del backend).
- [DOCS.md](DOCS.md) — esquema del site de documentación, qué se ha documentado, y la regla de que las features se shippen con docs.
- [CICD.md](CICD.md) — pipeline CI/CD: GitHub Actions → VPS auto-redeploy, secrets, y cómo migrar a un VPS nuevo.
- [REALTIME_STREAM.md](REALTIME_STREAM.md) — SSE stream extendido a alert+heartbeat; 3 live features: attack badge, alert bell+toast, sensor live-dot. Pendiente: marcar alerta leída desde toast, contador server-side, live map con `useLiveStream`.
- [MONITORING_PERF.md](MONITORING_PERF.md) — reducir saturación CPU/RAM del muestreo de stats. Tareas 1–4 + 6 parcial implementadas 2026-06-24. Pendiente: Tarea 5 (socket lazy-check) y gemelo BFF Tarea 6.
- [FRONT_AUDIT_NEXT.md](FRONT_AUDIT_NEXT.md) — auditoría con `vercel-labs/next-best-practices`. Sprint 1+2 completos (2026-06-24). Pendiente no bloqueante: Suspense granular.
- [PERF_AUDIT.md](PERF_AUDIT.md) — auditoría de rendimiento: A1/B1/B2/C1/C2/D1/M1/M2 implementados 2026-06-24. M3 (métricas de ingesta: `/health/ingest-metrics`, p50/p99 + eventos/s desde el hot-path real de Kafka) implementado 2026-07-05. Pendiente: observar bajo tráfico real y decidir A2/C3/D2 con esos datos.
- [CLIENT_FETCH_HARDENING.md](CLIENT_FETCH_HARDENING.md) — fetch client-side confiable en el dashboard (AbortController + `res.ok`). Tareas 1-8 (2026-06-29) + 9-19 (2026-07-05, 11 componentes más con el mismo antipatrón que el audit original no cubrió) implementadas. `tsc`/grep guards limpios. Pendiente opcional: hook compartido `useFetchJson` (19 componentes con la misma forma).
- [VECTOR_HOTRELOAD.md](VECTOR_HOTRELOAD.md) — Vector hot-reload (`--config-dir` + SIGHUP). Implementado 2026-06-25. Pendiente: verificación E2E de tráfico real por todos los sensores.
- [CORRELATION_ALERTS.md](CORRELATION_ALERTS.md) — 3 alertas correlacionadas nuevas para el motor por-IP: `sensorSweep`, `portScanFanout`, `credReuseCrossSensor`. Implementadas (backend + config + UI + tests) 2026-07-02, sin commitear aún. Pendiente: deploy de observación y calibrar umbrales con tráfico real.
- [CLIENT_DECEPTION_TAB.md](CLIENT_DECEPTION_TAB.md) — viana de Deception por cliente: tabs, atribución cliente+sensor (2026-07-04), badge de interacciones internas en el tab nav (2026-07-05, la alerta per-evento ya existía). Pendiente: integrar con `ClientAlerts`/stream en vivo, `getKillchain`/`getPortscans` sin atribución, tests.
- [SSH_CLASSIFICATION_ENGINE.md](SSH_CLASSIFICATION_ENGINE.md) — auditoría y mejora del motor de clasificación SSH: consolidar los dos motores de patrones divergentes (SQL ILIKE vs regex), dejar de descartar comandos/tags cuando `login_success` no es `true`, arreglar el colapso por `duration` nula, HASSH como señal, y cobertura de tests. Tasks 1-6 implementadas 2026-07-05. Pendiente: Task 7 (hardening opcional) y calibrar `BOT_HASSH_FINGERPRINTS` con datos reales.

## Completed plans → [done/](done/)

Plans with no open tasks are archived in [`done/`](done/README.md).

## Conventions

- New plan? Add a file here and a one-line entry to this index.
- **Update the plan when you ship.** Whenever work lands that belongs to a plan
  here, edit that plan in the same change: date the entry, note what was done and
  what's left, link the commit. Plans must reflect the current state.
- UI strings: **English first** (source of truth). Spanish is added later via the
  i18n dictionaries in `apps/dashboard/lib/i18n/` — never hardcode Spanish in
  components.
