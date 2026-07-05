# Backend Layering Convention (ingest-api)

The `apps/ingest-api` follows a strict **Controller → Service → Repository**
3-layer architecture. All SQL lives in the repository; controllers are
HTTP-only. Since 2026-07-05 every layer of a domain lives together under
`src/modules/<domain>/` — there is no separate top-level `src/routes/` folder
anymore.

## Layer rules

| Layer | File | Allowed |
|-------|------|---------|
| **Controller** | `src/modules/<domain>/<domain>.controller.ts` | Zod parse/validate, auth/role check, call Service, `reply.send()`. Zero SQL, zero Prisma imports. |
| **Service** | `src/modules/<domain>/<domain>.service.ts` | Business logic, cache (`withCache`), orchestration of repository calls. No `reply`. |
| **Repository** | `src/modules/<domain>/<domain>.repository.ts` | Only layer that calls `prisma`/`prismaRead`. `$queryRaw`, `$queryRawUnsafe`, `Prisma.sql`, Prisma ORM methods. Returns typed rows, never `Reply`. |

## File layout

```
src/
  modules/
    alerts/           alerts.controller.ts      alerts.repository.ts    alerts.service.ts
    api-defense/       api-defense.controller.ts   api-defense.repository.ts   api-defense.service.ts
    attacks-today/     attacks-today.controller.ts attacks-today.repository.ts attacks-today.service.ts
    clients/          clients.controller.ts    clients.observability.controller.ts
                       clients.repository.ts    clients.service.ts
    deception/        deception.controller.ts  deception.repository.ts deception.service.ts
    events/           events.controller.ts     event.repository.ts
    health/           health.controller.ts        (no service/repository — liveness/readiness checks only)
    ingest/           ingest.controller.ts     ingest.service.ts
    live/             live.controller.ts          (no service/repository — SSE event-bus passthrough)
    malware/          malware.controller.ts    malware.repository.ts   malware.service.ts
    monitoring/       monitoring.controller.ts monitoring.repository.ts monitoring.service.ts
    protocol/         protocol.controller.ts   protocol.repository.ts  protocol.service.ts
    sensors/          sensors.controller.ts     sensors.provision.controller.ts
                       sensors.repository.ts    sensors.service.ts
    sessions/         sessions.controller.ts   session.repository.ts   session.service.ts
    stats/            controllers/*.ts (11 files — one per stats view, plus index.ts that registers them)
                       stats.repository.ts   stats.types.ts   stats.utils.ts
                       (routes handle the thin service layer; types/utils are siblings of the repository, not nested under controllers/)
    storage/          storage.controller.ts    storage.repository.ts   storage.service.ts
    suricata/         suricata.controller.ts   suricata.repository.ts  suricata.service.ts
    threats/          threats.controller.ts    threats.repository.ts   threats.service.ts
    web/              web.controller.ts        web.repository.ts       web.service.ts
  lib/              Pure transversal utilities only (geo, pagination, risk-score,
                    normalizer, date-utils, session-queries builders, sensor-utils).
                    No DB calls in lib/.
```

Two domains (`clients`, `sensors`) have **two controllers** — the original
one plus an "observability"/"provision" one that was a separate route file
before the reorg. They share the domain's single service/repository; this is
intentional (one controller per concern, one service per domain), not a
naming inconsistency.

## Key patterns

### Instantiation (KISS, no DI container)
Services are **stateless** (no per-request mutable state) and must be created
**once per plugin**, never per-request or per-message. This prevents unnecessary
allocations on the hot path (especially the Kafka consumer under load).

```ts
// Inside the plugin closure — one instance shared across all requests/messages:
export async function xRoutes(fastify: FastifyInstance) {
  const svc = new XService(fastify.prisma, fastify.prismaRead)
  fastify.post('/x', async (req, reply) => { ... svc.doSomething() ... })
}
```

Do NOT create `new XService(...)` inside a request handler or `eachMessage` callback.

