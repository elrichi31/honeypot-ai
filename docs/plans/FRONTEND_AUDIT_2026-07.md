# FRONTEND_AUDIT_2026-07

Frontend audit of `apps/dashboard` (Next.js App Router) looking for real bugs
and bad optimizations. Written to be handed to an AI: each task has the exact
file, the problem, the fix, and how to verify.

**Headline:** the dashboard is already heavily audited. Most of what a frontend
sweep would normally flag is **already done or deliberately deferred** in
existing plans (see "Already covered" below). Read that section first so you do
**not** redo settled work. Only two genuinely-new items remain, both small.

---

## Already covered — do NOT re-open these

Verified against the existing plans on 2026-07-13. If a sweep turns these up
again, they are known and handled:

- **Client-side fetch races / abort / `res.ok` / loading lifecycle** →
  [CLIENT_FETCH_HARDENING.md](CLIENT_FETCH_HARDENING.md). 19 components hardened;
  the shared hook `lib/use-fetch-json.ts` (`useFetchJson`) was **already
  extracted** (2026-07-07) and piloted in `attack-heatmap.tsx`. Migrating the
  remaining ~17 hand-rolled `AbortController`-in-`useEffect` components to the
  hook is a **deliberately-paced follow-up in that plan**, not a new finding.
  Do not propose "extract a fetch hook" — it exists.
- **Recharts code-splitting, missing `loading.tsx` skeletons, secret-form
  `clear()` feedback** → [done/FRONTEND_PERF_UX.md](done/FRONTEND_PERF_UX.md).
  All three shipped 2026-07-05. Recharts is also in Next 16's default
  `optimizePackageImports`, so no `next.config.js` change is needed.
- **First-load reliability (timeouts, retries, warm-up, query cost)** →
  [DASHBOARD_FIRST_LOAD.md](DASHBOARD_FIRST_LOAD.md).
- **Threat-graph drag jank + unbounded IoC nodes** → fixed 2026-07-13, commit
  `51ce3db`.

### Checked this pass, intentionally NOT a task

- **`key={index}` in lists** — reviewed ~30 hits (ai-summary, campaigns-view,
  intel-timeline, report PDF tables, threats factors, etc.). All are static or
  append-only lists with no local row state and no reordering, so index keys are
  safe. Leave them. Only revisit if a list becomes sortable/editable *and* holds
  per-row local state.
