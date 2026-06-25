#!/usr/bin/env python3
"""Port Honeypot — listens on commonly scanned ports and logs all connection attempts."""

import asyncio
import json
import logging
import os
import socket
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.request import Request, urlopen

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("port-honeypot")

INGEST_API_URL = os.getenv("INGEST_API_URL", "http://ingest-api:3000")
INGEST_SHARED_SECRET = os.getenv("INGEST_SHARED_SECRET", "")
SENSOR_ID = os.getenv("SENSOR_ID", f"port-{socket.gethostname()}")
SENSOR_NAME = os.getenv("SENSOR_NAME", "Port Honeypot")
CLIENT_SLUG = os.getenv("CLIENT_SLUG", "")
CLIENT_NAME = os.getenv("CLIENT_NAME", "")
VERSION = "1.1.0"
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
BANNERS: dict[int, bytes] = {}


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


# Attack events are appended as JSONL to EVENT_LOG_PATH; Vector tails this file
# and ships to the ingest-api with a disk buffer, so an ingest/network outage no
# longer drops events. A single asyncio loop serializes these writes, so no lock
# is needed. The heartbeat above stays a direct POST — it carries live state, not
# events, and need not survive an outage.
EVENT_LOG_PATH = os.getenv("EVENT_LOG_PATH", "/var/log/port-honeypot/events.json")
os.makedirs(os.path.dirname(EVENT_LOG_PATH), exist_ok=True)


def _emit(event: dict):
    try:
        with open(EVENT_LOG_PATH, "a") as fh:
            fh.write(json.dumps(event, default=str) + "\n")
            fh.flush()
    except Exception as exc:
        log.debug("event log write error: %s", exc)


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
    _emit(payload)


def _http_response(
    status: str,
    body: bytes,
    *,
    content_type: str = "application/json",
    headers: dict[str, str] | None = None,
) -> bytes:
    extra_headers = headers or {}
    header_lines = [
        f"HTTP/1.1 {status}",
        f"Content-Type: {content_type}",
        f"Content-Length: {len(body)}",
        "Connection: close",
    ]
    header_lines.extend(f"{k}: {v}" for k, v in extra_headers.items())
    return ("\r\n".join(header_lines) + "\r\n\r\n").encode() + body


def _parse_http_request(data: bytes) -> dict[str, Any]:
    text = data.decode("latin-1", "replace")
    lines = text.split("\r\n")
    request_line = lines[0] if lines else ""
    parts = request_line.split()
    method = parts[0] if len(parts) >= 1 else ""
    path = parts[1] if len(parts) >= 2 else "/"
    version = parts[2] if len(parts) >= 3 else "HTTP/1.1"
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if not line:
            break
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()
    body = b""
    if b"\r\n\r\n" in data:
        body = data.split(b"\r\n\r\n", 1)[1]
    return {
        "method": method,
        "path": path,
        "version": version,
        "headers": headers,
        "body": body,
        "rawText": text,
    }


def _docker_response(method: str, path: str) -> bytes:
    if path == "/_ping":
        return _http_response("200 OK", b"OK", content_type="text/plain", headers={"Api-Version": "1.45"})
    if path in ("/version", "/v1.24/version"):
        body = json.dumps({
            "Platform": {"Name": "Docker Engine - Community"},
            "Version": "26.1.4",
            "ApiVersion": "1.45",
            "MinAPIVersion": "1.24",
            "GitCommit": "5650f9b",
            "GoVersion": "go1.22.3",
            "Os": "linux",
            "Arch": "amd64",
            "KernelVersion": "5.15.0-91-generic",
        }).encode()
        return _http_response("200 OK", body, headers={"Api-Version": "1.45"})
    if path in ("/info", "/v1.24/info"):
        body = json.dumps({
            "ID": "A1BC:23DE:45FG:67HI:89JK:10LM:11NO:12PQ",
            "Containers": 7,
            "ContainersRunning": 3,
            "ContainersStopped": 4,
            "Images": 12,
            "Driver": "overlay2",
            "DockerRootDir": "/var/lib/docker",
            "Name": "docker-gateway-01",
            "ServerVersion": "26.1.4",
            "OperatingSystem": "Ubuntu 22.04.4 LTS",
            "Architecture": "x86_64",
            "CPUs": 4,
            "MemTotal": 8363184128,
        }).encode()
        return _http_response("200 OK", body, headers={"Api-Version": "1.45"})
    if path.startswith("/containers/json"):
        body = json.dumps([
            {
                "Id": "4f8f4c8d0b0db4d88e2b9e4fcb0d8d3b5123456789abcdef0123456789abcd",
                "Image": "nginx:1.25-alpine",
                "Command": '"/docker-entrypoint.sh nginx -g \'daemon off;\'"',
                "Created": 1719302400,
                "State": "running",
                "Status": "Up 3 days",
                "Names": ["/proxy"],
            },
            {
                "Id": "ad2ce0f3d1a944c4b6d8f0a81234567890abcdef1234567890abcdef123456",
                "Image": "redis:7.2",
                "Command": '"docker-entrypoint.sh redis-server"',
                "Created": 1719298800,
                "State": "running",
                "Status": "Up 3 days",
                "Names": ["/cache"],
            },
        ]).encode()
        return _http_response("200 OK", body, headers={"Api-Version": "1.45"})
    if method == "POST" and "/containers/create" in path:
        body = json.dumps({
            "Id": "7c9de711234567890abcdef1234567890abcdef1234567890abcdef1234567",
            "Warnings": [],
        }).encode()
        return _http_response("201 Created", body, headers={"Api-Version": "1.45"})
    return _http_response("404 Not Found", b'{"message":"page not found"}')


