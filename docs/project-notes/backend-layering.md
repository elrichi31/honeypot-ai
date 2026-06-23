# Backend Layering Convention (ingest-api)

The `apps/ingest-api` follows a strict **Route → Service → Repository** 3-layer
architecture. All SQL lives in the repository; routes are HTTP-only.

## Layer rules

| Layer | File | Allowed |
|-------|------|---------|
| **Route** | `src/routes/<domain>.ts` | Zod parse/validate, auth/role check, call Service, `reply.send()`. Zero SQL, zero Prisma imports. |
| **Service** | `src/modules/<domain>/<domain>.service.ts` | Business logic, cache (`withCache`), orchestration of repository calls. No `reply`. |
| **Repository** | `src/modules/<domain>/<domain>.repository.ts` | Only layer that calls `prisma`/`prismaRead`. `$queryRaw`, `$queryRawUnsafe`, `Prisma.sql`, Prisma ORM methods. Returns typed rows, never `Reply`. |

## File layout

```
src/
  modules/
    alerts/          alerts.repository.ts    alerts.service.ts
    clients/         clients.repository.ts   clients.service.ts
    deception/       deception.repository.ts deception.service.ts
    malware/         malware.repository.ts   malware.service.ts
    monitoring/      monitoring.repository.ts monitoring.service.ts
    protocol/        protocol.repository.ts  protocol.service.ts
    sensors/         sensors.repository.ts   sensors.service.ts
    sessions/        session.repository.ts   session.service.ts
    stats/           stats.repository.ts     (routes handle thin service layer)
    storage/         storage.repository.ts   storage.service.ts
    suricata/        suricata.repository.ts  suricata.service.ts
    threats/         threats.repository.ts   threats.service.ts
    web/             web.repository.ts       web.service.ts
  lib/              Pure transversal utilities only (geo, pagination, risk-score,
                    normalizer, date-utils, session-queries builders, sensor-utils).
                    No DB calls in lib/.
  routes/           Thin HTTP handlers.
```

## Key patterns

### Instantiation (KISS, no DI container)
```ts
// In the route:
const svc = new XService(fastify.prisma, fastify.prismaRead)
```

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
Some domains (deception, suricata, storage) use `$queryRawUnsafe` with positional
`$1...$N` params for dynamic filter lists. This is intentional and safe — the
integer/enum values are validated by Zod before being interpolated. Do not refactor
these to tagged-template `$queryRaw` without also fixing placeholder indexing.

### `lib/` boundary
Files that stay in `lib/`:
- Pure query-builder functions that return `Prisma.sql` objects without calling the DB (e.g. `session-queries.ts`, `web-normalize.ts`)
- Pure utility functions with no side effects (geo, pagination, risk-score, etc.)

Files that belong in `modules/<domain>/`:
- Anything that calls `prisma.$queryRaw`, `prisma.event.findMany`, `$executeRaw`, etc.

## Deuda técnica to keep in mind

- `routes/stats/utils.ts` contains `Prisma.sql` builder helpers (not DB calls) —
  it stays in `routes/stats/` as a shared utility for the stats domain.
- `lib/threat-route-queries.ts` and `lib/web-queries.ts` are now superseded by
  `modules/threats/threats.repository.ts` and `modules/web/web.repository.ts`
  respectively. The old `lib/` files can be deleted once confirmed unused.
