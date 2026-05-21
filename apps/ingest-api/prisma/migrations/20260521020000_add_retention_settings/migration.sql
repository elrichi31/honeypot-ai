CREATE TABLE "retention_settings" (
  "id"             TEXT     NOT NULL PRIMARY KEY,
  "table_name"     TEXT     NOT NULL UNIQUE,
  "label"          TEXT     NOT NULL,
  "retention_days" INTEGER  NOT NULL DEFAULT 90,
  "enabled"        BOOLEAN  NOT NULL DEFAULT true,
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO "retention_settings" (id, table_name, label, retention_days, enabled) VALUES
  ('ret-events',   'events',              'SSH Events',     90,  true),
  ('ret-sessions', 'sessions',            'SSH Sessions',   180, true),
  ('ret-web',      'web_hits',            'Web Hits',       90,  true),
  ('ret-proto',    'protocol_hits',       'Protocol Hits',  90,  true),
  ('ret-defense',  'api_defense_events',  'API Defense',    30,  true);