def _es_response(path: str) -> bytes:
    if path in ("/", ""):
        body = json.dumps({
            "name": "es-data-01",
            "cluster_name": "prod-search",
            "cluster_uuid": "k8Y2wHfYQz2A1B9mD4xN5Q",
            "version": {
                "number": "8.13.4",
                "lucene_version": "9.10.0",
            },
            "tagline": "You Know, for Search",
        }).encode()
        return _http_response("200 OK", body)
    if path.startswith("/_cluster/health"):
        body = json.dumps({
            "cluster_name": "prod-search",
            "status": "green",
            "number_of_nodes": 3,
            "number_of_data_nodes": 2,
            "active_primary_shards": 16,
            "active_shards": 32,
        }).encode()
        return _http_response("200 OK", body)
    if path.startswith("/_cat/indices"):
        body = (
            b"green open logs-prod-2026.06.25 8YxR7k31Q6WwN3cA2t7wQg 1 1 42191 0 28.4mb 14.2mb\n"
            b"green open audit-prod-2026.06.25 9JmN6b20E5VuM2bF1s6vPf 1 1  9121 0  6.8mb  3.4mb\n"
        )
        return _http_response("200 OK", body, content_type="text/plain; charset=utf-8")
    if path.startswith("/_search"):
        body = json.dumps({
            "took": 4,
            "timed_out": False,
            "_shards": {"total": 1, "successful": 1, "skipped": 0, "failed": 0},
            "hits": {"total": {"value": 0, "relation": "eq"}, "hits": []},
        }).encode()
        return _http_response("200 OK", body)
    return _http_response("404 Not Found", b'{"error":"resource_not_found_exception","status":404}')


def _web_panel_response(port: int, path: str) -> bytes:
    if port == 9090:
        title = "Cockpit"
        server = "Cockpit/295"
        body = (
            "<!DOCTYPE html><html><head><title>Cockpit</title></head>"
            "<body><div id='brand'>Cockpit</div><form>"
            "<input name='username' /><input name='password' type='password' />"
            "</form></body></html>"
        ).encode()
    else:
        title = "Operations Dashboard"
        server = "nginx/1.24.0"
        body = (
            "<!DOCTYPE html><html><head><title>Operations Dashboard</title></head>"
            "<body><h1>TechCorp Internal Dashboard</h1><p>Status: nominal</p>"
            "<form><input name='username' /><input name='password' type='password' /></form>"
            "</body></html>"
        ).encode()
    if path.startswith("/api/health"):
        return _http_response("200 OK", b'{"status":"ok"}', headers={"Server": server})
    return _http_response("200 OK", body, content_type="text/html; charset=utf-8", headers={"Server": server})


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


# ── Redis / RESP ─────────────────────────────────────────────────────────────
# A static "-ERR unknown command 'PING'" reply to every input is a dead giveaway:
# a real Redis answers PING with +PONG, INFO with a server dump, etc. We speak just
# enough RESP to look like an unauthenticated open Redis (the juicy misconfig an
# attacker hopes for) while capturing the commands they run.
REDIS_INFO = (
    "# Server\r\nredis_version:7.2.4\r\nredis_mode:standalone\r\nos:Linux 5.15.0-91-generic x86_64\r\n"
    "arch_bits:64\r\nprocess_id:1\r\ntcp_port:6379\r\nuptime_in_seconds:2847193\r\n"
    "# Clients\r\nconnected_clients:1\r\n"
    "# Memory\r\nused_memory_human:1.04M\r\nmaxmemory_human:0B\r\n"
    "# Keyspace\r\ndb0:keys=14,expires=2,avg_ttl=0\r\n"
)


