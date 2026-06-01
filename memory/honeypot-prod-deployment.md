---
name: honeypot-prod-deployment
description: Production honeypot VPS topology — ports, compose file, repo path
metadata:
  type: project
---

The production honeypot runs on a VPS (host `vmi3231105`, IP `173.249.48.182`) with the repo at `/root/honeypot-ai`, deployed with `docker compose -f docker-compose.prod.single-host.yml`.

Port layout (easy to confuse):
- **8022** = the real admin SSH of the VPS (use this to log in to manage the box).
- **22** and **2222** = the Cowrie SSH honeypot (`22:2222` and `2222:2222`). Port 22 is free for Cowrie precisely because admin SSH was moved to 8022.

**Why:** rebuilding a single service with bare `docker compose ...` (no `-f`) silently uses the dev `docker-compose.yml`, which only maps `2222` and drops the `22` mapping (and shows orphan-container warnings). Always pass `-f docker-compose.prod.single-host.yml`.

**How to apply:** to test credential capture, `ssh root@173.249.48.182 -p 2222` (or port 22) with a password from `sensors/cowrie/userdb.txt` (e.g. `HoneyTrap2026!`). Cowrie's `userdb.txt`/`cowrie.cfg` are bind-mounted read-only from `sensors/cowrie/`, so a restart re-reads them; no rebuild needed for config-only changes. Keep `userdb.txt` ASCII-only (see [[cowrie-userdb-ascii-crash]]).