### Read replica
- `fastify.prismaRead` → all SELECT queries
- `fastify.prisma` → writes (INSERT/UPDATE/DELETE)

### Cache
```ts
import { withCache } from '../../lib/cache-helper.js'
// In service:
return withCache(cache, 'key:suffix', ttlSeconds, () => this.repo.getX())
```

### Dynamic SQL filters (`$queryRawUnsafe`)
Some domains (suricata, storage) still use `$queryRawUnsafe` with positional
`$1...$N` params for dynamic filter lists. This is intentional and safe — the
integer/enum values are validated by Zod before being interpolated. Do not refactor
these to tagged-template `$queryRaw` without also fixing placeholder indexing.

`deception.repository.ts` was migrated off this pattern on 2026-07-05 (see
[`docs/plans/BACKEND_AUDIT.md`](../plans/BACKEND_AUDIT.md)) to tagged-template
`Prisma.sql`/`Prisma.raw`/`Prisma.empty`, removing the manual parameter-index
bookkeeping. Prefer that pattern for any new dynamic-filter repository code.

### Auth (`ensureIngestToken`)
Historically only `POST /ingest/*` (the sensor write path) was required to
call `ensureIngestToken` (`src/lib/ingest-auth.ts`) — most `GET` read routes
across the API rely on the dashboard/BFF being the only caller over a private
network, and skip the token. `clients.controller.ts`,
`clients.observability.controller.ts` is the exception (protects every
route including reads), and as of 2026-07-05 `alerts.controller.ts` and
`deception.controller.ts` also protect every route (they previously had zero
auth on any route — see `docs/plans/BACKEND_AUDIT.md` for the full writeup).
This is a deliberate, tracked inconsistency, not something to "fix" file by
file without a decision — see the Deuda técnica section of the audit plan.

### `lib/` boundary
Files that stay in `lib/`:
- Pure query-builder functions that return `Prisma.sql` objects without calling the DB (e.g. `session-queries.ts`, `web-normalize.ts`)
- Pure utility functions with no side effects (geo, pagination, risk-score, etc.)

Files that belong in `modules/<domain>/`:
- Anything that calls `prisma.$queryRaw`, `prisma.event.findMany`, `$executeRaw`, etc.

## Deuda técnica to keep in mind

Resolved on 2026-07-05 (same day as the reorg, see
[`docs/plans/BACKEND_AUDIT.md`](../plans/BACKEND_AUDIT.md) section 6):
- `api-defense.controller.ts` and `attacks-today.controller.ts` now have a
  proper repository + service — SQL moved out of the controller entirely.
- `modules/stats/stats.repository.ts` no longer imports from
  `./controllers/` — `types.ts`/`utils.ts` moved up to `modules/stats/` as
  `stats.types.ts`/`stats.utils.ts`, siblings of the repository.
- `lib/cron.ts` now imports `readSystemMetrics` from the new
  `lib/system-metrics.ts` (pure `/proc` parsing, no DB) instead of from
  `monitoring.controller.ts`. `monitoring.controller.ts` imports the same
  functions from `lib/system-metrics.ts` too.

Still open:
- **`modules/stats/controllers/`** is a folder of 11 controller files (one
  per stats view) — it doesn't follow the flat `<domain>.controller.ts`
  naming the rest of the modules use. Not flattened: splitting it further
  wasn't judged worth the churn given they already share one `index.ts` that
  registers them all. `stats.types.ts`/`stats.utils.ts` living one level up
  (in `modules/stats/` directly) already fixes the import-direction problem
  this used to cause.
- **Reading GET routes without `ensureIngestToken`** across most modules —
  see the audit plan's "Deuda técnica restante" for the full list and the
  reasoning for leaving it as-is.
- `lib/threat-route-queries.ts` and `lib/web-queries.ts` are now superseded by
  `modules/threats/threats.repository.ts` and `modules/web/web.repository.ts`
  respectively. The old `lib/` files can be deleted once confirmed unused.
