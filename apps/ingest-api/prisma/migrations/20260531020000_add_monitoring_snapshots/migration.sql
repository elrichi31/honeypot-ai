-- CreateTable
CREATE TABLE "monitoring_snapshots" (
  "id"           SERIAL       NOT NULL,
  "cpu_load_1m"  DOUBLE PRECISION NOT NULL,
  "cpu_load_5m"  DOUBLE PRECISION NOT NULL,
  "ram_used_kb"  INTEGER      NOT NULL,
  "ram_total_kb" INTEGER      NOT NULL,
  "ram_pct"      DOUBLE PRECISION NOT NULL,
  "sampled_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "monitoring_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monitoring_snapshots_sampled_at_idx" ON "monitoring_snapshots" ("sampled_at" DESC);
