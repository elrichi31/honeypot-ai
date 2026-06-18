# Plans

Implementation plans and roadmaps for honeypot-ai. One file per initiative.
Each plan is the source of truth for its feature — keep it updated as work
progresses, and link the relevant commit hashes so the history stays traceable.

## Index

- [MULTI_TENANT_ROADMAP.md](MULTI_TENANT_ROADMAP.md) — multi-tenant rollout to 100%: page→endpoint table, the `effectiveScope` / `parseSensorScope` pattern, suggested order, and verification data.
- [PLAN_DECEPTION.md](PLAN_DECEPTION.md) — deception network design and plan.
- [I18N.md](I18N.md) — i18n system, the English-first convention, the 2026-06-18 Spanish cleanup, and remaining debt (move literals into dicts, AI prompt locale, backend strings).

## Conventions

- New plan? Add a file here and a one-line entry to this index.
- UI strings: **English first** (source of truth). Spanish is added later via the
  i18n dictionaries in `apps/dashboard/lib/i18n/` — never hardcode Spanish in
  components.
