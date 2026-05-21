CREATE TABLE "blocked_ips" (
  "id"           TEXT        NOT NULL PRIMARY KEY,
  "ip"           TEXT        NOT NULL,
  "reason"       TEXT        NOT NULL DEFAULT 'manual',
  "auto_blocked" BOOLEAN     NOT NULL DEFAULT false,
  "blocked_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "blocked_ips_ip_key" UNIQUE ("ip")
);

CREATE INDEX "blocked_ips_ip_idx" ON "blocked_ips" ("ip");
