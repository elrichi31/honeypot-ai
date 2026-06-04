-- Records each retention job run so the dashboard can show when it last ran,
-- how many rows it purged per table, and whether it failed — instead of users
-- guessing whether the hourly purge is actually working.
CREATE TABLE "retention_runs" (
  "id"            TEXT        NOT NULL PRIMARY KEY,
  "started_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "finished_at"   TIMESTAMPTZ,
  "rows_deleted"  INTEGER     NOT NULL DEFAULT 0,
  "per_table"     JSONB       NOT NULL DEFAULT '{}',
  "ok"            BOOLEAN     NOT NULL DEFAULT true,
  "error"         TEXT
);
CREATE INDEX "retention_runs_started_at_idx" ON "retention_runs" ("started_at" DESC);
