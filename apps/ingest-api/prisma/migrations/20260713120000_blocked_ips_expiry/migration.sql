-- Auto-blocks (injection, brute_force, rate_limit) are temporary; manual blocks
-- stay permanent (expires_at NULL). Expired rows are pruned by the defense
-- plugin's refresh loop.
ALTER TABLE "blocked_ips" ADD COLUMN "expires_at" TIMESTAMP(3);
