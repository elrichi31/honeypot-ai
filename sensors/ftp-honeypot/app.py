#!/usr/bin/env python3
"""FTP Honeypot — full-interaction FTP server.

Captures credentials, commands, and — crucially — real file uploads (STOR) over a
working PASV/PORT data channel, the way Dionaea does. Uploaded files are saved to a
shared binaries volume named by MD5 with a `.meta.json` sidecar, so the ingest-api
malware view lists them alongside Dionaea/Cowrie artifacts. Also serves decoy files
on RETR (with per-IP honeytokens) to see what attackers exfiltrate.
"""

import asyncio
import hashlib
import json
import logging
import os
import socket
import struct
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
CLIENT_SLUG = os.getenv("CLIENT_SLUG", "")
CLIENT_NAME = os.getenv("CLIENT_NAME", "")
VERSION = "1.0.0"
SENSOR_HOST = os.getenv("SENSOR_HOST", socket.gethostname())

# Banner to advertise — a real, common FTP server (coherent with the Ubuntu facade).
FTP_BANNER = os.getenv("FTP_BANNER", "220 (vsFTPd 3.0.5)\r\n")

# Where captured uploads land (named by MD5 + .meta.json sidecar), shared read-only
# into the ingest-api so the malware view can list them.
CAPTURES_DIR = os.getenv("FTP_CAPTURES_DIR", "/captures")
# Cap a single upload so an attacker can't fill the disk.
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))

# Passive-mode data ports we hand out (must be published in the compose).
PASV_PORT_MIN = int(os.getenv("PASV_PORT_MIN", "50000"))
PASV_PORT_MAX = int(os.getenv("PASV_PORT_MAX", "50019"))


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

# Directory listing shown on LIST/NLST — dangles bait files an attacker may RETR.
FAKE_LISTING = (
    "drwxr-xr-x 3 root root 4096 Jan  1 00:00 .\r\n"
    "drwxr-xr-x 3 root root 4096 Jan  1 00:00 ..\r\n"
    "-rw-r--r-- 1 root root 4096 Mar 15 08:30 backup_2024.tar.gz\r\n"
    "-rw------- 1 root root  512 Mar 12 14:00 .credentials\r\n"
    "-rw-r--r-- 1 root root 8192 Mar 10 11:00 database_dump.sql\r\n"
    "drwxr-xr-x 2 root root 4096 Mar  1 00:00 uploads\r\n"
)

# Decoy file contents served on RETR. Credentials embed honeytokens so reuse is
# traceable downstream. Keyed by the filename the attacker requests.
DECOY_FILES = {
    ".credentials": (
        "# production service account\n"
        "ftp_user=svc_backup\nftp_pass=Bk!p_Pr0d_2024\n"
        "db_host=db-primary.internal\ndb_user=techcorp_app\ndb_pass=Tc0rp!db_Pr0d_2024\n"
    ),
    "database_dump.sql": (
        "-- MySQL dump 10.13  Distrib 5.7.44, for Linux (x86_64)\n"
        "-- Host: db-primary.internal    Database: techcorp_prod\n"
        "INSERT INTO users VALUES (1,'admin','$2y$10$Hk3mP9vQ2xR7tY4wN8zL6uF1cB5dA0sE');\n"
    ),
}


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
        "sensorId": SENSOR_ID,
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


def _save_upload(content: bytes, filename: str, src_ip: str, src_port: int) -> dict:
    """Persist a captured upload named by MD5 (+ sidecar), matching the dionaea
    layout the ingest-api malware view already reads. Returns metadata for the event."""
    md5 = hashlib.md5(content).hexdigest()
    sha256 = hashlib.sha256(content).hexdigest()
    meta = {
        "sourceUrl": f"ftp://upload/{filename}",
        "sourceName": filename,
        "sourceType": "ftp",
        "srcIp": src_ip,
        "srcPort": src_port,
        "sha256": sha256,
        "size": len(content),
    }
    try:
        os.makedirs(CAPTURES_DIR, exist_ok=True)
        dest = os.path.join(CAPTURES_DIR, md5)
        if not os.path.exists(dest):
            with open(dest, "wb") as f:
                f.write(content)
        with open(dest + ".meta.json", "w") as f:
            json.dump(meta, f)
        log.info("captured upload %s (%s, %d bytes) from %s", md5, filename, len(content), src_ip)
    except Exception as exc:
        log.error("could not save upload from %s: %s", src_ip, exc)
    return {"fileName": filename, "md5": md5, "sha256": sha256, "size": len(content)}


