#!/usr/bin/env python3
"""Port Honeypot — listens on commonly scanned ports and logs all connection attempts."""

import asyncio
import logging
import os

from honeypot.config import PORTS, SERVICES
from honeypot.dispatch import make_handler
from honeypot.ingest import detect_ip, send_heartbeat

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("port-honeypot")

os.makedirs(os.path.dirname(os.getenv("EVENT_LOG_PATH", "/var/log/port-honeypot/events.json")), exist_ok=True)

SENSOR_IP = detect_ip()
_active_ports: list[int] = []


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

    from honeypot.config import SENSOR_ID
    log.info("%d ports active  sensor=%s", len(servers), SENSOR_ID)
    await asyncio.gather(*[s.serve_forever() for s in servers], heartbeat())


if __name__ == "__main__":
    asyncio.run(main())
