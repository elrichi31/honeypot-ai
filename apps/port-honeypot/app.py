#!/usr/bin/env python3
"""Port Honeypot — listens on commonly scanned ports and logs all connection attempts."""

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("port-honeypot")

INGEST_API_URL = os.getenv("INGEST_API_URL", "http://ingest-api:3000")
INGEST_SHARED_SECRET = os.getenv("INGEST_SHARED_SECRET", "")

DEFAULT_PORTS = "1433 2375 3389 4444 5900 6379 8888 9090 9200 27017"
PORTS = [int(p) for p in os.getenv("PORTS", DEFAULT_PORTS).split() if p.isdigit()]

SERVICES: dict[int, str] = {
    1433:  "mssql",
    2375:  "docker-api",
    3389:  "rdp",
    4444:  "metasploit",
    5900:  "vnc",
    6379:  "redis",
    8888:  "http-alt",
    9090:  "cockpit",
    9200:  "elasticsearch",
    27017: "mongodb",
}

# Realistic banners to fingerprint attacker tools
BANNERS: dict[int, bytes] = {
    6379:  b"-ERR unknown command 'PING'\r\n",
    9200:  (
        b'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n'
        b'{"name":"node-1","cluster_name":"honeypot","version":{"number":"7.17.0"}}\n'
    ),
    2375:  (
        b'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nApi-Version: 1.41\r\n\r\n'
        b'{"ID":"abc123def456","Containers":3,"Images":12,"Version":"20.10.7"}\n'
    ),
    8888:  b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body>Admin Panel</body></html>",
    9090:  b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html></html>",
}


def _send(src_ip: str, src_port: int, dst_port: int, client_hex: str):
    service = SERVICES.get(dst_port, f"port-{dst_port}")
    payload = {
        "eventId": str(uuid.uuid4()),
        "protocol": "port-scan",
        "srcIp": src_ip,
        "srcPort": src_port,
        "dstPort": dst_port,
        "eventType": "connect",
        "data": {
            "service": service,
            "payloadHex": client_hex[:512],
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    body = json.dumps(payload).encode()
    req = Request(
        f"{INGEST_API_URL}/ingest/protocol/event",
        data=body,
        headers={"Content-Type": "application/json", "X-Ingest-Token": INGEST_SHARED_SECRET},
        method="POST",
    )
    try:
        urlopen(req, timeout=5)
    except Exception as exc:
        log.debug("ingest error: %s", exc)


def make_handler(port: int):
    async def handle(reader, writer):
        peer = writer.get_extra_info("peername")
        src_ip, src_port = (peer[0], peer[1]) if peer else ("unknown", 0)
        log.info("port %-5d | %s:%d", port, src_ip, src_port)

        banner = BANNERS.get(port)
        if banner:
            try:
                writer.write(banner)
                await writer.drain()
            except Exception:
                pass

        client_data = b""
        try:
            client_data = await asyncio.wait_for(reader.read(4096), timeout=5)
        except (asyncio.TimeoutError, Exception):
            pass

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send, src_ip, src_port, port, client_data.hex())

        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

    return handle


async def main():
    servers = []
    for port in PORTS:
        try:
            server = await asyncio.start_server(make_handler(port), "0.0.0.0", port)
            servers.append(server)
            log.info("listening on %-5d (%s)", port, SERVICES.get(port, "?"))
        except OSError as exc:
            log.warning("cannot bind %d: %s", port, exc)

    if not servers:
        log.error("no ports bound — exiting")
        return

    log.info("%d ports active", len(servers))
    await asyncio.gather(*[s.serve_forever() for s in servers])


if __name__ == "__main__":
    asyncio.run(main())
