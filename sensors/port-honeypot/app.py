#!/usr/bin/env python3
"""Port Honeypot — listens on commonly scanned ports and logs all connection attempts."""

import asyncio
import json
import logging
import os
import time
from urllib.request import Request, urlopen

from control_agent import ControlAgent
from persisted_config import write_override
from honeypot.config import CONFIG_HASH, INGEST_API_URL, PORTS, SENSOR_ID, SERVICES
from honeypot.dispatch import make_handler
from honeypot.ingest import detect_ip, send_heartbeat

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("port-honeypot")

os.makedirs(os.path.dirname(os.getenv("EVENT_LOG_PATH", "/var/log/port-honeypot/events.json")), exist_ok=True)

SENSOR_IP = detect_ip()
_active_ports: list[int] = []

AGENT_VERSION = "port-honeypot/1.0"
_START_TIME = time.time()

control_agent = ControlAgent(
    ingest_url=INGEST_API_URL, sensor_id=SENSOR_ID,
    secret=os.getenv("SENSOR_CONTROL_SECRET", ""), agent_version=AGENT_VERSION,
)


@control_agent.action("status.get")
def _handle_status_get(report_running) -> dict:
    return {
        "agentVersion": AGENT_VERSION,
        "uptimeSeconds": int(time.time() - _START_TIME),
        "pid": os.getpid(),
        "ports": _active_ports,
        "configHash": CONFIG_HASH,
    }


def _fetch_config():
    """Return (config_dict, config_hash) or None on error. No auth header —
    GET /sensors/:id/config doesn't require ensureIngestToken."""
    try:
        url = f"{INGEST_API_URL}/sensors/{SENSOR_ID}/config"
        with urlopen(Request(url), timeout=8) as resp:
            data = json.loads(resp.read())
        return data.get("config", {}), data.get("configHash", "")
    except Exception as exc:
        log.warning("config fetch error: %s", exc)
        return None


@control_agent.action("config.apply")
def _handle_config_apply(report_running):
    # No command.result on the happy path — restarting exits this process;
    # the fresh one's next heartbeat echoing the new configHash is what
    # confirms success (sensor-config.service.ts confirmApplied()).
    report_running()
    result = _fetch_config()
    if result is None:
        raise RuntimeError("could not fetch pending config from ingest-api")
    config, remote_hash = result
    write_override("/config/override.json", config, remote_hash)
    log.info("config written (hash=%s), restarting to apply", remote_hash)
    os._exit(1)


async def heartbeat():
    loop = asyncio.get_event_loop()
    while True:
        await loop.run_in_executor(None, send_heartbeat, SENSOR_IP, _active_ports)
        await asyncio.sleep(30)


async def main():
    global _active_ports
    servers = []
    for port in PORTS:
        try:
            server = await asyncio.start_server(make_handler(port), "0.0.0.0", port)
            servers.append(server)
            _active_ports.append(port)
            log.info("listening on %-5d (%s)", port, SERVICES.get(port, "?"))
        except OSError as exc:
            log.warning("cannot bind %d: %s", port, exc)

    if not servers:
        log.error("no ports bound — exiting")
        return

    log.info("%d ports active  sensor=%s", len(servers), SENSOR_ID)
    control_agent.start()
    await asyncio.gather(*[s.serve_forever() for s in servers], heartbeat())


if __name__ == "__main__":
    asyncio.run(main())
