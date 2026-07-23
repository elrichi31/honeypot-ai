# Sensor event shipping — how honeypot events reach ingest

Non-obvious wiring: **most honeypots do NOT POST their events directly.** They
write each event to a JSONL file, and a **vector** sidecar tails that file and
ships it to the ingest-api. Only heartbeats (`/sensors/heartbeat`) and malware
captures (`/ingest/malware`) are POSTed directly by the honeypot process.

## Who ships what

| Honeypot | Main event | Shipped by | Vector config |
|----------|------------|-----------|---------------|
| ssh (cowrie) | `cowrie.json` | vector | `cowrie.toml` (`COWRIE_LOG_PATH`) |
| suricata | `eve.json` | vector | `suricata.toml` |
| http (web) | `events.json` (`_emit`) | vector | `web-honeypot.toml` (`WEB_LOG_PATH`) |
| ftp | `events.json` (`_emit`) | vector | `protocol.toml` (`FTP_LOG_PATH`) |
| mysql | `events.json` (`_emit`) | vector | `protocol.toml` (`MYSQL_LOG_PATH`) |
| port | `events.json` (`_emit`) | vector | `protocol.toml` (`PORT_LOG_PATH`) |
| smb | `events.json` (`_emit`) | vector | `protocol.toml` (`SMB_LOG_PATH`) |
| deception (opencanary) | opencanary logs | own `shipper.py` | — |
| internal-canary | cowrie + opencanary | `ic-vector` + own shipper | — |

`protocol.toml` is a single shipper for all four file-logging protocol
honeypots — it globs `${PORT_LOG_PATH}`, `${MYSQL_LOG_PATH}`, `${FTP_LOG_PATH}`,
`${SMB_LOG_PATH}` (each with a `:-/var/log/_absent/...` default so vector boots
when only some are present) and POSTs to `/ingest/protocol/event`.

## The wiring each protocol honeypot needs (or events vanish silently)

Three things, all three required:

1. **Honeypot** mounts a shared volume for its log dir, e.g.
   `port_events:/var/log/port-honeypot`.
2. **Vector** mounts the same volume read-only + loads the shipper config +
   sets the `*_LOG_PATH` env, e.g. `port_events:/var/log/port-honeypot:ro`,
   `--config /etc/vector/protocol.toml`, `PORT_LOG_PATH=...`.
3. The `*_events` volume is declared in the top-level `volumes:`.

Miss any of these and the honeypot **still runs, still appears in the dashboard
(heartbeat POSTs directly), and still captures — but no connection/auth events
are ever ingested.** A quiet failure, same shape as the control-plane
`INGEST_SHARED_SECRET` gotcha.

## Where the generator lives

The downloadable installer builds this compose:
- `apps/dashboard/lib/sensor-compose-blocks.ts` — service templates +
  `vectorBlock(services)` (the single vector that wires every selected
  honeypot's config/volume/env).
- `apps/dashboard/lib/sensor-compose-builder.ts` — assembles blocks, declares
  volumes/networks.
- `apps/dashboard/lib/sensor-install-script.ts` — the `install-sensor.sh`
  wrapper; downloads the vector configs (`protocol.toml` / `web-honeypot.toml`)
  the selected sensors need.
- Covered by `apps/dashboard/lib/sensor-compose-builder.test.ts` — asserts the
  end-to-end wiring for every honeypot.

**Gotcha (fixed 2026-07-22):** the generator used to ship a vector that only
loaded `cowrie.toml` + `suricata.toml`, so http/ftp/mysql/port/smb events were
written to a file nobody tailed. The reference `docker-compose.prod.*.yml` and
`deploy/local/*.yml` are the source of truth for correct wiring — mirror them.
Fix takes effect only after the **dashboard is rebuilt/redeployed** (the script
is generated server-side); already-deployed sensors must re-run the installer.
