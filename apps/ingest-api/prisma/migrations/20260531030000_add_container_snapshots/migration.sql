-- CreateTable
CREATE TABLE "container_snapshots" (
  "id"          SERIAL           NOT NULL,
  "container"   TEXT             NOT NULL,
  "cpu_pct"     DOUBLE PRECISION NOT NULL,
  "mem_mb"      DOUBLE PRECISION NOT NULL,
  "sampled_at"  TIMESTAMPTZ      NOT NULL DEFAULT now(),
  CONSTRAINT "container_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "container_snapshots_sampled_at_idx" ON "container_snapshots" ("sampled_at" DESC);
CREATE INDEX "container_snapshots_container_sampled_at_idx" ON "container_snapshots" ("container", "sampled_at" DESC);
