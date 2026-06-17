-- Desnormaliza el cliente en cada alerta para poder filtrar/agrupar y aislar por
-- tenant sin JOINs frágiles en cada lectura.
ALTER TABLE "alerts" ADD COLUMN "client_id" text;

CREATE INDEX "alerts_client_id_idx" ON "alerts" ("client_id");
CREATE INDEX "alerts_client_id_created_at_idx" ON "alerts" ("client_id", "created_at" DESC);

-- Backfill: resolver el cliente por la misma vía que usa el código en runtime.
-- 1) Por sensor_id directo (alertas sensor-offline y similares).
UPDATE "alerts" a
SET "client_id" = s."client_id"
FROM "sensors" s
WHERE a."client_id" IS NULL
  AND a."sensor_id" IS NOT NULL
  AND s."sensor_id" = a."sensor_id"
  AND s."client_id" IS NOT NULL;

-- 2) Por IP -> la sesión más reciente de esa IP -> su sensor -> cliente.
UPDATE "alerts" a
SET "client_id" = sub."client_id"
FROM (
  SELECT DISTINCT ON (ses."src_ip") ses."src_ip", sen."client_id"
  FROM "sessions" ses
  JOIN "sensors" sen ON sen."sensor_id" = ses."sensor_id"
  WHERE sen."client_id" IS NOT NULL
  ORDER BY ses."src_ip", ses."started_at" DESC
) sub
WHERE a."client_id" IS NULL
  AND a."src_ip" IS NOT NULL
  AND sub."src_ip" = a."src_ip";
