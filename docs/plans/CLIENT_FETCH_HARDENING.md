# CLIENT_FETCH_HARDENING

Plan to fix the unreliable client-side data fetching across the dashboard.
Symptom that started this: when navigating to a client page (e.g.
`/clients/cop-pz`), the activity chart and alerts render **empty on first
load**, but a full F5 reload shows the data correctly.

This plan is written to be handed to an AI/automation. Each task is
self-contained, with the **exact file, the current (broken) code, the target
code, and how to verify**. Apply tasks top to bottom. Each task = one commit.

---

## Background: why "first load empty, reload fixes it"

The pages under `/clients/[slug]` are Server Components, but the chart, alerts,
stats bar and logs viewer are **client components that fetch on mount** with
`useEffect` + `fetch`.

The root cause is a combination of two anti-patterns that compound under React's
behavior on the first client navigation:

1. **`useEffect` without a cleanup guard.** React (Strict Mode in dev, and
   double-invocation semantics in general) mounts → unmounts → remounts a
   component on the first render. Each mount fires the effect. Without a
   `cancelled` flag or `AbortController`, the first (now-stale) request can write
   its result into a component that the second mount already replaced — or its
   cleanup can clobber the second request's state.

2. **`.finally(() => setLoading(false))`.** `.finally` runs **even when the
   request was aborted**. So the sequence becomes:
   - mount #1 → `fetch` A, `loading=true`
   - remount → abort A, `fetch` B (`loading=true`)
   - A rejects with `AbortError` → `.catch` ignores it ✅ but `.finally` still
     runs → `setLoading(false)` while `items=[]`
   - Component shows the empty state even though B is still in flight.

   On a full reload there is no remount/abort dance, so it "works".

The fix pattern (already applied to the 4 client-page components in commits
`8ea84dc` and `ba00d70`) is:

- Add a cleanup: `AbortController` (preferred) **or** a `let cancelled = false`
  flag returned from the effect.
- **Never** put `setLoading(false)` (or any state setter) in `.finally()`.
  Put it inside `.then()` and `.catch()`, each guarded by the
  cancelled/abort check.
- In `.catch`, ignore `AbortError` (`if (err?.name === "AbortError") return`)
  before touching state.
- Check `res.ok` before `res.json()` so an HTTP error (401/500) is not parsed
  as if it were valid data.

### The canonical safe pattern

Use this everywhere. AbortController variant (preferred when the fetch supports
passing a signal):

```ts
useEffect(() => {
  const controller = new AbortController()
  setLoading(true)
  fetch(url, { signal: controller.signal })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    .then((data) => {
      setData(/* parse */ data)
      setLoading(false)
    })
    .catch((err) => {
      if (err?.name === "AbortError") return
      setData(/* empty */)
      setLoading(false)
    })
  return () => controller.abort()
}, [deps])
```

