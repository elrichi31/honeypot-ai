# Project Notes

Important things to remember about honeypot-ai: setup steps, gotchas,
infrastructure wiring, and decisions that aren't obvious from the code itself.
This is durable context — anything a new contributor (or Claude) should know
before touching the project.

## Index

- [CLOUDFLARE_TUNNEL_SETUP.md](CLOUDFLARE_TUNNEL_SETUP.md) — how the Cloudflare tunnel / platform deploy is wired.
- [backend-layering.md](backend-layering.md) — Route → Service → Repository convention in ingest-api; which layer owns SQL, cache, and business logic.

## Key facts (quick reference)

- **Monorepo layout:** apps under `apps/` — `dashboard` (Next.js UI),
  `ingest-api` (Fastify + Prisma), `docs` (Astro). Sensors/honeypots live under
  `sensors/`, `cowrie/`, `vector/`, etc.
- **i18n:** the dashboard has a homegrown i18n system in
  `apps/dashboard/lib/i18n/` (no external lib). Locales `en` / `es`, namespaced
  dictionaries under `dicts/`. **English is the source of truth**; Spanish is
  layered on top. Do not hardcode Spanish strings in components — add keys to a
  dictionary instead.
- **Multi-tenant scoping:** effective tenant is derived server-side from the
  user (never from a query param). See the multi-tenant roadmap in
  `docs/plans/` for the `effectiveScope` / `parseSensorScope` pattern.

## Conventions

- New note? Add a file here and a one-line entry to this index.
