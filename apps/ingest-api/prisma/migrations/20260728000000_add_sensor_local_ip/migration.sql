-- Host LAN address of a sensor, reported by the heartbeat alongside the public
-- "ip". Internal trap nodes all share one public IP behind the site NAT, so it
-- is the only field that says which box a node runs on.
ALTER TABLE "sensors" ADD COLUMN IF NOT EXISTS "local_ip" TEXT NOT NULL DEFAULT '';
