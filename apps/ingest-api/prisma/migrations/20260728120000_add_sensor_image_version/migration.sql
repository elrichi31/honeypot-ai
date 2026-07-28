-- Image version (git sha baked at build) reported by sensor heartbeats.
-- SENSOR_FLEET_UPDATES Fase 0: lets the dashboard show what each sensor runs.
ALTER TABLE "sensors" ADD COLUMN "image_version" TEXT NOT NULL DEFAULT '';
