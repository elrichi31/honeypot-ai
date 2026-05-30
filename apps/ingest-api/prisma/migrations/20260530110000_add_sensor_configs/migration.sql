CREATE TABLE sensor_configs (
  sensor_id   TEXT        PRIMARY KEY,
  config      JSONB       NOT NULL DEFAULT '{}',
  config_hash TEXT        NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
