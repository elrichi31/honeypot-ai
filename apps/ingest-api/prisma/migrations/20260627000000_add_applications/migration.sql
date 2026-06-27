-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- Seed the singleton application row using the APPLICATION_ID env var.
-- Falls back to a stable default so existing deployments without the env still work.
INSERT INTO "applications" ("id", "name")
VALUES (
    COALESCE(current_setting('app.application_id', true), 'default-application'),
    'Application'
)
ON CONFLICT ("id") DO NOTHING;
