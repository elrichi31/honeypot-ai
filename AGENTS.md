# AGENTS.md

Guidance for Codex (and contributors) when working in this repo.

## Where things live

- **Plans & roadmaps:** [`docs/plans/`](docs/plans/) — implementation plans and
  roadmaps, one file per initiative. Read the relevant plan before starting work
  on a feature; keep it updated as you go. Index: [docs/plans/README.md](docs/plans/README.md).
- **Project notes:** [`docs/project-notes/`](docs/project-notes/) — important
  things to remember: setup, gotchas, infra wiring, non-obvious decisions. Index:
  [docs/project-notes/README.md](docs/project-notes/README.md).

When you add a new plan or note, drop the file in the right folder **and** add a
one-line entry to that folder's `README.md` index.

**Keep plans up to date as work progresses.** Every time we ship something that
belongs to a plan in `docs/plans/`, update that plan in the same change to record
what was done and what's left — date the entry and link the commit. A plan should
always reflect the current state, never a stale snapshot. This is the single
source of truth for "where did we leave off".

## Code principles

- **DRY** — never duplicate logic or UI. If the same thing appears twice, extract
  it: a shared function, hook, component, or utility. One source of truth.
- **KISS** — prefer the simplest solution that works. No over-engineering,
  no abstractions for hypothetical future needs. Three similar lines is fine;
  a premature abstraction is not.
- **Segmentation** — keep files small and focused. If a file is growing long,
  split it by responsibility before it becomes hard to navigate. One concern per
  file is the target. This applies equally to code and to i18n dict files.
- **No comments that explain what** — well-named identifiers already do that.
  Only comment the *why* when it is non-obvious (hidden constraint, workaround,
  subtle invariant).
- **SQL only in repositories** (`ingest-api`). All `$queryRaw`, `$queryRawUnsafe`,
  `Prisma.sql`, and ORM calls live in `modules/<domain>/<domain>.repository.ts`.
  Routes are HTTP-only (Zod + auth + `reply.send`). Services hold business logic.
  See [`docs/project-notes/backend-layering.md`](docs/project-notes/backend-layering.md).

## Plans discipline

- Read the relevant plan in `docs/plans/` before starting any feature work.
- **After finishing a task**, update the plan in the same commit: mark what was
  done (with date), what's next, and any decisions made. The plan is the single
  source of truth for "where did we leave off" — it must never be stale.
- When adding a new plan or project note, also add a one-line entry to that
  folder's `README.md` index.

## Conventions

- **UI language: English first.** All user-facing strings in the dashboard are
  written in English (the source of truth). Spanish (and any future locale) is
  added through the i18n dictionaries in `apps/dashboard/lib/i18n/dicts/`. Never
  hardcode Spanish text in components — add a key to the matching dictionary.
  Dict files are split by feature area (e.g. `settings-alerts.ts`, `clients-core.ts`);
  keep each file under ~150 lines.
- **Monorepo:** apps under `apps/` (`dashboard`, `ingest-api`, `docs`). Sensors
  and honeypots under `sensors/`, `cowrie/`, `vector/`, etc.
