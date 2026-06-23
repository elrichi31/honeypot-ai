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
- [KAFKA_STREAM.md](KAFKA_STREAM.md) — insertar Kafka (autohospedado, KRaft) entre Vector y el ingest-api, manteniendo HTTP como fallback. Tareas 0–7 hechas; auditoría detectó 5 hallazgos → Tareas 8–12 de remediación (Tarea 8 bloqueante: pérdida silenciosa de eventos ante fallo de BD).
- [LAYERING_REFACTOR.md](LAYERING_REFACTOR.md) — sacar el SQL crudo de los ~25 routes del ingest-api y unificar la convención Route→Service→Repository en `modules/<dominio>/`. Incremental, un dominio por tarea, verificando que la respuesta HTTP no cambie.

## Conventions

- New plan? Add a file here and a one-line entry to this index.
- **Update the plan when you ship.** Whenever work lands that belongs to a plan
  here, edit that plan in the same change: date the entry, note what was done and
  what's left, link the commit. Plans must reflect the current state.
- UI strings: **English first** (source of truth). Spanish is added later via the
  i18n dictionaries in `apps/dashboard/lib/i18n/` — never hardcode Spanish in
  components.
