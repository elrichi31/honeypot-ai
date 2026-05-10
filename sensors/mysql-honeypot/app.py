#!/usr/bin/env python3
"""MySQL Honeypot — captures auth attempts using the MySQL 5.7 handshake protocol."""

import asyncio
import json
import logging
import os
import socket
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
SENSOR_ID = os.getenv("SENSOR_ID", f"mysql-{socket.gethostname()}")
SENSOR_NAME = os.getenv("SENSOR_NAME", "MySQL Honeypot")
VERSION = "1.0.0"
SENSOR_HOST = os.getenv("SENSOR_HOST", socket.gethostname())


def _detect_ip() -> str:
    ip = os.getenv("SENSOR_IP", "")
    if ip:
        return ip
    for url in ("http://ifconfig.me/ip", "http://api.ipify.org", "http://checkip.amazonaws.com"):
        try:
            return urlopen(url, timeout=4).read().decode().strip()
        except Exception:
            continue
    return ""


SENSOR_IP = _detect_ip()


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


def _parse_database(auth_data: bytes, username_end: int) -> str | None:
    """Extract the target database from the auth packet if CLIENT_CONNECT_WITH_DB is set."""
    if len(auth_data) < 4:
        return None
    caps = struct.unpack("<I", auth_data[:4])[0]
    if not (caps & 0x0008):  # CLIENT_CONNECT_WITH_DB
        return None

    # Skip past auth_response (length-encoded string)
    offset = username_end
    if offset >= len(auth_data):
        return None

    first_byte = auth_data[offset]
    if first_byte < 0xFB:
        offset += 1 + first_byte
    elif first_byte == 0xFC and offset + 3 <= len(auth_data):
        auth_len = struct.unpack("<H", auth_data[offset + 1:offset + 3])[0]
        offset += 3 + auth_len
    elif first_byte == 0xFE and offset + 9 <= len(auth_data):
        auth_len = struct.unpack("<Q", auth_data[offset + 1:offset + 9])[0]
        offset += 9 + auth_len
    else:
        return None

    if offset >= len(auth_data):
        return None

    null_pos = auth_data.find(b"\x00", offset)
    if null_pos < offset:
        raw = auth_data[offset:].decode(errors="replace").rstrip("\x00")
    else:
        raw = auth_data[offset:null_pos].decode(errors="replace")

    return raw if raw else None


def _post(path: str, payload: dict):
    body = json.dumps(payload).encode()
    req = Request(
        f"{INGEST_API_URL}{path}",
        data=body,
        headers={"Content-Type": "application/json", "X-Ingest-Token": INGEST_SHARED_SECRET},
        method="POST",
    )
    try:
        urlopen(req, timeout=5)
    except Exception as exc:
        log.debug("ingest error: %s", exc)


def _send(event_type, src_ip, src_port, username=None, database=None):
    data: dict = {}
    if database:
        data["database"] = database
    _post("/ingest/protocol/event", {
        "eventId": str(uuid.uuid4()),
        "protocol": "mysql",
        "srcIp": src_ip,
        "srcPort": src_port,
        "dstPort": DST_PORT,
        "eventType": event_type,
        "username": username,
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


def _send_heartbeat():
    _post("/sensors/heartbeat", {
        "sensorId": SENSOR_ID,
        "name": SENSOR_NAME,
        "protocol": "mysql",
        "ip": SENSOR_IP,
        "version": VERSION,
        "ports": [DST_PORT],
        "probePorts": [PORT],
        "host": SENSOR_HOST,
    })


async def heartbeat():
    loop = asyncio.get_event_loop()
    while True:
        await loop.run_in_executor(None, _send_heartbeat)
        await asyncio.sleep(30)


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
        username_end = (null_pos + 1) if null_pos > offset else (offset + 1)

        database = _parse_database(auth_data, username_end)

        log.info("auth user='%s' db='%s' from %s", username, database, src_ip)
        await loop.run_in_executor(None, _send, "auth", src_ip, src_port, username, database)

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
    log.info("MySQL honeypot on :%d (logging as :%d) sensor=%s", PORT, DST_PORT, SENSOR_ID)
    async with server:
        await asyncio.gather(server.serve_forever(), heartbeat())


if __name__ == "__main__":
    asyncio.run(main())
