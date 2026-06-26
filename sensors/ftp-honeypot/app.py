#!/usr/bin/env python3
"""FTP Honeypot — full-interaction FTP server."""

import asyncio
import logging
import os

from honeypot.config import PORT, DST_PORT, SENSOR_ID, PASV_PORT_MIN, PASV_PORT_MAX, EVENT_LOG_PATH
from honeypot.ftp import handle
from honeypot.ingest import detect_ip, send_heartbeat

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ftp-honeypot")

os.makedirs(os.path.dirname(EVENT_LOG_PATH), exist_ok=True)

SENSOR_IP = detect_ip()


async def heartbeat():
    loop = asyncio.get_event_loop()
    while True:
        await loop.run_in_executor(None, send_heartbeat, SENSOR_IP, DST_PORT)
        await asyncio.sleep(30)


async def main():
    async def _handle(reader, writer):
        await handle(reader, writer, SENSOR_IP)

    server = await asyncio.start_server(_handle, "0.0.0.0", PORT, limit=1 << 20)
    log.info("FTP honeypot on :%d (logging as :%d) sensor=%s pasv=%d-%d",
             PORT, DST_PORT, SENSOR_ID, PASV_PORT_MIN, PASV_PORT_MAX)
    async with server:
        await asyncio.gather(server.serve_forever(), heartbeat())


if __name__ == "__main__":
    asyncio.run(main())
