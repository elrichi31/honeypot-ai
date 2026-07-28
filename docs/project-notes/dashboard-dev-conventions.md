# Dashboard dev conventions & gotchas

Things about working in `apps/dashboard` (Next.js App Router) that aren't
obvious from the code and have already caused real bugs once.

## RSC gotcha: never pass a function or component as a prop from a Server
## Component to a Client Component

`tsc` compiles it without error, but it crashes at **runtime** with infinite
recursion in the render stack (`i4 → us → i4 → …`) and the page fails to
load. Happened once on `/iocs`: a Server Component passed `icon={SomeComponent}`
and `renderMeta={someFn}` down into a `"use client"` child.

**Fix:** only pass serializable data across that boundary (e.g. `kind:
"ip" | "hash"`, plain strings/numbers/objects). Resolve the icon, formatter,
or callback **inside** the client component itself, not above it.

This is fine and does **not** trigger the gotcha: a Server Component
rendering `<Icon />` directly in its own JSX (no crossing into a client
child), or a Server Component rendering a Client Component with **no**
function/component props at all (e.g. `<TrendsExplorer />` with zero props).
The bug is specifically about a function/component *reference* crossing the
server→client prop boundary.

## Testing

The dashboard has **no test runner** (no vitest/jest) — that's deliberate,
not an oversight; adding one would be over-engineering for how little pure
logic lives outside components. For pure/testable modules, write plain
`node:test` tests and run them with `npx tsx --test path/to/file.test.ts`
(tsx is already a dependency). `*.test.ts` files are excluded from the Next
build via `apps/dashboard/tsconfig.json`'s `exclude`.

`apps/ingest-api` is different — it uses vitest (`npm test` /
`npx vitest run`), with real test files under `tests/` and co-located
`*.test.ts` next to the module they cover.

**Standard verification before committing dashboard work:** `npx tsc
--noEmit` (0 errors) in the touched package, plus any tests. For DB-touching
changes, apply the migration to a local database and verify with real SQL —
compiling clean isn't the same as being correct.

## Don't commit `apps/dashboard/tsconfig.tsbuildinfo`

It's a build cache that ended up tracked in the repo by accident. Never
include it in `git add` — stage files explicitly rather than `git add -A`/`.`
in this package for exactly this reason.

## Tailwind purge in production

`next build` purges any class that doesn't appear **literally** in source.
Bit twice by the monitoring activity chart:

1. Dynamically-generated classes via template literals (e.g.
   `` `bg-cyan-500/60` ``, `` `h-${n}` ``) get purged even though they work
   fine in `next dev` — dev doesn't purge, prod does. Use `style={{ ... }}`
   inline instead for anything computed at runtime.
2. Percentage heights (`height: "X%"`) on a flex/grid child only work if the
   parent has an **explicit** height. A `flex-1` parent gives the child
   nothing to measure a percentage against, so it collapses to 0 — use
   absolute pixels there instead.
3. Before using a class that's genuinely new to the codebase, grep for it in
   another file first. If nothing else uses it, prefer an inline style over
   trusting that Tailwind's purge will keep it.
