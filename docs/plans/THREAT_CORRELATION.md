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

## Dropped — fingerprint correlation (measured 2026-07-30, not viable)

**The premise was wrong.** `_passive_fingerprint()` (sensors/web-honeypot/app.py:52)
is `sha256(User-Agent | Accept | Accept-Encoding | Accept-Language)[:16]` — a
hash of four HTTP headers. It identifies the *client software and its default
header set*, not the operator. The code says so: "stable across IPs for same
tool/browser". This plan originally assumed a TLS/JA3-style fingerprint.

Measured on prod (34 407 hits, 800 IPs, 501 fingerprints, 100% coverage):

| Cluster | IPs | What it actually is |
|---|---|---|
| `eaee6989…` | 172 | iPhone Safari UA, 224 hits — 1.3 per IP. Unrelated scanners spoofing one UA |
| `curl/7.64.1` | 14 | fourteen unrelated operators on the same curl build |
| `curl/7.74.0` | 14 | the same fourteen, different curl build |
| CensysInspect | 32 **and** 29 | one real organization, split across two clusters |

It fails in both directions — over-merges unrelated attackers, under-merges one
real actor — and no generic-fingerprint cutoff fixes it: `curl/7.74.0` at 14 IPs
sits below any plausible threshold and still isn't an actor.

Also **many-to-many, not a partition**: 315 singleton + 533 small-cluster IP
slots against only 800 distinct IPs (before counting the mid and 172 clusters)
means one IP carries several fingerprints as its UA varies. The
`COALESCE(client_fingerprint, src_ip)` key in `querySessionHits` silently
assumes 1:1.

Building actor scoring on this would produce "Actor: curl 7.74.0, 14 IPs,
CRITICAL" — worse than nothing, because it inflates scores by merging unrelated
attackers. The fingerprint stays what it already is in `/web-attacks/sessions`:
a useful *tool* grouping.

**Revisit only if** the sensor gains a real client fingerprint (JA3/JA4 needs
TLS termination at the honeypot, which the current Flask-behind-Caddy setup
doesn't expose).

---

## Not now — canary replay correlation

The one actor signal in this system with no false-positive surface:
`_canary_password(ip)` is an HMAC of the requesting IP, so an `ip_specific`
token submitted **from a different IP than it was issued to** is cryptographic
proof that one operator controls both — they read the file from A and replayed
from B. Recomputing the HMAC across the ~800 known IPs is trivial.

**Blocked on data, not design.** Prod currently has 3 IPs with any canary hit
and `malware_samples` is empty. There is nothing to correlate yet. Re-measure
when canary triggers reach a few dozen IPs; until then this is a solution
without a population.

### Design notes kept for whenever a real fingerprint exists

- **Tenant scoping is the trap.** Same as the matview
  (`threats.repository.ts:84`): a cluster spanning two tenants' sensors must be
  computed *within* scope, not filtered after, or one tenant's IPs leak into the
  other's actor.
- **An actor is not the sum of its IPs.** Summing telemetry across 40 IPs
  saturates every actor at 100 and destroys the ranking. Aggregate the
  *evidence* signals, take the max of the volume signals.
- **Web-only.** Only `web_hits` carries a fingerprint; SSH would need HASSH and
  protocol hits have nothing.

### Explicitly not doing

- Enrichment (AbuseIPDB/VirusTotal) as a score input. Keeping third-party
  reputation out of a score built from own telemetry is a deliberate line; a
  "known abuser" tag in the list is the cheaper answer if it's wanted.
