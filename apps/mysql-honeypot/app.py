#!/usr/bin/env python3
"""MySQL Honeypot — captures auth attempts using the MySQL 5.7 handshake protocol."""

import asyncio
import json
import logging
import os
import struct
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("mysql-honeypot")

INGEST_API_URL = os.getenv("INGEST_API_URL", "http://ingest-api:3000")
INGEST_SHARED_SECRET = os.getenv("INGEST_SHARED_SECRET", "")
PORT = int(os.getenv("PORT", "3306"))
DST_PORT = int(os.getenv("DST_PORT", str(PORT)))


def _server_greeting() -> bytes:
    """MySQL 5.7 Protocol 10 server greeting packet."""
    scramble = os.urandom(20)
    payload = (
        b"\x0a"                             # protocol version 10
        + b"5.7.44-log\x00"                 # server version string
        + struct.pack("<I", 1)              # connection id
        + scramble[:8] + b"\x00"           # auth-plugin-data part 1 + filler
        + struct.pack("<H", 0xF7FF)        # capability flags (lower)
        + bytes([33])                       # charset: utf8
        + struct.pack("<H", 0x0002)        # server status
        + struct.pack("<H", 0x0200)        # capability flags (upper) — CLIENT_PLUGIN_AUTH
        + bytes([21])                       # auth plugin data length
        + b"\x00" * 10                     # reserved
        + scramble[8:] + b"\x00"           # auth-plugin-data part 2 (13 bytes)
        + b"mysql_native_password\x00"
    )
    header = struct.pack("<I", len(payload))[:3] + b"\x00"  # seq = 0
    return header + payload


def _error_packet(code: int, msg: bytes) -> bytes:
    payload = b"\xff" + struct.pack("<H", code) + b"#28000" + msg
    header = struct.pack("<I", len(payload))[:3] + bytes([2])  # seq = 2
    return header + payload


def _send(event_type, src_ip, src_port, username=None):
    payload = {
        "eventId": str(uuid.uuid4()),
        "protocol": "mysql",
        "srcIp": src_ip,
        "srcPort": src_port,
        "dstPort": DST_PORT,
        "eventType": event_type,
        "username": username,
        "data": {},
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


async def handle(reader, writer):
    peer = writer.get_extra_info("peername")
    src_ip, src_port = (peer[0], peer[1]) if peer else ("unknown", 0)
    log.info("connect %s:%d", src_ip, src_port)

    loop = asyncio.get_event_loop()
    try:
        writer.write(_server_greeting())
        await writer.drain()

        # Read client auth packet (4-byte header first)
        hdr = await asyncio.wait_for(reader.read(4), timeout=15)
        if len(hdr) < 4:
            await loop.run_in_executor(None, _send, "connect", src_ip, src_port)
            return

        pkt_len = struct.unpack("<I", hdr[:3] + b"\x00")[0]
        if pkt_len < 32 or pkt_len > 16384:
            await loop.run_in_executor(None, _send, "connect", src_ip, src_port)
            return

        auth_data = await asyncio.wait_for(reader.read(pkt_len), timeout=15)

        # Layout: capabilities(4) + max_packet_size(4) + charset(1) + reserved(23) = 32 bytes
        # Then: username (null-terminated)
        offset = 32
        if len(auth_data) <= offset:
            await loop.run_in_executor(None, _send, "connect", src_ip, src_port)
            return

        null_pos = auth_data.find(b"\x00", offset)
        username = auth_data[offset:null_pos].decode(errors="replace") if null_pos > offset else ""

        log.info("auth user='%s' from %s", username, src_ip)
        await loop.run_in_executor(None, _send, "auth", src_ip, src_port, username)

        err_msg = f"Access denied for user '{username}'@'{src_ip}' (using password: YES)".encode()
        writer.write(_error_packet(1045, err_msg))
        await writer.drain()

    except (asyncio.TimeoutError, ConnectionResetError, BrokenPipeError):
        pass
    except Exception as exc:
        log.error("error from %s: %s", src_ip, exc)
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def main():
    server = await asyncio.start_server(handle, "0.0.0.0", PORT)
    log.info("MySQL honeypot on :%d (logging as :%d)", PORT, DST_PORT)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
