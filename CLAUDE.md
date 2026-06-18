# CLAUDE.md

Guidance for Claude Code (and contributors) when working in this repo.

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

## Conventions

- **UI language: English first.** All user-facing strings in the dashboard are
  written in English (the source of truth). Spanish (and any future locale) is
  added through the i18n dictionaries in `apps/dashboard/lib/i18n/dicts/`. Never
  hardcode Spanish text in components — add a key to the matching dictionary.
- **Monorepo:** apps under `apps/` (`dashboard`, `ingest-api`, `docs`). Sensors
  and honeypots under `sensors/`, `cowrie/`, `vector/`, etc.