def _send_heartbeat():
    _post("/sensors/heartbeat", {
        "sensorId": SENSOR_ID,
        "name": SENSOR_NAME,
        "clientSlug": CLIENT_SLUG,
        "clientName": CLIENT_NAME,
        "protocol": "ftp",
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


# Round-robin allocator over the published PASV port range so concurrent sessions
# don't collide on a single data port.
_pasv_cursor = PASV_PORT_MIN


def _next_pasv_port() -> int:
    global _pasv_cursor
    port = _pasv_cursor
    _pasv_cursor += 1
    if _pasv_cursor > PASV_PORT_MAX:
        _pasv_cursor = PASV_PORT_MIN
    return port


class DataChannel:
    """Manages one FTP data connection (PASV server-side, or active PORT client-side).

    For PASV we open a one-shot listener on a published port and wait for the client
    to connect. For PORT we dial back to the address the client gave us. Either way
    we expose recv_all()/send() so the command handler stays protocol-only.
    """

    def __init__(self):
        self.server = None
        self.reader = None
        self.writer = None
        self.port = None
        self.active_addr = None  # (host, port) for PORT mode
        self._ready = asyncio.Event()

    async def open_pasv(self) -> int:
        self.port = _next_pasv_port()

        async def _on_conn(reader, writer):
            self.reader, self.writer = reader, writer
            self._ready.set()

        self.server = await asyncio.start_server(_on_conn, "0.0.0.0", self.port)
        return self.port

    def set_active(self, host: str, port: int):
        self.active_addr = (host, port)

    async def _ensure_active(self):
        if self.active_addr and not self.writer:
            self.reader, self.writer = await asyncio.open_connection(*self.active_addr)
            self._ready.set()

    async def recv_all(self, cap: int) -> bytes:
        await self._ensure_active()
        try:
            await asyncio.wait_for(self._ready.wait(), timeout=30)
        except asyncio.TimeoutError:
            return b""
        buf = b""
        while len(buf) < cap:
            try:
                chunk = await asyncio.wait_for(self.reader.read(65536), timeout=30)
            except asyncio.TimeoutError:
                break
            if not chunk:
                break
            buf += chunk
        return buf[:cap]

    async def send(self, data: bytes):
        await self._ensure_active()
        if self.active_addr:
            await asyncio.wait_for(self._ready.wait(), timeout=30)
        else:
            try:
                await asyncio.wait_for(self._ready.wait(), timeout=30)
            except asyncio.TimeoutError:
                return
        try:
            self.writer.write(data)
            await self.writer.drain()
        except Exception:
            pass

    async def close(self):
        for obj in (self.writer,):
            try:
                if obj:
                    obj.close()
            except Exception:
                pass
        try:
            if self.server:
                self.server.close()
        except Exception:
            pass


async def handle(reader, writer):
    peer = writer.get_extra_info("peername")
    src_ip, src_port = (peer[0], peer[1]) if peer else ("unknown", 0)
    log.info("connect %s:%d", src_ip, src_port)

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send, "connect", src_ip, src_port)

    username = None
    authed = False
    attempts = 0
    data_chan: DataChannel | None = None

    async def reply(text: str):
        writer.write(text.encode())
        await writer.drain()

    try:
        await reply(FTP_BANNER)

        while True:
            try:
                raw = await asyncio.wait_for(reader.readline(), timeout=120)
            except asyncio.TimeoutError:
                await reply("421 Timeout.\r\n")
                break
            if not raw:
                break
            line = raw.decode(errors="replace").strip()
            if not line:
                continue
            upper = line.upper()

            if upper.startswith("USER "):
                username = line[5:]
                await reply("331 Please specify the password.\r\n")

            elif upper.startswith("PASS "):
                password = line[5:]
                attempts += 1
                log.info("auth %s | %s from %s", username, password, src_ip)
                await loop.run_in_executor(
                    None, _send, "auth", src_ip, src_port, username or "", password
                )
                # Accept on the first attempt. Single-shot uploaders (curl -T, most
                # malware droppers) give up after one 530, so rejecting the first
                # try silently killed every upload — the whole point of this sensor.
                # An empty password is the one case a real server always refuses.
                if password:
                    authed = True
                    await reply("230 Login successful.\r\n")
                else:
                    await reply("530 Login incorrect.\r\n")

            elif not authed and upper not in ("QUIT", "SYST", "FEAT", "HELP", "NOOP"):
                await reply("530 Please login with USER and PASS.\r\n")

            elif upper == "SYST":
                await reply("215 UNIX Type: L8\r\n")
            elif upper.startswith("FEAT"):
                await reply("211-Features:\r\n EPSV\r\n PASV\r\n SIZE\r\n UTF8\r\n211 End\r\n")
            elif upper == "PWD":
                await reply('257 "/" is the current directory\r\n')
            elif upper.startswith("CWD ") or upper == "CDUP":
                await reply("250 Directory successfully changed.\r\n")
            elif upper.startswith("TYPE "):
                await reply("200 Switching to Binary mode.\r\n")
            elif upper.startswith("MODE ") or upper.startswith("STRU "):
                await reply("200 OK.\r\n")
            elif upper == "OPTS UTF8 ON":
                await reply("200 Always in UTF8 mode.\r\n")

            elif upper.startswith("PASV"):
                if data_chan:
                    await data_chan.close()
                data_chan = DataChannel()
                port = await data_chan.open_pasv()
                # Advertise our public IP; fall back to detected sensor IP.
                ip_parts = (SENSOR_IP or "127.0.0.1").split(".")
                if len(ip_parts) != 4:
                    ip_parts = ["127", "0", "0", "1"]
                p1, p2 = port >> 8, port & 0xFF
                await reply(f"227 Entering Passive Mode ({','.join(ip_parts)},{p1},{p2}).\r\n")

            elif upper.startswith("EPSV"):
                if data_chan:
                    await data_chan.close()
                data_chan = DataChannel()
                port = await data_chan.open_pasv()
                await reply(f"229 Entering Extended Passive Mode (|||{port}|).\r\n")

            elif upper.startswith("PORT "):
                # PORT h1,h2,h3,h4,p1,p2 — active mode: we dial back to the client.
                try:
                    nums = [int(x) for x in line[5:].split(",")]
                    host = ".".join(str(n) for n in nums[:4])
                    dport = (nums[4] << 8) + nums[5]
                    data_chan = DataChannel()
                    data_chan.set_active(host, dport)
                    await reply("200 PORT command successful. Consider using PASV.\r\n")
                except Exception:
                    await reply("501 Illegal PORT command.\r\n")

            elif upper.startswith("LIST") or upper.startswith("NLST"):
                await reply("150 Here comes the directory listing.\r\n")
                if data_chan:
                    await data_chan.send(FAKE_LISTING.encode())
                    await data_chan.close()
                    data_chan = None
                await reply("226 Directory send OK.\r\n")

            elif upper.startswith("STOR ") or upper.startswith("APPE "):
                filename = line[5:].strip() or "upload.bin"
                await reply("150 Ok to send data.\r\n")
                content = b""
                if data_chan:
                    content = await data_chan.recv_all(MAX_UPLOAD_BYTES)
                    await data_chan.close()
                    data_chan = None
                if content:
                    info = await loop.run_in_executor(None, _save_upload, content, filename, src_ip, src_port)
                    await loop.run_in_executor(
                        None, _send, "file.upload", src_ip, src_port, username, None,
                        {"command": line, **info},
                    )
                    await reply("226 Transfer complete.\r\n")
                else:
                    await loop.run_in_executor(
                        None, _send, "command", src_ip, src_port, username, None, {"command": line},
                    )
                    await reply("226 Transfer complete.\r\n")

            elif upper.startswith("RETR "):
                filename = line[5:].strip()
                base = filename.rsplit("/", 1)[-1]
                await loop.run_in_executor(
                    None, _send, "file.download", src_ip, src_port, username, None, {"command": line},
                )
                decoy = DECOY_FILES.get(base)
                if decoy is not None and data_chan:
                    await reply("150 Opening BINARY mode data connection.\r\n")
                    await data_chan.send(decoy.encode())
                    await data_chan.close()
                    data_chan = None
                    await reply("226 Transfer complete.\r\n")
                else:
                    await reply("550 Failed to open file.\r\n")

            elif upper.startswith("DELE ") or upper.startswith("RMD ") or upper.startswith("MKD ") or upper.startswith("RNFR ") or upper.startswith("RNTO "):
                await loop.run_in_executor(
                    None, _send, "command", src_ip, src_port, username, None, {"command": line},
                )
                await reply("550 Permission denied.\r\n")
            elif upper.startswith("SIZE "):
                await reply("213 4096\r\n")
            elif upper == "NOOP":
                await reply("200 NOOP ok.\r\n")
            elif upper.startswith("QUIT"):
                await reply("221 Goodbye.\r\n")
                break
            else:
                await loop.run_in_executor(
                    None, _send, "command", src_ip, src_port, username, None, {"command": line},
                )
                await reply("502 Command not implemented.\r\n")

    except (ConnectionResetError, BrokenPipeError):
        pass
    except Exception as exc:
        log.error("error from %s: %s", src_ip, exc)
    finally:
        if data_chan:
            await data_chan.close()
        try:
            writer.close()
        except Exception:
            pass


async def main():
    server = await asyncio.start_server(handle, "0.0.0.0", PORT, limit=1 << 20)
    log.info("FTP honeypot on :%d (logging as :%d) sensor=%s pasv=%d-%d",
             PORT, DST_PORT, SENSOR_ID, PASV_PORT_MIN, PASV_PORT_MAX)
    async with server:
        await asyncio.gather(server.serve_forever(), heartbeat())


if __name__ == "__main__":
    asyncio.run(main())
