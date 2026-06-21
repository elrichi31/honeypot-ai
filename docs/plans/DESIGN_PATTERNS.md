# Design patterns — refactor opportunities

A code-level audit (2026-06-21) of the dashboard + ingest-api looking for
duplication that a well-known design pattern would remove. **Nothing here is
implemented yet** — this is a prioritized backlog. Each item lists the smell,
the pattern, the concrete files, the win, and the risk so we can pick them off
one at a time (per the KISS rule: only adopt a pattern where the duplication is
real, not hypothetical).

Ordered by value/effort. Items 1–2 are high-confidence, low-risk. Items 3–4 are
worth doing but bigger.

---

## 1. ✅ Unify the two API-proxy helpers — **Adapter / single Facade** *(done 2026-06-21)*

**Smell.** Two helpers do the same job (timeout-bounded fetch to ingest-api +
safe JSON parse + error→status mapping) with *different shapes*:

- [`lib/api/proxy.ts`](../../apps/dashboard/lib/api/proxy.ts) → `proxyGet()`
  returns a ready `NextResponse`. Used by **14** routes.
- [`lib/api/server.ts`](../../apps/dashboard/lib/api/server.ts) → `proxyJson()`
  returns a `{ ok, status, data | error }` result. Used by **9** routes.

They differ trivially (one uses `INTERNAL_API_URL` env directly, the other
`getApiUrl()`; one reads `res.json()`, the other `res.text()`+`JSON.parse`; one
adds the ingest auth header, the other doesn't). The error-mapping logic
(timeout→503/504, unreachable→502, non-JSON→502) is copy-pasted in both.

**Pattern.** One core `proxyRaw()` returning the discriminated result
(`proxyJson`'s shape is the right primitive), plus a thin
`proxyResponse()` adapter that wraps it into a `NextResponse` for the routes
that just relay. `proxyGet` becomes `proxyResponse(path)`.

**Win.** ~50 lines of duplicated error mapping collapses to one place. The
`if (!result.ok) return Response.json({ error }, { status })` boilerplate
repeated across **11 route handlers** becomes a one-liner. New routes pick one
helper, not two with a coin-flip.

**Files.** `lib/api/proxy.ts` (rewritten as unified core), `lib/api/server.ts`
(now a thin re-export shim). Zero route files changed — backward-compat exports
kept. `tsc --noEmit` passes clean.

**Risk.** Low. Pure refactor, no behavior change if the merged timeout/header
defaults are chosen carefully (proxyGet defaults 8s no-auth; proxyJson 10s
+auth — keep both as explicit options).

**Done.** `proxyRaw()` is the new core (returns `ProxyResult`). `proxyGet()` /
`proxyResponse()` are thin `NextResponse` adapters. `server.ts` re-exports
`proxyRaw as proxyJson` so existing imports compile unchanged.

---

## 2. Extract the "secret field" settings form — **Composition / reusable component**

**Smell.** Four settings forms are ~90% identical:
[`openai-form.tsx`](../../apps/dashboard/components/settings/openai-form.tsx),
[`discord-form.tsx`](../../apps/dashboard/components/settings/discord-form.tsx),
[`ingest-secret-form.tsx`](../../apps/dashboard/components/settings/ingest-secret-form.tsx),
and the key rows inside
[`enrichment-form.tsx`](../../apps/dashboard/components/settings/enrichment-form.tsx).
Each re-implements: a password input with an Eye/EyeOff show-hide toggle, a
loading skeleton state, a `save()` that POSTs to `/api/config` and flips
`SaveStatus`, a `clear()`, a "Configured" badge, and `onKeyDown` Enter-to-save.
Only the config key name, label, placeholder, and icon differ.

Partial helpers already exist (`SaveFeedback`, `SaveButton`, `CardHeader` in
[`setting-card.tsx`](../../apps/dashboard/components/settings/setting-card.tsx))
— this finishes the job for the input body + handlers.

**Pattern.** A `<SecretField>` controlled component (show/hide, loading, value)
plus a `useConfigField(key)` hook that encapsulates GET-on-mount, save, clear,
and status. Each form shrinks to a declarative call:
`useConfigField("openaiApiKey")` + `<SecretField .../>`.

**Win.** ~110 lines/form × 4 → one component + one hook. Bug fixes (e.g. the
"don't save the masked `•` value back" guard) live in one place instead of four.

**Files.** New `components/settings/secret-field.tsx` + `lib/use-config-field.ts`;
rewrite the 4 forms.

**Risk.** Low-medium. Each form has small quirks (Discord has a "send test"
button, openai pre-populates the masked key, enrichment has multiple fields).
Keep those bits in the form; only the shared secret-input mechanics move out.

---

## 3. Declarative config schema — **Registry / Strategy** (backend of #2)

**Smell.** [`app/api/config/route.ts`](../../apps/dashboard/app/api/config/route.ts)
hand-writes ~20 `if ("x" in body) config.x = ...` lines on POST, plus a parallel
hand-built JSON object on GET, plus a hand-maintained list of "secret fields to
mask" and "secret fields to exclude from audit." These three lists must be kept
in sync by hand — adding a setting means editing the route in 3 places, and the
masked-value (`•`) guard is copy-pasted per secret field.

**Pattern.** A single `CONFIG_FIELDS` registry: one entry per setting declaring
its type (`string | number | secret | enum | object`), default, validation
(min/max/trim), and `secret: true`. GET maps the registry → response (auto-mask
secrets); POST iterates the registry → validates + assigns; the audit
exclude-list derives from `secret: true`. Classic table-driven / registry
pattern.

**Win.** Adding a setting = one registry entry instead of touching 3 hand-kept
lists. The mask guard and clamp logic are written once. Removes a whole class of
"forgot to mask the new key" bugs.

**Files.** `lib/server-config.ts` (add the registry next to the config type),
`app/api/config/route.ts` (collapse GET+POST to registry loops).

**Risk.** Medium. The config route is security-sensitive (masking, audit). Needs
a test asserting every secret is masked on GET and the `•` guard holds. Worth a
`*.test.ts` before/after to prove equivalence.

---

## 4. Standardize scoped-list route handlers — **Template Method / higher-order handler**

**Smell.** The multi-tenant list routes (alerts, threats, defense, clients/*)
each repeat the same skeleton: `requireRole` → `effectiveScope(auth)` → build a
scoped querystring → `proxyJson` → relay `result.ok ? data : error`. The
`scopedQuery()` helper is even copy-pasted verbatim into multiple route files
rather than shared. Only **3** routes currently use `effectiveScope`, but the
multi-tenant roadmap ([MULTI_TENANT_ROADMAP.md](MULTI_TENANT_ROADMAP.md)) wants
this on *every* list endpoint — so the duplication is about to multiply.

**Pattern.** A `scopedProxyRoute({ role, path })` higher-order function that
returns a Next route handler, encapsulating the auth→scope→query→proxy→relay
template. Routes become a 1-line declaration:
`export const GET = scopedProxyRoute({ role: "viewer", path: "/alerts" })`.

**Win.** Lands the multi-tenant scoping consistently and correctly on every new
endpoint by construction (you can't forget the scope step — it's baked in).
Collapses each scoped route to a single line; kills the duplicated
`scopedQuery`.

**Files.** New `lib/api/scoped-route.ts`; migrate the scoped routes under
`app/api/alerts`, `app/api/threats`, `app/api/defense`, `app/api/clients`. Pairs
naturally with the multi-tenant rollout.

**Risk.** Medium. Higher-order route handlers can obscure per-route quirks
(custom query params, POST bodies). Start with the pure GET-list routes; leave
routes with bespoke logic as hand-written. Do this **alongside** the
multi-tenant work, not as a separate pass.

---

## Explicitly NOT worth a pattern right now

- **ingest-api routes** are already well-factored: shared `withCache`,
  `pagination`, `threat-format`, `threat-route-queries`, `client-helpers`
  helpers. The big files (`web.ts` 479L, `deception.ts` 431L) are long because
  they have many endpoints, not because of duplication. Leave them.
- **Server Components data-fetching** — most pages fetch on the server with no
  loading/error state machine (only 7 client components hold `loading`/`error`
  state). There's no widespread client-fetch duplication to abstract. Don't
  introduce a data-fetching library for 7 components.
- **Heatmap colors** — already unified (2026-06-21, `lib/heatmap-color.ts`).
