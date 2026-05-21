CREATE TABLE "defense_allowlist" (
  "id"         TEXT        NOT NULL PRIMARY KEY,
  "entry"      TEXT        NOT NULL,
  "label"      TEXT        NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "defense_allowlist_entry_key" UNIQUE ("entry")
);
