#!/usr/bin/env python3
"""MySQL Honeypot — captures auth attempts using the MySQL 5.7 handshake protocol."""

import asyncio
import logging
import os

from honeypot.config import PORT, DST_PORT, SENSOR_ID, EVENT_LOG_PATH
from honeypot.protocol import handle
from honeypot.ingest import detect_ip, send_heartbeat

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("mysql-honeypot")

os.makedirs(os.path.dirname(EVENT_LOG_PATH), exist_ok=True)

SENSOR_IP = detect_ip()


async def heartbeat():
    loop = asyncio.get_event_loop()
    while True:
        await loop.run_in_executor(None, send_heartbeat, SENSOR_IP)
        await asyncio.sleep(30)


async def main():
    server = await asyncio.start_server(handle, "0.0.0.0", PORT)
    log.info("MySQL honeypot on :%d (logging as :%d) sensor=%s", PORT, DST_PORT, SENSOR_ID)
    async with server:
        await asyncio.gather(server.serve_forever(), heartbeat())


if __name__ == "__main__":
    asyncio.run(main())
