-- Make client_id nullable in sensor_provision_tokens (provisioning without a client)
ALTER TABLE "sensor_provision_tokens"
    ALTER COLUMN "client_id" DROP NOT NULL;

-- Drop and recreate FK to keep ON DELETE CASCADE but allow NULL
ALTER TABLE "sensor_provision_tokens"
    DROP CONSTRAINT "sensor_provision_tokens_client_id_fkey";

ALTER TABLE "sensor_provision_tokens"
    ADD CONSTRAINT "sensor_provision_tokens_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
