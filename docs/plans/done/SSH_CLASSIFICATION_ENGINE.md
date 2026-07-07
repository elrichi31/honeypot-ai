# SSH Classification Engine — audit & improvement plan

**Status: closed (2026-07-07).** Tasks 1–6 implemented 2026-07-05 and shipped.
Task 7 (pattern hardening) and real `BOT_HASSH_FINGERPRINTS` values (Task 5)
remain optional/data-dependent — see change log entry below for why they're
closed rather than left open.
**Goal:** Fix the cases where SSH sessions are mislabeled ("a veces no clasifica
bien") by consolidating the pattern engines, closing the data-flow gaps that
silently drop threat signals, and adding test coverage so future changes are safe.

> This plan is written to be executed by another engineer/AI. It documents the
> current architecture, the concrete defects found, and an ordered task list.
> Read the referenced files before touching them.

---

## 1. How SSH classification works today (3 layers + 1 parallel engine)

SSH session labeling is spread across three sequential layers plus a fourth engine
that duplicates part of the work.

### Layer 1 — Bot vs Human (`session_type`)
- **File:** [`apps/ingest-api/src/lib/bot-detector.ts`](../../apps/ingest-api/src/lib/bot-detector.ts) → `detectBot()`
- **Called from:** [`session.repository.ts`](../../apps/ingest-api/src/modules/sessions/session.repository.ts) `classifySession()` at **session close** (`data.endedAt` present), persisted to `sessions.session_type`.
- **Backfill:** `queryUnclassified()` + `bulkUpdateSessionType()` re-run it for rows left as `unknown`.
- **Method:** additive score 0–100 from duration, SSH client fingerprint (`BOT_CLIENT_PATTERNS`/`HUMAN_CLIENT_PATTERNS`), command volume/type, auth pattern. Thresholds: `>=60 bot`, `<=25 human`, `26–59 unknown`.

### Layer 2 — Threat tags (`threatTags`)
- **File:** [`apps/ingest-api/src/lib/session-queries.ts`](../../apps/ingest-api/src/lib/session-queries.ts) → `buildThreatTagsSql()`
- SQL `ILIKE` patterns evaluated **at query time** over `events.command`, producing up to 8 tags: `ssh_backdoor`, `honeypot_evasion`, `container_escape`, `crypto_mining`, `malware_drop`, `persistence`, `data_exfil`, `solana_targeting`. Also computes `eventCount`, `authAttemptCount`, `commandCount`.

### Layer 3 — Session classification (the visible label)
- **File:** [`apps/dashboard/lib/session-classify-v2.ts`](../../apps/dashboard/lib/session-classify-v2.ts) → `classify()`
- Frontend heuristic decision tree → 16 `ClassificationKey`s. Uses `threatTags` (priority, but **only when `loginSuccess === true`**), then falls through to count/duration/`sessionType` heuristics. `worstOf()` + `SEVERITY_ORDER` pick the worst label per IP.
- **Tested:** [`session-classify-v2.test.ts`](../../apps/dashboard/lib/session-classify-v2.ts) (only this layer).

### Parallel engine — command risk categories
- **File:** [`apps/ingest-api/src/lib/risk-constants.ts`](../../apps/ingest-api/src/lib/risk-constants.ts) `CMD_PATTERNS` + [`risk-score.ts`](../../apps/ingest-api/src/lib/risk-score.ts) `classifyCommands()`
- Regex patterns → 10 categories → risk score + Discord alerts ([`threat-checks.ts`](../../apps/ingest-api/src/lib/threat-checks.ts)).

---

## 2. Defects found (root causes of misclassification)

### A. Two divergent command-pattern engines (DRY violation, highest impact)
`buildThreatTagsSql()` (SQL `ILIKE`) and `CMD_PATTERNS` (regex) both classify the
same commands but are maintained **independently and disagree**:

| category | SQL tag (Layer 2, drives the label) | Regex (risk engine) |
|---|---|---|
| `ssh_backdoor` | `authorized_keys AND (chattr OR ssh-rsa OR ssh-ed25519)` | also `clean.sh\|setup.sh`, `auth_ok`, `echo.+ssh-rsa AAAA` |
| `crypto_mining` | `xmrig\|minerd\|pool.minexmr\|stratum+tcp` | (may include `minerd`, pool/port variants) |
| `data_exfil` | 3 patterns (`/etc/passwd`, `history -c`, `rm -rf /var/log`) | broader set |
| `malware_drop` | `(wget http OR curl http) AND (chmod +x OR /tmp/)` | reverse shells, `nc`, python one-liners |

Consequence: a session that the risk engine flags as `ssh_backdoor` (e.g. via
`clean.sh`) is **not** tagged `ssh_backdoor` by Layer 2, so the dashboard never
shows the `sshBackdoor` label. The SQL engine — the weaker one — is the one that
drives the visible classification.

**Also:** `buildThreatTagsSql` emits `malware_drop` and `persistence`, but
`classify()`'s `TAG_CLASSIFICATIONS` map never consumes them → computed and thrown away.

### B. Threat tags & post-login heuristics are gated behind `loginSuccess === true`
In `classify()`:
- `if (loggedIn) { …match tag… }` (line ~82) — tags ignored unless `loginSuccess === true`.
- `if (!loggedIn) { …return scanner/brute… }` (line ~87) returns early, so the
  entire post-login block (malwareDropper/interactive/recon/botScript) is
  effectively the `else` of `loggedIn`.

Cowrie does not always record a clean `auth.success` even when commands run
(`login_success` can be `false`/`null` while `command.input` events exist). Such a
session — even one running `xmrig` — falls into the `!loggedIn` branch and is
labeled `scanner`/`credSpray`, **dropping its commands and threat tags entirely**.

### C. `null` duration collapses the post-login tree
`classify()`: `const duration = session.duration ?? 0`, then
`isAutomated = sessionType === 'bot' || duration < 20`. Sessions without `endedAt`
have `duration === null → 0 → isAutomated always true`, and `malwareDropper`
needs `duration >= 1800` or `commandCount > 20 && !isAutomated`. Result: **every
null-duration session with commands** can only land on `botScript`/`loginOnly`,
never `interactive`/`recon`/`malwareDropper`. Same fragility in `detectBot`
(duration `null` → the strongest signal is absent).

### D. The `isAutomated` gate buries the most dangerous sessions
A fast automated compromise (bot, <20 s, 10 commands incl. `wget`+`chmod`+miner)
fails `malwareDropper` (`commandCount>20` or `duration>=1800`), fails
`interactive`/`recon` (`!isAutomated`) → lands on `botScript` unless a Layer-2 tag
happened to match. Automation should **raise** confidence of malicious intent for
known-bad command sets, not demote the label to benign.

### E. Unused / inconsistent signals
- `detectBot` receives `hassh` but never uses it — HASSH is a strong bot-family
  fingerprint (identical client crypto → same tool).
- `unknown` (score 26–59) is treated as "not a bot" downstream
  (`isAutomated = sessionType === 'bot'`), so `unknown` and `human` behave
  identically in `classify()` — the tri-state is effectively binary.

### F. SQL `ILIKE` patterns are brittle & evadable
Literal substrings (`'%wget http%'`) miss trivial variants (`wget  http`,
`wget -q http`, tabs, `WgEt`). The regex engine (`\s+`, flags) is more robust but
does not feed the label. No label-level detection for base64 payloads
(`echo … | base64 -d | sh`), `tee … authorized_keys`, or reverse shells.

### G. No test coverage on the backend engines
`detectBot`, `classifyCommands`, and `buildThreatTagsSql` have **no covering
tests** (confirmed via blast-radius). Only Layer 3 is tested. Any change here is
currently unverifiable.

---

## 3. Plan of work (ordered by impact/risk)

Each task lists the files to touch and how to verify. Keep the SQL-in-repository
rule (CLAUDE.md): pattern definitions may be shared TS constants, but all
`$queryRaw`/`Prisma.sql` stays in `session-queries.ts` / repositories.

### Task 1 — Single source of truth for command patterns *(fixes A, F)*
- Extract one canonical pattern table (category → matchers) used by **both** the
  risk engine and the threat-tag engine. Put it in a shared module, e.g.
  `apps/ingest-api/src/lib/command-patterns.ts`, keyed by `CommandCategory`.
- `classifyCommands()` keeps using the regex form directly.
- For Layer 2, derive the SQL from the same source instead of hand-writing
  `ILIKE`. Two acceptable approaches (pick per KISS):
  1. **Preferred:** stop pattern-matching in SQL. Fetch `command.input` rows for
     the paged sessions (already joined in `sessionListQuery`) and run
     `classifyCommands()` in the service to build `threatTags` in TS — one engine,
     regex-quality matching. Verify query cost stays acceptable (only paged rows).
  2. If SQL matching must stay for performance, generate the `ILIKE`/`~*`
     (POSIX regex) clauses from the shared table so they can't drift.
- Ensure the tag set consumed by the frontend and the categories produced stay in
  sync (see Task 3).

### Task 2 — Stop dropping commands/tags on non-successful logins *(fixes B)*
In `classify()`:
- Evaluate `TAG_CLASSIFICATIONS` whenever `tags.length > 0`, **regardless of
  `loginSuccess`** (a matched `crypto_mining`/`ssh_backdoor` command is malicious
  even if the auth record is missing).
- Decouple "ran commands" from "logged in": drive the post-login heuristic block
  off `commandCount > 0` (or `eventCount` of command type) rather than the
  `loggedIn` boolean. Reserve the `!loggedIn && commandCount === 0` path for the
  pure brute/scan ladder (portProbe/burstBrute/slowBrute/credSpray/scanner).
- Update/extend `session-classify-v2.test.ts` with: commands present +
  `loginSuccess:false`; threat tag present + `loginSuccess:null`.

### Task 3 — Consume every tag the backend emits *(fixes A tail)*
- Either map `malware_drop` → a `malwareDropper`-style key and `persistence` → a
  new/existing key in `TAG_CLASSIFICATIONS`, or stop emitting unused tags. Decide
  the label taxonomy explicitly. If adding a key, add its `label`+`summary` to
  **every** locale dict under `sessions.class.<key>` (the coverage test enforces this).

### Task 4 — Make duration optional, not fatal *(fixes C)*
- In `classify()`, treat `duration === null` as "unknown", not `0`. Gate
  `isAutomated`/`interactive` on `sessionType` and command shape when duration is
  unavailable, instead of forcing `isAutomated = true`.
- In `detectBot`, when `durationSec === null`, lean on client fingerprint + HASSH +
  command signals and widen the `unknown` band rather than defaulting toward human.

### Task 5 — Rebalance the bot/automation semantics *(fixes D, E)*
- Use `hassh` in `detectBot`: maintain a small set of known bot HASSH fingerprints
  (derive from the DB — most frequent HASSH on `session_type='bot'`) as a positive
  signal.
- For known-malicious command categories (`ssh_backdoor`, `crypto_mining`,
  `container_escape`, `malware_drop`), automation should **not** suppress the
  malicious label. Reorder `classify()` so a matched high-severity tag wins before
  the `isAutomated` gate is ever consulted (largely handled by Task 2, verify here).
- Decide `unknown` handling once and apply consistently (treat `unknown` as
  potentially-automated for gating, or fold it explicitly).

### Task 6 — Backend test coverage *(fixes G, unblocks all above)*
Add tests (run with `npx tsx --test`, matching the existing pattern):
- `bot-detector.test.ts`: bot client → bot; OpenSSH + long interactive → human;
  null duration; single-shot auth; HASSH signal (after Task 5).
- `command-patterns.test.ts` (or extend risk tests): each category matches its
  representative payloads and rejects benign lookalikes; **parity test** asserting
  the SQL-derived tags and `classifyCommands()` agree on a fixed corpus (guards A).
- Extend `session-classify-v2.test.ts` per Tasks 2–4.

### Task 7 (optional) — Pattern hardening pass
With one engine and tests in place, expand coverage: base64-piped execution,
`tee`/`>>` to `authorized_keys`, reverse shells as a surfaced label, common
loader/dropper filenames. Add each with a test payload.

---

## 4. Verification checklist
- `apps/ingest-api`: `npx tsx --test` (new + existing) green; `tsc` clean.
- `apps/dashboard`: `npx tsx --test lib/session-classify-v2.test.ts` green; `tsc` clean.
- Spot-check against real data in the local `honeypot_full` DB: pull a handful of
  sessions known to run miners/backdoors with `login_success` false/null and
  confirm they now classify correctly (before/after label diff).
- Confirm no unused tag is emitted and every emitted tag has a locale label.

## 5. Out of scope
- Cowrie-side capture fixes (why `login_success`/`endedAt` are sometimes missing) —
  track separately; this plan makes the classifier robust to those gaps instead.
- ML/embedding classification — the heuristic tree is sufficient; keep KISS.

---

### Change log
- **2026-07-02** — Plan authored from codegraph audit of the SSH classification
  path (layers 1–3 + risk engine). No code changed yet.
- **2026-07-05** — Tasks 1–6 implemented and verified (`tsc --noEmit` clean in
  both apps; `vitest run` 91/91 in `ingest-api`; `tsx --test` 12/12 in
  `dashboard`'s `session-classify-v2.test.ts`).
  - **Task 1**: `buildThreatTagsSql()` (the weaker SQL `ILIKE` engine) deleted
    from [`session-queries.ts`](../../apps/ingest-api/src/lib/session-queries.ts).
    `threatTags` is now derived in TS from the same `classifyCommands()`/
    `CMD_PATTERNS` regex engine that drives the risk score, via the new
    `deriveThreatTags()` in
    [`risk-score.ts`](../../apps/ingest-api/src/lib/risk-score.ts). Wired into
    `SessionService.list`/`scanGroups` (new `threatTagsBySessionId()` helper,
    one extra `queryCommandsForSessions` call reusing the existing
    repository method) and `getById` (commands already in memory, no extra
    query). `sessionListQuery`/`scanGroupListQuery` no longer compute or
    return `threatTags` — one engine, no more drift between SQL and risk-score
    regex.
  - **Task 2**: `classify()` no longer gates tag matching or the post-login
    heuristic tree behind `loginSuccess === true`. Tags are evaluated whenever
    `commandCount > 0`, regardless of login outcome; the pure brute/scan ladder
    (portProbe/burstBrute/slowBrute/credSpray/scanner) is now scoped to
    `!loggedIn && commandCount === 0` only.
  - **Task 3**: `malware_drop` → `malwareDropper` (existing key, now also
    reachable via tag match) and `persistence` → new `persistence`
    classification key, with its own icon/color, `SEVERITY_ORDER` slot (between
    `honeypotEvasion` and `burstBrute`), and i18n label/summary in
    `dicts/sessions.ts` (en + es).
  - **Task 4**: `classify()` treats `session.duration === null` as unknown
    rather than coercing to `0` — `isAutomated` no longer defaults to `true`
    for open/unclosed sessions; `malwareDropper`'s duration check and the
    `slowBrute`/`botScript` summary vars handle `null` explicitly instead of
    silently becoming "instant".
  - **Task 5**: Added a HASSH-based signal to
    [`bot-detector.ts`](../../apps/ingest-api/src/lib/bot-detector.ts) —
    intentionally **not** hardcoded with guessed fingerprint values (fabricating
    "known bad" hashes without production data would silently mislabel real
    traffic). Configurable via `BOT_HASSH_FINGERPRINTS` env var (comma-separated),
    with the diagnostic query to derive real values from `session_type='bot'`
    documented inline. Populate once real data is available — see Task 5 in the
    original design. Reorder of tag-vs-`isAutomated` priority was already
    resolved by Task 2 (tags are checked before the post-login tree is ever
    reached). `unknown` sessionType is documented as deliberately treated like
    `human` (not automated) in `isAutomated`'s comment.
  - **Task 6**: New
    [`bot-detector.test.ts`](../../apps/ingest-api/tests/bot-detector.test.ts)
    (7 tests: bot client, human client, null duration, single-shot auth,
    HASSH signal on/off, date-password). New `classifyCommands`/
    `deriveThreatTags` tests in
    [`risk-score.test.ts`](../../apps/ingest-api/tests/risk-score.test.ts)
    (parity test asserting both engines agree on the same corpus — guards
    against Task 1 regressing into two divergent engines again). Extended
    [`session-classify-v2.test.ts`](../../apps/dashboard/lib/session-classify-v2.test.ts)
    with cases for Tasks 2–4 (tag wins with `loginSuccess: false/null`,
    `malware_drop`/`persistence` tag mapping, null-duration not forcing
    automated).
  - **Not done**: Task 7 (pattern hardening — base64-piped execution,
    `tee`/`>>` to `authorized_keys`, reverse-shell label, loader/dropper
    filenames) remains optional and unstarted, as originally scoped. Real HASSH
    fingerprint values for Task 5 still need to be derived from production data
    before `BOT_HASSH_FINGERPRINTS` has any effect.
- **2026-07-07** — Attempted to derive real `BOT_HASSH_FINGERPRINTS` values
  from the local Docker DB (`honeypot-postgres` / `honeypot_prod`) per the
  diagnostic query in [`bot-detector.ts`](../../apps/ingest-api/src/lib/bot-detector.ts).
  Found the dataset is **synthetic/seed data, not real Cowrie traffic**: the
  same `hassh` appears with different `client_version` banners across rows
  (e.g. `6d1f4b0a7bde04b4b8b7c2e3a1d9f3c5` paired with both `libssh2` and
  `OpenSSH_7.4` — not possible organically, since HASSH is derived from the
  client's own announced KEX algorithms), `sensor_id` is empty on every row,
  and `session_type` never advanced past `unknown` (no backfill has run
  against this dataset). Populating `BOT_HASSH_FINGERPRINTS` from this data
  would silently mislabel real traffic, so it was not done.
  **Closing this plan** rather than leaving Task 5/7 open indefinitely: both
  are genuinely blocked on production data that doesn't exist yet, not on
  remaining engineering work. If real HASSH signal becomes available later
  (e.g. after `session_type` backfill runs against real prod traffic), treat
  populating `BOT_HASSH_FINGERPRINTS` as a small standalone follow-up rather
  than reopening this plan.
