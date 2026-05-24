-- CreateTable
CREATE TABLE "threat_alert_cooldown" (
    "key" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "threat_alert_cooldown_pkey" PRIMARY KEY ("key")
);
