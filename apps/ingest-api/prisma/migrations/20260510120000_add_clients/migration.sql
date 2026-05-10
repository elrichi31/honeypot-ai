CREATE TABLE IF NOT EXISTS "clients" (
    "id"           TEXT         NOT NULL,
    "name"         TEXT         NOT NULL,
    "slug"         TEXT         NOT NULL,
    "description"  TEXT         NOT NULL DEFAULT '',
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "clients_slug_key" ON "clients"("slug");
CREATE INDEX IF NOT EXISTS "clients_name_idx" ON "clients"("name");

ALTER TABLE "sensors"
  ADD COLUMN IF NOT EXISTS "client_id" TEXT;

CREATE INDEX IF NOT EXISTS "sensors_client_id_idx" ON "sensors"("client_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sensors_client_id_fkey'
  ) THEN
    ALTER TABLE "sensors"
      ADD CONSTRAINT "sensors_client_id_fkey"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