`cancelled`-flag variant (use when you can't thread a signal, e.g. `apiFetch`
wrappers that don't forward one — see Task 1):

```ts
useEffect(() => {
  let cancelled = false
  setLoading(true)
  doFetch()
    .then((data) => { if (!cancelled) { setData(data); setLoading(false) } })
    .catch(() => { if (!cancelled) { setData(empty); setLoading(false) } })
  return () => { cancelled = true }
}, [deps])
```

---

## Status of the 4 client-page components (already fixed — do NOT touch)

These were fixed in commits `8ea84dc` and `ba00d70`. Listed here so the AI does
not re-edit them. Verify they still match the canonical pattern; otherwise leave
them alone.

- `apps/dashboard/components/clients/client-activity-chart.tsx` — `cancelled` flag, `setLoading` in `.then`/`.catch`. ✅
- `apps/dashboard/components/clients/client-alerts.tsx` — `AbortController`, AbortError guard. ✅
- `apps/dashboard/components/clients/client-stats-bar.tsx` — `AbortController`. ✅
- `apps/dashboard/components/clients/client-logs-viewer.tsx` — `AbortController`. ✅

---

## Tasks

Priority order: the components a user actually sees rendering empty come first
(heatmap, ingestion chart, retention, OVA dialog). The auth/profile pages mount
once and are lower risk, so they come last.

### Task 1 — `components/clients/client-ova-download.tsx`

**Problem:** Two fetches with `.finally(() => setConfigLoading(false))` and no
cleanup, no `res.ok` check. The dialog config can flash an error / stick on the
spinner if the dialog is opened/closed quickly. Note `apiFetch` here is the
**client wrapper** `@/lib/client-fetch` (returns a `Response`), not the server
`apiFetch`. Check whether it forwards an `init`/signal — if it does, use
`AbortController`; if not, use the `cancelled` flag. Verify by reading
`apps/dashboard/lib/client-fetch.ts` first.

**Current (lines ~54-67):**
```ts
useEffect(() => {
  if (!open) return
  setConfigLoading(true)
  setConfigError(null)
  apiFetch("/api/ova/config")
    .then(r => r.json())
    .then((data: OvaConfig & { error?: string }) => {
      if (data.error) setConfigError(data.error)
      else setConfig(data)
    })
    .catch(() => setConfigError(t("sensors.config.loadError")))
    .finally(() => setConfigLoading(false))
}, [open])
```

**Target (cancelled-flag variant, since the dialog open/close is the race):**
```ts
useEffect(() => {
  if (!open) return
  let cancelled = false
  setConfigLoading(true)
  setConfigError(null)
  apiFetch("/api/ova/config")
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<OvaConfig & { error?: string }>
    })
    .then((data) => {
      if (cancelled) return
      if (data.error) setConfigError(data.error)
      else setConfig(data)
      setConfigLoading(false)
    })
    .catch(() => {
      if (cancelled) return
      setConfigError(t("sensors.config.loadError"))
      setConfigLoading(false)
    })
  return () => { cancelled = true }
}, [open])
```

**Also (lines ~199-206):** there is a duplicated inline "redetect" fetch in the
button `onClick` with the same `.then(r=>r.json())...finally()` chain. This is an
event handler (not an effect), so cleanup is less critical, but it still lacks a
`res.ok` check and **duplicates** the config-fetch logic — violating DRY. Extract
the config fetch into a single local helper `loadConfig()` and call it from both
the effect and the redetect button. The helper should set `configLoading`,
`config`, and `configError` and check `res.ok`.

**Verify:** open the OVA dialog on a client page, watch Network tab — spinner
resolves to config; rapidly open/close → no stuck spinner, no console error.

---

### Task 2 — `components/storage/ingestion-chart.tsx`

**Problem:** `.finally(() => setLoading(false))` + no `res.ok` check. The
`load` callback re-runs on `range` change; switching ranges quickly can leave the
chart on the spinner or showing stale/empty data.

**Current (lines 63-72):**
```ts
const load = useCallback((r: Range) => {
  setLoading(true)
  fetch(`/api/storage/ingestion?range=${r}`)
    .then(res => res.json())
    .then((d: unknown) => setData(Array.isArray(d) ? d : []))
    .catch(() => setData([]))
    .finally(() => setLoading(false))
}, [])

useEffect(() => { load(range) }, [range, load])
```

**Target:**
```ts
const load = useCallback((r: Range, signal?: AbortSignal) => {
  setLoading(true)
  fetch(`/api/storage/ingestion?range=${r}`, { signal })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((d: unknown) => { setData(Array.isArray(d) ? d : []); setLoading(false) })
    .catch((err) => { if (err?.name !== "AbortError") { setData([]); setLoading(false) } })
}, [])

useEffect(() => {
  const controller = new AbortController()
  load(range, controller.signal)
  return () => controller.abort()
}, [range, load])
```

**Verify:** open the storage page, toggle 24h/7d/30d rapidly → the chart always
settles on the data for the **last** selected range, never stuck spinning.

---

### Task 3 — `components/attack-heatmap.tsx`

**Problem:** No cleanup, `.finally(() => setLoading(false))`, no `res.ok` check.
`days` is a prop; if it changes (or on the first-navigation remount) the heatmap
can render empty.

**Current (lines 31-37):**
```ts
useEffect(() => {
  fetch(`/api/stats/heatmap?days=${days}`)
    .then(r => r.json())
    .then(setData)
    .catch(() => {})
    .finally(() => setLoading(false))
}, [days])
```

**Target:**
```ts
useEffect(() => {
  const controller = new AbortController()
  setLoading(true)
  fetch(`/api/stats/heatmap?days=${days}`, { signal: controller.signal })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    .then((d) => { setData(d); setLoading(false) })
    .catch((err) => { if (err?.name !== "AbortError") setLoading(false) })
  return () => controller.abort()
}, [days])
```

Note: keep `setData` only on success; on error leave `data` as `null` so the
existing `if (!data) return null` branch holds. Add `setLoading(true)` at the
top of the effect so a `days` change re-shows the spinner.

**Verify:** load the dashboard/home where the heatmap renders → it fills in on
first navigation (not just on reload).

---

### Task 4 — `components/storage/retention-settings.tsx`

**Problem:** No cleanup, `.finally(() => setLoading(false))`, no `res.ok` check.
Mounts once per storage-page visit; lower frequency but same class of bug.

**Current (lines 151-164):**
```ts
useEffect(() => {
  fetch("/api/storage/retention")
    .then(r => r.json())
    .then((d: { settings?: RetentionRow[]; lastRun?: RetentionRun | null; nextRunAt?: string | null; intervalMinutes?: number }) => {
      if (Array.isArray(d.settings)) {
        setRows(d.settings.map((r) => ({ ...r, draft: String(r.retentionDays), saving: false, saved: false })))
      }
      setLastRun(d.lastRun ?? null)
      setNextRunAt(d.nextRunAt ?? null)
      if (d.intervalMinutes) setIntervalMinutes(d.intervalMinutes)
    })
    .catch(() => {})
    .finally(() => setLoading(false))
}, [])
```

**Target:**
```ts
useEffect(() => {
  const controller = new AbortController()
  fetch("/api/storage/retention", { signal: controller.signal })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<{ settings?: RetentionRow[]; lastRun?: RetentionRun | null; nextRunAt?: string | null; intervalMinutes?: number }>
    })
    .then((d) => {
      if (Array.isArray(d.settings)) {
        setRows(d.settings.map((r) => ({ ...r, draft: String(r.retentionDays), saving: false, saved: false })))
      }
      setLastRun(d.lastRun ?? null)
      setNextRunAt(d.nextRunAt ?? null)
      if (d.intervalMinutes) setIntervalMinutes(d.intervalMinutes)
      setLoading(false)
    })
    .catch((err) => { if (err?.name !== "AbortError") setLoading(false) })
  return () => controller.abort()
}, [])
```

**Verify:** open storage settings → retention rows + interval load on first
navigation.

---

### Task 5 — `components/ip-enrichment.tsx`

**Problem (lines ~330-341):** Already uses a `cancelled` flag (good) but does
**not** check `res.ok` before `res.json()`. Add the `res.ok` check inside the
existing chain; do not change the cancelled-flag structure.

**Action:** locate the `.then(r => r.json())` and replace with:
```ts
.then(async (r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
})
```
Leave the `if (cancelled) return` guards as they are.

**Verify:** open an IP enrichment popover/panel for a known IP → data renders;
for an IP that 404s on the enrichment API, the component shows its empty/error
state instead of crashing on a parse.

---

### Task 6 — `app/monitoring/page.tsx`

**Problem:** The `useEffect` (lines ~72-78) already returns `controller.abort()`
(good), but the `refresh()` function (lines ~48-70) runs a `Promise.allSettled`
of fetches that do **not** receive the abort signal, and at least one branch
skips the `res.ok` check.

**Action:**
- Thread the effect's `AbortController.signal` into every `fetch` inside
  `refresh()`.
- For each fetch, gate the JSON parse on `res.ok`.
- In the `allSettled` results handling, ignore `AbortError` rejections.
- Do not write state after abort (check `signal.aborted` before `setState`, or
  rely on the AbortError being swallowed).

**Verify:** open monitoring, navigate away mid-refresh → no "setState on
unmounted component" warning, no flashing of stale data.

---

### Task 7 — `app/login/page.tsx` and `app/setup/page.tsx`

**Problem:** Both have a mount effect that calls `r.json()` with no `res.ok`
check and no cleanup. These pages mount once and immediately redirect, so the
race is unlikely, but the missing `res.ok` check means an HTML error page
(e.g. a 500 from the auth check endpoint) would throw a confusing JSON parse
error instead of a clean fallback.

**Action (both files, identical shape):** wrap the parse with the `res.ok`
check and add a `cancelled` flag:
```ts
useEffect(() => {
  let cancelled = false
  fetch(checkUrl)
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    .then((d) => { if (!cancelled) { /* existing redirect/setState */ } })
    .catch(() => { if (!cancelled) setChecking(false) })
  return () => { cancelled = true }
}, [/* existing deps */])
```
Keep the existing redirect logic; only wrap parse + guard state.

**Verify:** logged-out → `/login` still redirects correctly when already
authed; fresh DB → `/setup` still shows the setup flow.

---

### Task 8 — `app/profile/page.tsx`

**Problem (lines ~38-45):** mount effect, no `res.ok` check, no cleanup,
`.catch(() => {})` swallows everything silently.

**Action:** same canonical fix as Task 7 (`cancelled` flag + `res.ok`). Keep the
silent catch behavior if a failed profile load should not surface an error, but
still guard state with the flag.

**Verify:** open `/profile` → user data loads on first navigation.

---

## Cross-cutting: consider a shared hook (optional, after Tasks 1-8)

After the above are applied, the same ~12 lines are repeated across ~10
components. Per the repo's DRY principle, evaluate extracting a tiny hook:

```ts
// apps/dashboard/lib/use-fetch-json.ts
export function useFetchJson<T>(url: string | null, deps: unknown[]): {
  data: T | null; loading: boolean; error: string | null
}
```

It would encapsulate: AbortController, `res.ok` check, AbortError swallowing,
and `loading` lifecycle. **Do not build this speculatively** — only extract once
Tasks 1-8 prove the pattern is identical enough. Components with bespoke parsing
(logs viewer, alerts pagination) may stay hand-written. This is a follow-up, not
a blocker. If pursued, migrate one component first and verify before converting
the rest.

---

## Global verification checklist

After all tasks:

1. `cd apps/dashboard && npx tsc --noEmit` → no type errors.
2. `npm run lint` (or the repo's lint script) → clean.
3. Manual: with React Strict Mode on (dev), navigate **client-side** (click,
   don't reload) to:
   - `/clients/<slug>` → activity chart + alerts + stats + logs all populate.
   - storage page → ingestion chart + retention settings populate.
   - home/dashboard → attack heatmap populates.
   - monitoring → no unmount warnings when navigating away mid-load.
4. Grep guard — there should be **no** remaining `.finally(() => setLoading`
   (or any state setter in `.finally`) in client components:
   ```
   grep -rn "\.finally(" apps/dashboard/components apps/dashboard/app
   ```
   Review each remaining hit; a `.finally` with no state setter is fine.
5. Grep guard — fetches that parse without an ok-check:
   ```
   grep -rn "\.then(r => r.json())" apps/dashboard
   grep -rn "\.then(res => res.json())" apps/dashboard
   ```
   Each should now go through an `if (!r.ok) throw` step (or be a deliberate
   exception that's documented).

---

## Commit discipline

- One task = one commit. Message format:
  `fix(dashboard): harden <component> fetch (abort + ok-check)`
- After finishing, update this file: check off completed tasks with the date and
  commit hash, and note any component that turned out not to need the fix.

## Progress log

- 2026-06-29 — Plan created. Client-page components (chart/alerts/stats/logs)
  already fixed in `8ea84dc` + `ba00d70`. Tasks 1-8 pending.
- 2026-06-29 — Tasks 1-8 implemented and committed. All components now use
  `AbortController` or `cancelled` flag, `res.ok` check before `r.json()`, and
  no `setLoading` in `.finally()`. TypeScript clean (`tsc --noEmit`). Monitoring
  page onClick handler wrapped to avoid passing `MouseEvent` as `AbortSignal`.
  `ip-enrichment.tsx` `doFetch()` is a manual trigger (not an effect), so
  `.finally(() => setLoading(false))` is retained there — only the `res.ok`
  check was missing.
- **2026-07-05 — audit found 11 more components with the same antipattern**,
  none of them in the original Tasks 1-8 list (the index README said "Tasks
  1-8 pending" but this file's own log said done — both were stale about the
  remaining surface). Fixed all 11, verified `tsc --noEmit` clean and the
  plan's grep guards (`.finally(` with a state setter, `.then(r => r.json())`
  without an `.ok` check) both return zero hits outside `node_modules`.

  **Task 9 — `components/defense/blocked-ips-table.tsx`**: mount effect
  (`useEffect(load, [])`), no cleanup, no `res.ok`. `load()` now takes an
  optional `signal`, effect wraps it in `AbortController`.

  **Task 10 — `components/defense/defense-allowlist.tsx`**: identical shape
  to Task 9, same fix.

  **Task 11 — `components/defense/defense-events-table.tsx`**: `load(p, f,
  ip)` effect re-runs on filter/search change — a fast filter toggle could
  let a stale response overwrite the current one. Added `signal` param,
  `AbortController` in the effect; `goPage()` (manual pagination) still calls
  `load()` without a signal since it's a one-off user action, not a race.

  **Task 12 — `components/settings/ingest-api-card.tsx`**: mount effect +
  manual "re-detect" button sharing `load()`. Same `signal` param fix as
  Task 1 (`client-ova-download.tsx`); `onClick={load}` changed to
  `onClick={() => load()}` so the click `MouseEvent` isn't passed as a
  signal.

  **Task 13 — `app/alerts/page.tsx` (`fetchAlerts`)**: already used
  `AbortController` correctly, but still had `setLoading(false)` in
  `.finally()` — the same "finally runs even after abort" bug the plan's
  intro describes, just missed in the original audit because the component
  looked correct at a glance. Moved `setLoading(false)` into `.then`/`.catch`.

  **Task 14 — `components/sensors/add-sensor-button.tsx`**: dialog-open
  handler, fetch gated by `!config` so re-opening never re-triggers it once
  resolved — no real race to guard against. Added `res.ok` only, no
  cancellation needed.

  **Task 15 — `components/sensors/sensor-config-dialog.tsx`**: real
  `useEffect` keyed on `[open, sensorId]`, uses the `apiFetch` client wrapper
  (doesn't forward a signal) — used the `cancelled`-flag variant, and
  switched the parse to reuse the already-imported `assertOk` instead of a
  bespoke `res.ok` check.

  **Task 16 — `components/session-row.tsx`**: `useEffect` keyed on
  `[expanded, events, session.id]` — expand/collapse quickly could leave a
  stale response landing after collapse. `cancelled`-flag fix.

  **Task 17 — `app/malware/malware-table.tsx` (`ArtifactRow.toggle`)**: same
  shape as Task 14 — gated by `lookup === null`, no real race. `res.ok` only.

  **Task 18 — `components/settings/infrastructure-form.tsx`**: two fetches
  (`loadOvaConfig`, reused by a manual "re-detect" button, and the `/api/config`
  mount effect). Added `res.ok` to both; the mount effect also got a
  `cancelled` flag since it's a real `useEffect`.

  **Task 19 — `components/ip-enrichment.tsx`**: `doFetch()` already had the
  `res.ok` check (from the earlier pass), but the mount effect is keyed on
  `[ip]` — switching between two IPs fast (e.g. hovering different enrichment
  popovers) had no cancellation, so a slow response for the first IP could
  overwrite the second IP's data. Added `AbortController`; the manual "Query
  now" retry button now calls `doFetch()` (no signal) since it's a one-off
  action, not a race with itself.

  Cross-cutting hook (mentioned in the plan as optional, deferred): still not
  extracted — 19 components now share the same ~10-line shape, which is a
  stronger case for `useFetchJson` than before, but out of scope for this
  pass. Left as a follow-up, not re-opened as a task here.

- **2026-07-07 — cross-cutting hook extracted and piloted.** Added
  `apps/dashboard/lib/use-fetch-json.ts` — `useFetchJson<T>(url, deps)`
  encapsulates `AbortController`, `res.ok` check, `AbortError` swallowing, and
  `loading`/`error` lifecycle. Migrated `components/attack-heatmap.tsx` (Task 3)
  as the pilot: its effect was an exact match for the canonical pattern
  (single fetch keyed on `days`, no bespoke parsing), so it collapsed to one
  hook call. `tsc --noEmit` clean. Components with bespoke parsing/pagination
  (logs viewer, alerts, defense tables) are left hand-written per the plan's
  own guidance — only migrate components that match the canonical shape
  exactly, not speculatively.
