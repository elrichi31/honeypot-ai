#!/usr/bin/env python3
"""FTP Honeypot — captures credentials and commands on port 21."""

import asyncio
import json
import logging
import os
import socket
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ftp-honeypot")

INGEST_API_URL = os.getenv("INGEST_API_URL", "http://ingest-api:3000")
INGEST_SHARED_SECRET = os.getenv("INGEST_SHARED_SECRET", "")
PORT = int(os.getenv("PORT", "21"))
DST_PORT = int(os.getenv("DST_PORT", str(PORT)))
SENSOR_ID = os.getenv("SENSOR_ID", f"ftp-{socket.gethostname()}")
SENSOR_NAME = os.getenv("SENSOR_NAME", "FTP Honeypot")
VERSION = "1.0.0"


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

FAKE_LISTING = (
    "drwxr-xr-x 3 root root 4096 Jan  1 00:00 .\r\n"
    "drwxr-xr-x 3 root root 4096 Jan  1 00:00 ..\r\n"
    "-rw-r--r-- 1 root root 4096 Mar 15 08:30 backup_2024.tar.gz\r\n"
    "-rw------- 1 root root  512 Mar 12 14:00 .credentials\r\n"
    "-rw-r--r-- 1 root root 8192 Mar 10 11:00 database_dump.sql\r\n"
    "drwxr-xr-x 2 root root 4096 Mar  1 00:00 uploads\r\n"
)


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


def _send(event_type, src_ip, src_port, username=None, password=None, extra=None):
    _post("/ingest/protocol/event", {
        "eventId": str(uuid.uuid4()),
        "protocol": "ftp",
        "srcIp": src_ip,
        "srcPort": src_port,
        "dstPort": DST_PORT,
        "eventType": event_type,
        "username": username,
        "password": password,
        "data": extra or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


def _send_heartbeat():
    _post("/sensors/heartbeat", {
        "sensorId": SENSOR_ID,
        "name": SENSOR_NAME,
        "protocol": "ftp",
        "ip": SENSOR_IP,
        "version": VERSION,
        "ports": [PORT],
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
    await loop.run_in_executor(None, _send, "connect", src_ip, src_port)

    username = None
    try:
        writer.write(b"220 FTP Server Ready\r\n")
        await writer.drain()

        while True:
            try:
                raw = await asyncio.wait_for(reader.readline(), timeout=60)
            except asyncio.TimeoutError:
                writer.write(b"421 Timeout.\r\n")
                break
            if not raw:
                break

            line = raw.decode(errors="replace").strip()
            if not line:
                continue

            upper = line.upper()

            if upper.startswith("USER "):
                username = line[5:]
                writer.write(b"331 Password required.\r\n")

            elif upper.startswith("PASS "):
                password = line[5:]
                log.info("auth %s | %s from %s", username, password, src_ip)
                await loop.run_in_executor(
                    None, _send, "auth", src_ip, src_port, username or "", password
                )
                writer.write(b"230 Login successful.\r\n")

            elif upper == "SYST":
                writer.write(b"215 UNIX Type: L8\r\n")
            elif upper.startswith("FEAT"):
                writer.write(b"211-Features:\r\n PASV\r\n UTF8\r\n211 End\r\n")
            elif upper == "PWD":
                writer.write(b'257 "/" is current directory\r\n')
            elif upper.startswith("CWD ") or upper == "CDUP":
                writer.write(b"250 Directory changed.\r\n")
            elif upper.startswith("TYPE "):
                writer.write(b"200 Type set.\r\n")
            elif upper.startswith("MODE "):
                writer.write(b"200 Mode set.\r\n")
            elif upper.startswith("PASV"):
                writer.write(b"227 Entering Passive Mode (127,0,0,1,19,136).\r\n")
            elif upper.startswith("EPSV"):
                writer.write(b"229 Entering Extended Passive Mode (|||5000|).\r\n")
            elif upper.startswith("PORT "):
                writer.write(b"200 PORT command successful.\r\n")
            elif upper.startswith("LIST") or upper.startswith("NLST"):
                writer.write(b"150 Here comes the directory listing.\r\n")
                writer.write(FAKE_LISTING.encode())
                writer.write(b"226 Directory send OK.\r\n")
            elif upper.startswith("RETR ") or upper.startswith("STOR ") or upper.startswith("DELE "):
                log.info("cmd '%s' from %s", line, src_ip)
                await loop.run_in_executor(
                    None, _send, "command", src_ip, src_port,
                    username, None, {"command": line},
                )
                writer.write(b"550 Permission denied.\r\n")
            elif upper.startswith("SIZE "):
                writer.write(b"213 0\r\n")
            elif upper == "NOOP":
                writer.write(b"200 NOOP ok.\r\n")
            elif upper.startswith("QUIT"):
                writer.write(b"221 Goodbye.\r\n")
                break
            else:
                await loop.run_in_executor(
                    None, _send, "command", src_ip, src_port,
                    username, None, {"command": line},
                )
                writer.write(b"500 Unknown command.\r\n")

            await writer.drain()

    except (ConnectionResetError, BrokenPipeError):
        pass
    except Exception as exc:
        log.error("error from %s: %s", src_ip, exc)
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def main():
    server = await asyncio.start_server(handle, "0.0.0.0", PORT, limit=65536)
    log.info("FTP honeypot on :%d (logging as :%d) sensor=%s", PORT, DST_PORT, SENSOR_ID)
    async with server:
        await asyncio.gather(server.serve_forever(), heartbeat())


if __name__ == "__main__":
    asyncio.run(main())