- **`loadLive` poll fetch without abort** —
  `components/monitoring/container-stats-chart.tsx:60`. The 120s poll fetch has
  no `AbortSignal`, so a fetch in flight at unmount resolves and calls `setState`.
  Harmless in React 18 (no warning, closure is GC'd). It resolves for free if
  this component ever adopts `useFetchJson`. Not worth a standalone fix.
- **Home / threats / sessions / credentials data fetching** — already server
  components using `Promise.all` (no waterfall) and searchParams-driven paging.
  Correct; do not touch.

---

## Task 1 — [MED] Align `audit` and `sessions-admin` to the app's server-component + searchParams pattern

**Problem.** `app/audit/page.tsx` and `app/sessions-admin/page.tsx` are
`"use client"` pages that fetch a paginated/filterable **read-only table** in a
`useEffect`. That is the exact shape the rest of the app already renders
**server-side**: `app/threats/page.tsx`, `app/sessions/page.tsx`, and
`app/credentials/page.tsx` are Server Components that fetch on the server,
validate `searchParams` with `Set` allowlists + `parsePage` (`lib/utils`), and
pass data into a **client table child** (e.g. `threats/threats-table.tsx`), with
any mutations living in that client child.

The two outliers pay for the divergence:
- **No SSR** of the first page → blank → spinner → data on every navigation,
  instead of server-rendered rows immediately.
- The whole page (table markup + all row logic) ships as **client JS**.
- **Inconsistency**: two ways to build the same "filterable table" screen.

This is not a new abstraction — it is **reusing the pattern that already lives a
few files over** (ponytail rung 2). The fetch-hardening effort made the current
client-fetch reliable, so this is a *consistency + perceived-load* improvement,
not a bug fix. These are auth-gated admin pages that mount infrequently, so
**do this when it's cheap, not as an emergency.** If the diff gets large or a
page turns out to be genuinely interactive-first, stop and leave it client — the
reliability is already fine.

**Reference implementation to copy:** `app/threats/page.tsx` (+ `threats-table.tsx`).
Note how it: (a) reads and validates `searchParams` (page, sort, filters) against
`Set` allowlists; (b) `await`s the server fetch; (c) renders a Server Component
shell with a client `<*Table>` child; (d) the client child changes the URL
(`pushParams`) to re-drive server rendering — no client `useEffect` fetch.

### 1a — `app/audit/page.tsx` (pure read-only log viewer)

Current: client page, `fetchAudit` in `useEffect` keyed on `[page, filterAction,
filterResource]` (already abort-guarded — see lines 276-301), pagination via
`setPage`, filters via `setFilterAction/Resource`.

Target:
- Make `page.tsx` a **Server Component**. Read `page`, `action`, `resource` from
  `searchParams`; validate `action`/`resource` against the same allowlists the
  filter dropdowns use; `parsePage(searchParams.page)`.
- Move the server fetch to a `lib/api` function (mirror `fetchThreatsPage`) — the
  audit data is currently fetched via `/api/audit`; call the same underlying
  source directly server-side (check whether `/api/audit` wraps a server helper
  that can be imported, to avoid an internal HTTP hop).
- Extract the table + filter controls + row-expand into a client child
  `audit-table.tsx` that changes the URL (mirror `threats-table.tsx`'s
  `pushParams`) instead of fetching. Row-expand local state (`expandedId`) stays
  in the client child.

### 1b — `app/sessions-admin/page.tsx` (read list + row mutations)

Same conversion, with one wrinkle: this page has **mutations** (delete session,
force-logout, refresh). Keep those as client actions inside the client table
child — exactly how the server pages already colocate a client table that owns
its interactions. Only the **list read** moves server-side; after a mutation,
`router.refresh()` re-runs the server fetch.

**Verify (both):**
1. `cd apps/dashboard && npx tsc --noEmit` clean.
2. Client-side navigate (click the nav, don't reload) to `/audit` and
   `/sessions-admin` → rows are present in the **first paint** (server-rendered),
   not after a spinner.
3. Change a filter / page → URL updates and server re-renders; back/forward
   button works (searchParams-driven, a free win of the pattern).
4. `sessions-admin`: delete/logout still work and the list updates.
5. Confirm the page's own `<table>`/row code is no longer in the client bundle
   (only the interactive child is `"use client"`).

---

## Task 2 — [LOW] Memoize context provider values

**Problem.** Three context providers build a **fresh value object every render**,
so every consumer re-renders whenever the provider re-renders — even consumers
whose slice didn't change, and inline callbacks (`toggle`, `setTenant`) get a new
identity each render (which can also bust `useCallback`/`useEffect` deps in
consumers).

- `components/tenant-context.tsx:75` — `value={{ isSuperadmin, tenantId, setTenant, clients }}`
- `components/locale-provider.tsx:60` — `value={{ locale, setLocale, t }}`
- `components/sidebar-collapse-context.tsx:38-42` — `value` object literal with an
  inline `toggle: () => ...` recreated each render.

(`components/timezone-provider.tsx:40` passes a primitive string — already fine,
leave it.)

**Honest severity — LOW.** Real-world impact is small: these providers re-render
**infrequently** (tenant switch, locale switch, sidebar collapse), and those are
already app-wide events. This is cheap hygiene against a latent footgun, not a
measured hot path. Ponytail: it's a one-liner each, low risk — do it, but don't
oversell it.

**Fix (each provider):** wrap the value in `useMemo` and stable callbacks in
`useCallback`. Example for `sidebar-collapse-context.tsx`:

```ts
const toggle = useCallback(() => setCollapsedState((c) => !c), [])
const value = useMemo<SidebarCollapseValue>(
  () => ({ collapsed, toggle, setCollapsed: setCollapsedState }),
  [collapsed, toggle],
)
```

Apply the same shape to `tenant-context.tsx` (memo on `[isSuperadmin, tenantId,
clients, setTenant]`, and `useCallback` the `setTenant`) and `locale-provider.tsx`
(memo on `[locale, setLocale, t]`; ensure `t` and `setLocale` are themselves
stable — `useCallback` — since `t` is likely used in consumer `useMemo` deps).

**Verify:** `tsc --noEmit` clean; app still switches tenant/locale and collapses
the sidebar correctly. No behavior change is expected — this is identity
stability only.

---

## Global verification

1. `cd apps/dashboard && npx tsc --noEmit` → no new errors.
2. Manual smoke of the touched screens (Task 1 pages, plus a locale/tenant/sidebar
   toggle for Task 2).
3. One commit per task: `refactor(dashboard): server-render audit page (searchParams)`,
   etc.

## Progress log

- 2026-07-13 — Plan created from a fresh frontend audit. Confirmed the bulk of
  the frontend is already hardened by CLIENT_FETCH_HARDENING / FRONTEND_PERF_UX /
  DASHBOARD_FIRST_LOAD; only Task 1 (2 outlier client pages vs the app's
  server+searchParams convention) and Task 2 (unmemoized context values) are new.

- 2026-07-13 — **Task 2 done.** Memoized the value objects in
  `components/tenant-context.tsx`, `components/locale-provider.tsx`, and
  `components/sidebar-collapse-context.tsx` with `useMemo` (+ `useCallback` on the
  sidebar `toggle`). `timezone-provider` left as-is (already a primitive value).
  `tsc --noEmit` clean. Behavior unchanged — identity stability only.

- 2026-07-13 — **Task 1a done (audit page → server component).**
  - Read side extracted into `lib/audit.ts` as `getAuditLog(params)` (lives with
    the existing `logAudit` writer — one module owns `audit_log` SQL). Returns a
    standard `PaginationMeta`.
  - `app/audit/page.tsx` is now a Server Component: `requireRole("analyst")` +
    `redirect("/login")` (a **security improvement** — the old client page
    rendered an empty shell for unauthorized users instead of redirecting),
    validates `page`/`pageSize`/`action`/`resource` from `searchParams` against
    `Set` allowlists, fetches server-side.
  - New client child `app/audit/audit-table.tsx` holds the presentational helpers
    + row-expand state; filters and pagination now drive the URL via `pushParams`
    / the shared `TablePagination` (gained a page-size selector for free).
  - **Deleted `app/api/audit/route.ts`** — it had no other consumer, so it was
    dead after the page stopped fetching it. SQL now has a single source of truth.
  - **Verified:** `tsc --noEmit` clean (the only reported error was a stale
    `.next/types` reference to the deleted route, regenerated on the next dev
    compile). On the running dev server, `/audit` compiles with no errors and
    returns `307 → /login` when unauthenticated (auth gate works). **Not yet
    driven:** the authenticated data render (needs a login session + live DB);
    the refactor is mechanically faithful to the original (same SQL, same JSX),
    so risk is low, but a signed-in smoke test on real data is the remaining
    verification step.

- 2026-07-13 — **Task 1b (sessions-admin) — deliberately NOT converted.**
  Applied the plan's own escape hatch ("if a page is genuinely interactive-first,
  leave it client"). `app/sessions-admin/page.tsx` has **no pagination and no
  filters**, so the server + `searchParams` pattern would buy it nothing — there
  is no URL state to lift. It is interactive-first: revoke-session / revoke-user
  mutations with **optimistic list updates** (`setSessions(cur => cur.filter…)`)
  over a small, typically tiny list. Converting it would force re-holding the
  same client state anyway (or downgrade the optimistic UX to `router.refresh()`
  round-trips) for the sole gain of SSR-ing one spinner on a rarely-visited admin
  page. Net negative under YAGNI. **Decision: keep it client.**

## Technical debt / follow-ups

- **[LOW] `app/sessions-admin/page.tsx` `load()` is an unhardened straggler.**
  It uses `.finally(() => setLoading(false))` with no `AbortController`/cancelled
  flag — the pattern CLIENT_FETCH_HARDENING standardizes. It does **not** exhibit
  that plan's actual bug (nothing aborts here: `load` has stable `[]` deps and
  always hits the same endpoint, so `.finally` only runs after a successful
  fetch, never after an abort-with-empty-data). Low priority; fold it into the
  next pass over that file, or when migrating remaining components to
  `useFetchJson`.
- **[LOW] Task 1a authenticated render** not yet smoke-tested against a live DB
  (see Task 1a note above).
- The **`useFetchJson` migration** of the ~17 remaining hand-rolled fetch
  components remains owned by CLIENT_FETCH_HARDENING, not this plan.