def _redis_reply(cmd: str, args: list[str]) -> bytes:
    c = cmd.upper()
    if c == "PING":
        return b"+PONG\r\n" if not args else b"$%d\r\n%s\r\n" % (len(args[0]), args[0].encode())
    if c == "INFO":
        body = REDIS_INFO.encode()
        return b"$%d\r\n%s\r\n" % (len(body), body)
    if c == "COMMAND":
        return b"*0\r\n"
    if c in ("AUTH",):  # open instance: accept so they think they're in
        return b"+OK\r\n"
    if c in ("SELECT", "CONFIG", "CLIENT", "HELLO"):
        return b"+OK\r\n"
    if c in ("GET", "HGET"):
        return b"$-1\r\n"  # nil
    if c in ("SET", "DEL", "EXPIRE", "FLUSHALL", "FLUSHDB"):
        return b"+OK\r\n"
    if c == "KEYS":
        return b"*0\r\n"
    if c in ("QUIT",):
        return b"+OK\r\n"
    return b"-ERR unknown command '%s'\r\n" % c.encode()


def _parse_resp(buf: bytes) -> list[str]:
    """Best-effort RESP / inline parse → [cmd, arg, ...]. Returns [] if incomplete."""
    text = buf.decode("latin-1", "replace").strip()
    if not text:
        return []
    if text[0] == "*":  # RESP array
        toks, lines = [], text.split("\r\n")
        i = 1
        while i < len(lines):
            if lines[i].startswith("$"):
                i += 1
                if i < len(lines):
                    toks.append(lines[i])
            i += 1
        return toks
    return text.split()  # inline command


async def handle_redis(reader, writer, src_ip, src_port, port):
    captured: list[str] = []
    try:
        for _ in range(20):  # cap commands per session
            data = await asyncio.wait_for(reader.read(4096), timeout=8)
            if not data:
                break
            toks = _parse_resp(data)
            if not toks:
                continue
            captured.append(" ".join(toks)[:200])
            writer.write(_redis_reply(toks[0], toks[1:]))
            await writer.drain()
            if toks[0].upper() == "QUIT":
                break
    except (asyncio.TimeoutError, Exception):
        pass
    extra = {"protocolName": "redis", "commands": captured}
    await asyncio.get_event_loop().run_in_executor(
        None, _send, src_ip, src_port, port, "", "connect", None, None, extra
    )


async def handle_httpish(reader, writer, src_ip, src_port, port):
    raw = b""
    extra: dict[str, Any] = {"protocolName": SERVICES.get(port, "http")}
    event_type = "connect"
    username = None
    password = None
    try:
        raw = await asyncio.wait_for(reader.read(8192), timeout=5)
        req = _parse_http_request(raw)
        method = req["method"] or "GET"
        path = req["path"] or "/"
        headers = req["headers"]
        extra.update({
            "httpMethod": method,
            "httpPath": path[:200],
            "userAgent": headers.get("user-agent", ""),
            "hostHeader": headers.get("host", ""),
        })

        auth = headers.get("authorization", "")
        if auth:
            event_type = "auth"
            username = auth[:160]
            extra["authorizationHeader"] = auth[:200]

        if port == 2375:
            response = _docker_response(method, path)
        elif port == 9200:
            response = _es_response(path)
        else:
            response = _web_panel_response(port, path)

        writer.write(response)
        await writer.drain()
    except (asyncio.TimeoutError, Exception):
        pass
    await asyncio.get_event_loop().run_in_executor(
        None, _send, src_ip, src_port, port, raw.hex(), event_type, username, password, extra
    )


async def handle_mongodb(reader, writer, src_ip, src_port, port):
    raw = b""
    extra: dict[str, Any] = {"protocolName": "mongodb"}
    try:
        raw = await asyncio.wait_for(reader.read(4096), timeout=5)
        if len(raw) >= 16:
            extra["messageLength"] = int.from_bytes(raw[0:4], "little", signed=False)
            extra["requestId"] = int.from_bytes(raw[4:8], "little", signed=True)
            extra["opCode"] = int.from_bytes(raw[12:16], "little", signed=True)
        if b"admin.$cmd" in raw:
            extra["targetNamespace"] = "admin.$cmd"
        writer.write(b"\x21\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xd4\x07\x00\x00\x00\x00\x00\x00")
        await writer.drain()
    except (asyncio.TimeoutError, Exception):
        pass
    await asyncio.get_event_loop().run_in_executor(
        None, _send, src_ip, src_port, port, raw.hex(), "connect", None, None, extra
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
            elif port == 6379:
                await handle_redis(reader, writer, src_ip, src_port, port)
            elif port in {2375, 8888, 9090, 9200}:
                await handle_httpish(reader, writer, src_ip, src_port, port)
            elif port == 27017:
                await handle_mongodb(reader, writer, src_ip, src_port, port)
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
