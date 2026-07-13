# Plans

Implementation plans and roadmaps for honeypot-ai. One file per initiative.
Each plan is the source of truth for its feature — keep it updated as work
progresses, and link the relevant commit hashes so the history stays traceable.

## Active plans

- [CLIENT_REPORTS_PDF.md](CLIENT_REPORTS_PDF.md) — módulo de reportería por cliente: PDF scopeado por tenant, generado con `@react-pdf/renderer`. Fase 1 (done): descarga on-demand en `/reports`. Fase 1.5 (implementada 2026-07-13): preview del PDF en `<iframe>` antes de exportar + rango de fechas custom/presets. Fase 2: cron automático.
- [SENSOR_REMOTE_CONTROL.md](SENSOR_REMOTE_CONTROL.md) — WebSocket control plane para sensores: config remota, comandos con ACK, estado en vivo, fallback HTTP, seguridad, auditoría y rollout por fases.
- [SENSOR_IDENTITY.md](SENSOR_IDENTITY.md) — IDs únicos de sensor (UUID por instalación) + enlace Application/Client. Fases 0-3 implementadas (2026-06-27), Fase 0 verificada en DB local 2026-07-07. Pendiente: Fase 4, verificación E2E en prod (instalar sensores reales, reasignación, no-fusión de sesiones).
- [SENSOR_REALISM.md](SENSOR_REALISM.md) — realismo e reestructuración de los 5 honeypots Python: paquetes con responsabilidad única, identidad de marca unificada, corrección de fingerprint tells.
- [MULTI_TENANT_ROADMAP.md](MULTI_TENANT_ROADMAP.md) — multi-tenant rollout al 100%: tabla página→endpoint, patrón `effectiveScope`/`parseSensorScope`, orden sugerido y datos de verificación.
- [PLAN_DECEPTION.md](PLAN_DECEPTION.md) — diseño y plan de la red de deception. Track C implementado vía INTERNAL_SENSORS (done/).
- [I18N.md](I18N.md) — sistema i18n, convención English-first, cleanup español 2026-06-18, deuda pendiente (mover literales a dicts, locale de prompts AI, strings del backend).
- [DOCS.md](DOCS.md) — esquema del site de documentación, qué se ha documentado, y la regla de que las features se shippen con docs.
- [CICD.md](CICD.md) — pipeline CI/CD: GitHub Actions → VPS auto-redeploy, secrets, y cómo migrar a un VPS nuevo.
- [REALTIME_STREAM.md](REALTIME_STREAM.md) — SSE stream extendido a alert+heartbeat; 3 live features: attack badge, alert bell+toast, sensor live-dot. Pendiente: marcar alerta leída desde toast, contador server-side, live map con `useLiveStream`.
- [PERF_AUDIT.md](PERF_AUDIT.md) — auditoría de rendimiento: A1/B1/B2/C1/C2/D1/M1/M2 implementados 2026-06-24. M3 (métricas de ingesta) implementado 2026-07-05. C3 auditado 2026-07-07: falta índice compuesto `(sensor_id, started_at)` en `sessions`. Pendiente: observar bajo tráfico real y decidir A2/D2 con esos datos.
- [CLIENT_FETCH_HARDENING.md](CLIENT_FETCH_HARDENING.md) — fetch client-side confiable en el dashboard (AbortController + `res.ok`). Tareas 1-8 (2026-06-29) + 9-19 (2026-07-05, 11 componentes más con el mismo antipatrón que el audit original no cubrió) implementadas. Hook compartido `useFetchJson` extraído y piloteado en `attack-heatmap.tsx` (2026-07-07). Pendiente opcional: migrar el resto de los 18 componentes restantes que calcen con el patrón canónico.
- [CLIENT_DECEPTION_TAB.md](CLIENT_DECEPTION_TAB.md) — viana de Deception por cliente: tabs, atribución cliente+sensor (2026-07-04), badge de interacciones internas en el tab nav + atribución extendida a `getKillchain`/`getPortscans` (2026-07-05). Pendiente: integrar con `ClientAlerts`/stream en vivo, tests de render de componentes.
- [IOCS_PAGE.md](IOCS_PAGE.md) — página global `/iocs` de threat intel. Fase 1 (2026-07-10): C2 endpoints + planted SSH keys agregados en un endpoint backend nuevo (`/iocs`), filtros periodo/nivel, stat row, drill-downs, export MISP + bundle unificado. Pendiente: verificar E2E contra datos reales, `period` en malware, correlación IP↔hash↔familia.

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
