#!/usr/bin/env python3
"""Port Honeypot — listens on commonly scanned ports and logs all connection attempts."""

import asyncio
import json
import logging
import os
import socket
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("port-honeypot")

INGEST_API_URL = os.getenv("INGEST_API_URL", "http://ingest-api:3000")
INGEST_SHARED_SECRET = os.getenv("INGEST_SHARED_SECRET", "")
SENSOR_ID = os.getenv("SENSOR_ID", f"port-{socket.gethostname()}")
SENSOR_NAME = os.getenv("SENSOR_NAME", "Port Honeypot")
CLIENT_SLUG = os.getenv("CLIENT_SLUG", "")
CLIENT_NAME = os.getenv("CLIENT_NAME", "")
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


def _send(
    src_ip: str,
    src_port: int,
    dst_port: int,
    client_hex: str,
    event_type: str = "connect",
    username: str | None = None,
    password: str | None = None,
    extra: dict | None = None,
):
    service = SERVICES.get(dst_port, f"port-{dst_port}")
    data = {
        "service": service,
        "payloadHex": client_hex[:512],
    }
    if extra:
        data.update(extra)
    # eventType 'auth' + username/password feed the Credentials view automatically,
    # the same way the SSH/MySQL/Dionaea sensors report login attempts.
    payload = {
        "eventId": str(uuid.uuid4()),
        "sensorId": SENSOR_ID,
        "protocol": "port-scan",
        "srcIp": src_ip,
        "srcPort": src_port,
        "dstPort": dst_port,
        "eventType": event_type,
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if username is not None:
        payload["username"] = username
    if password is not None:
        payload["password"] = password
    _post("/ingest/protocol/event", payload)


_active_ports: list[int] = []


def _send_heartbeat():
    _post("/sensors/heartbeat", {
        "sensorId": SENSOR_ID,
        "name": SENSOR_NAME,
        "clientSlug": CLIENT_SLUG,
        "clientName": CLIENT_NAME,
        "protocol": "port-scan",
        "ip": SENSOR_IP,
        "version": VERSION,
        "ports": _active_ports,
        "probePorts": _active_ports,
        "host": SENSOR_HOST,
    })


async def heartbeat():
    loop = asyncio.get_event_loop()
    while True:
        await loop.run_in_executor(None, _send_heartbeat)
        await asyncio.sleep(30)


# ── VNC / RFB handshake ──────────────────────────────────────────────────────
# VNC is a server-speaks-first protocol: a bare TCP connect reveals nothing, so
# we play a real RFB 3.8 server to make the attacker proceed. We then capture:
#   - the client's RFB version string (tool fingerprint),
#   - that they accepted VNC Authentication,
#   - the 16-byte challenge response. Because the challenge we send is FIXED, the
#     response can be cracked offline to recover the password they tried (VNC auth
#     is DES(challenge, password[:8])). We ship the response hex for that.
# Fixed challenge so every captured response is crackable against the same value.
VNC_CHALLENGE = bytes(range(16))  # 00 01 02 ... 0f


async def handle_vnc(reader, writer, src_ip, src_port, port):
    extra: dict = {"protocolName": "vnc"}
    username = None
    password = None
    event_type = "connect"
    raw = b""

    async def read_challenge_response():
        """Read the 16-byte DES response and record it as a (crackable) password."""
        nonlocal event_type, username, password, raw
        resp = await asyncio.wait_for(reader.read(16), timeout=5)
        raw += resp
        if len(resp) == 16:
            event_type = "auth"
            username = ""  # VNC has no username, only a password
            # Encrypted response; crackable offline against the fixed VNC_CHALLENGE.
            password = resp.hex()
            extra["vncChallengeResponseHex"] = resp.hex()
            extra["vncChallengeHex"] = VNC_CHALLENGE.hex()

    try:
        # 1. Server sends its version. We offer 3.8 but adapt to whatever the
        #    client downgrades to — most scanners speak the older RFB 3.3.
        writer.write(b"RFB 003.008\n")
        await writer.drain()

        # 2. Client replies with its version (e.g. "RFB 003.003\n").
        client_ver = await asyncio.wait_for(reader.read(12), timeout=5)
        raw += client_ver
        ver_str = client_ver.decode("latin-1", "replace").strip()
        if ver_str:
            extra["clientVersion"] = ver_str

        # The security handshake differs by protocol version:
        is_33 = "003.003" in ver_str or "003.005" in ver_str

        if is_33:
            # RFB 3.3: the SERVER dictates the security type as a single U32.
            # Send 2 (VNC Authentication), then the challenge directly.
            extra["authType"] = "vnc-auth"
            writer.write(b"\x00\x00\x00\x02")  # security-type = 2 (U32, big-endian)
            await writer.drain()
            writer.write(VNC_CHALLENGE)
            await writer.drain()
            await read_challenge_response()
        else:
            # RFB 3.7 / 3.8: server offers a LIST of types; client picks one.
            writer.write(b"\x01\x02")  # count=1, type=2 (VNC auth)
            await writer.drain()
            sec = await asyncio.wait_for(reader.read(1), timeout=5)
            raw += sec
            if sec == b"\x02":
                extra["authType"] = "vnc-auth"
                writer.write(VNC_CHALLENGE)
                await writer.drain()
                await read_challenge_response()
            elif sec == b"\x01":
                extra["authType"] = "none"  # they wanted an unauthenticated desktop
    except (asyncio.TimeoutError, Exception):
        pass
    await asyncio.get_event_loop().run_in_executor(
        None, _send, src_ip, src_port, port, raw.hex(), event_type, username, password, extra
    )


# ── RDP / X.224 handshake ────────────────────────────────────────────────────
# The very first RDP packet (X.224 Connection Request) often carries the target
# username in clear text as a routing token: "Cookie: mstshash=<user>\r\n", plus
# the requested security protocols (RDP/TLS/CredSSP). We read that one packet and
# extract both — no need to implement the full RDP stack.
async def handle_rdp(reader, writer, src_ip, src_port, port):
    extra: dict = {"protocolName": "rdp"}
    username = None
    event_type = "connect"
    raw = b""
    try:
        raw = await asyncio.wait_for(reader.read(4096), timeout=5)
        text = raw.decode("latin-1", "replace")
        # Cookie: mstshash=USERNAME
        marker = "mstshash="
        idx = text.find(marker)
        if idx != -1:
            end = text.find("\r", idx)
            if end == -1:
                end = text.find("\n", idx)
            if end == -1:
                end = idx + len(marker) + 64
            user = text[idx + len(marker):end].strip()
            if user:
                username = user
                event_type = "auth"
                extra["mstshash"] = user
        # Requested protocol flags live in the rdpNegReq (last 4 bytes, little-endian)
        # when present. Best-effort; decode common values.
        if b"\x01\x00\x08\x00" in raw:  # TYPE_RDP_NEG_REQ header
            i = raw.find(b"\x01\x00\x08\x00")
            if i + 8 <= len(raw):
                flags = int.from_bytes(raw[i + 4:i + 8], "little")
                wanted = []
                if flags == 0: wanted.append("standard-rdp")
                if flags & 0x1: wanted.append("tls")
                if flags & 0x2: wanted.append("credssp")
                if flags & 0x8: wanted.append("rdstls")
                if wanted:
                    extra["requestedSecurity"] = ",".join(wanted)
    except (asyncio.TimeoutError, Exception):
        pass
    await asyncio.get_event_loop().run_in_executor(
        None, _send, src_ip, src_port, port, raw.hex(), event_type, username, None, extra
    )


def make_handler(port: int):
    async def handle(reader, writer):
        peer = writer.get_extra_info("peername")
        src_ip, src_port = (peer[0], peer[1]) if peer else ("unknown", 0)
        log.info("port %-5d | %s:%d", port, src_ip, src_port)

        try:
            # Protocol-aware handlers extract real intelligence from the handshake.
            if port == 5900:
                await handle_vnc(reader, writer, src_ip, src_port, port)
            elif port == 3389:
                await handle_rdp(reader, writer, src_ip, src_port, port)
            else:
                # Generic: optionally send a service banner, then capture whatever
                # the client sends.
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
                await asyncio.get_event_loop().run_in_executor(
                    None, _send, src_ip, src_port, port, client_data.hex()
                )
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    return handle


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
    await asyncio.gather(*[s.serve_forever() for s in servers], heartbeat())


if __name__ == "__main__":
    asyncio.run(main())
