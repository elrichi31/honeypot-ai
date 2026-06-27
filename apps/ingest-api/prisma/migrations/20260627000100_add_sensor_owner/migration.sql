-- Add owner columns to sensors table
ALTER TABLE "sensors"
    ADD COLUMN "application_id" TEXT REFERENCES "applications"("id"),
    ADD COLUMN "owner_type" TEXT NOT NULL DEFAULT 'application';

-- Backfill: sensors already linked to a client → owner_type='client'
UPDATE "sensors"
SET owner_type = 'client'
WHERE client_id IS NOT NULL;

-- Backfill: sensors without client → link to the singleton application
UPDATE "sensors"
SET application_id = COALESCE(current_setting('app.application_id', true), 'default-application')
WHERE client_id IS NULL;

-- Index for filtering by owner
CREATE INDEX "sensors_owner_type_idx" ON "sensors"("owner_type");
