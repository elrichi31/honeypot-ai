-- CreateTable
CREATE TABLE "sensor_provision_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "sensor_provision_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sensor_provision_tokens_token_key" ON "sensor_provision_tokens"("token");

-- CreateIndex
CREATE INDEX "sensor_provision_tokens_client_id_idx" ON "sensor_provision_tokens"("client_id");

-- CreateIndex
CREATE INDEX "sensor_provision_tokens_token_idx" ON "sensor_provision_tokens"("token");

-- AddForeignKey
ALTER TABLE "sensor_provision_tokens" ADD CONSTRAINT "sensor_provision_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
