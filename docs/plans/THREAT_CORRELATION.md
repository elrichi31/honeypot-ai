# Threat correlation & risk scoring

How Threat Intelligence decides that an IP matters, and what it still can't see.

## Background

The risk score (`lib/risk-score.ts` → `lib/risk-factors.ts`) was originally built
from telemetry volume alone: SSH sessions, web attack *types*, protocol events,
port scans. A 2026-07-30 review found three gaps that made heavily-reported
attackers read as MEDIUM:

- Signals that are **proof of intent** (canary tokens, captured malware, IDS
  alerts) lived in the same Postgres but were never scored.
- The web factor counted attack *types* only, so 1 hit and 26 300 hits scored
  identically.
- Correlation keys on `src_ip` alone, so an attacker rotating IPs fragments into
  N low-score threats.

---

## Done — 2026-07-30

Shipped in `fix(threats): score hard evidence and align detail window`.

- **Evidence factor** (`scoreEvidenceFactor`). Canary triggers, `malware_samples`
  and `suricata_alerts` now score, and surface as `breakdown.evidence` on the
  detail page. Canary is weighted at 40 (clears MEDIUM alone) because
  `catalog/shared.py#_check_canary` only fires when the attacker submits the
  exact planted credential — the `ip_specific` variant is an HMAC of their own
  IP, obtainable only by reading the leaked file. No false-positive surface.
- **Web volume** scales by order of magnitude (`WEB_VOLUME_PTS_PER_DECADE`,
  capped at 12) instead of being ignored. `RiskInput.webHits` was previously
  declared, passed, and never read.
- **New sources in the aggregate.** `malware_agg` / `suricata_agg` CTEs in the
  scoped query and in the matview (migration
  `20260730120000_threat_ip_summary_add_evidence`), both joined into `all_ips`
  so an IP known *only* by IDS or malware capture still appears as a threat.
- **Detail window aligned with the list.** `getThreatByIp` takes `windowDays`
  and every per-IP query filters on it; `/threats/:ip` accepts the same `period`
  param. Previously the list windowed and the detail did not, so the same IP
  scored differently in the table and on its own page.
- **Deterministic command sampling.** `queryCommandRows` had `LIMIT 10000` with
  no `ORDER BY`; the cut landed wherever the plan did, so an IP could lose its
  command categories between cache refreshes and silently score lower.
- Self-check: `apps/ingest-api/src/lib/risk-score.test.ts` (`npx tsx`).

**Deployment note:** the migration does `DROP MATERIALIZED VIEW` + `CREATE …
WITH DATA`. On prod-sized data this holds a lock for the duration of the
rebuild — run it in a maintenance window, and confirm `matview-refresh.ts` is
not mid-cycle. See [replica-rebuild-runbook] in project notes if the replica
lags afterwards.

---

## Next — fingerprint correlation (not started)

**Problem.** `web_hits.client_fingerprint` (passive TLS/HTTP fingerprint) is
already captured and already drives `/web-attacks/sessions`, but Threat
Intelligence never reads it. An attacker rotating through a /24 shows up as 40
separate INFO-level IPs instead of one CRITICAL actor. This is exactly the case
the fingerprint exists to catch.

**Goal.** An actor-level view where the fingerprint is the identity and IPs are
an attribute of it — without breaking the per-IP view, which stays the unit for
blocking and for the enrichment APIs.

### Open questions to settle first

1. **Is the fingerprint good enough to merge on?** Unknown collision rate.
   Measure before building: how many distinct IPs share a fingerprint today, and
   what's the largest cluster? A fingerprint shared by 10 000 IPs is a common
   Go-http-client default, not an actor. Likely needs a denylist of generic
   fingerprints, or a rule that only clusters below some size are merged.
2. **Web-only, or all protocols?** Only `web_hits` carries a fingerprint. SSH has
   HASSH and protocol hits have nothing. Either scope this to web actors, or
   define a weaker cross-protocol join (shared credentials, shared timing) —
   which is a different and much fuzzier feature.
3. **Does an actor get one score, or a max of its IPs?** Summing 40 IPs'
   telemetry would saturate every actor at 100 and destroy the ranking.
   Probably: aggregate the *evidence* signals, take the max of the volume
   signals.
4. **Tenant scoping.** Same trap as the matview (`threats.repository.ts:84`): a
   fingerprint spanning two tenants' sensors must not leak one tenant's IPs into
   the other's actor. The cluster has to be computed *within* scope, not
   filtered after.

### Sketch

- Measurement query first (throwaway): fingerprint → distinct IP count,
  histogram. Decide the generic-fingerprint cutoff from real data.
- `threat_actor_summary` matview keyed on `COALESCE(client_fingerprint, src_ip)`
  — same key `querySessionHits` already uses, so the two views agree.
- `/threats/actors` listing + `/threats/actors/:fingerprint` detail. The existing
  `/threats` list stays untouched.
- On the IP detail page, a "part of actor X (N IPs)" link when the IP belongs to
  a non-generic cluster.

### Not doing yet

- Merging actors across time gaps (same fingerprint months apart may be a
  different tenant of the same VPS).
- Enrichment (AbuseIPDB/VirusTotal) as a score input. Keeping third-party
  reputation out of a score built from own telemetry is a deliberate line; a
  "known abuser" tag in the list is the cheaper answer if it's wanted.
