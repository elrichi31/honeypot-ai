# Documentation plan & state

The user-facing documentation site lives in [`apps/docs/`](../../apps/docs/) —
Astro Starlight, **written in Spanish** (the English-first rule applies to product
UI strings, not the docs site). The sidebar/schema is defined in
`apps/docs/astro.config.mjs`.

## Schema

Ordered "outside in":

- **Introducción · Arquitectura**
- **Primeros pasos · Despliegue**
- **Sensores** — Cowrie, Web, Galah, Dionaea, FTP/MySQL, Salud de sensores, Vector
- **Plataforma** — Ingest API, Dashboard, Clientes, Multi-tenant, Alertas Discord
- **Inteligencia de amenazas** — Threat Intelligence, IoCs, Suricata, Malware, Red de engaño
- **Operación** — Monitoreo, Almacenamiento, Defensa de API, Usuarios, Auditoría
- **Referencia** — Seguridad, API Reference

Rule: a new page needs a sidebar entry in `astro.config.mjs`. Validate with
`cd apps/docs && npm run build` (Starlight fails the build on broken slugs).

## Theme

The docs site is themed to match the dashboard (`apps/dashboard`) so both feel
like one product: **dark-only**, near-black background, blue accent, Geist
typography. Theme tokens live in `apps/docs/src/styles/theme.css` (wired via
`customCss` in `astro.config.mjs`); they translate the dashboard's oklch palette
from `apps/dashboard/app/globals.css` into Starlight's `--sl-color-*` tokens.
Geist comes from `@fontsource-variable/geist[-mono]` (self-hosted, no Google
request). The theme selector is hidden — there is no light variant on purpose.
If the dashboard palette changes, update `theme.css` to keep them in sync.

## Done

- **2026-06-18 — Full docs pass (commit ee262fe).** Reorganized the sidebar
  (fixed the half-translated "Administración" section), updated the stale pages
  (architecture, api-reference, dashboard, intro, index), and created 10 new
  pages: threat-intelligence, iocs, suricata, malware, deception (intelligence/);
  monitoring, storage, api-defense (operations/); multi-tenant, ftp-mysql
  (services/). Build validated: 35 pages, no broken slugs.
- **2026-06-18 — Theme aligned with the dashboard.** Added
  `src/styles/theme.css` (dark-only palette + Geist via @fontsource), wired it
  through `customCss`, hid the theme selector. Build re-validated.

## Debt / TODO

1. **`PLAN_DECEPTION.md` is conversational**, not a formal plan — rewrite when
   touched next.
2. **Deception docs describe the target design**, not necessarily what's deployed
   in prod. Reconcile with the live node set when known.
3. **New features must ship with docs.** When a feature lands, add/refresh its
   page under the matching sidebar section in the same effort.
