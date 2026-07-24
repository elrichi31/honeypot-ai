"""
Web Honeypot — captures HTTP attacks and forwards events to the ingest-api.

Design goals (inspired by SNARE/TANNER):
  - Respond convincingly so scanners keep probing (more data for us)
  - Classify attack type before forwarding
  - Never block — always reply, even on ingest failures
  - Minimal deps: Flask only
"""

import hashlib
import json
import logging
import os
import secrets
import socket
import threading
import time
import uuid
from datetime import datetime, timezone
from email.utils import formatdate

import gunicorn.http.wsgi as _wsgi
import requests
from flask import Flask, g, request, Response, session
from classifier import classify
from response_catalog import get_response
from honeypot.ingest import send_to_ingest, detect_ip
from honeypot.sessions import update_session

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "hp-default-secret-change-me")

INGEST_URL = os.environ.get("INGEST_API_URL", "http://ingest-api:3000")
INGEST_SHARED_SECRET = os.environ.get("INGEST_SHARED_SECRET", "")
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
SENSOR_ID = os.environ.get("SENSOR_ID", f"http-{socket.gethostname()}")
SENSOR_NAME = os.environ.get("SENSOR_NAME", "Web Honeypot")
CLIENT_SLUG = os.environ.get("CLIENT_SLUG", "")
CLIENT_NAME = os.environ.get("CLIENT_NAME", "")
SENSOR_HOST = os.environ.get("SENSOR_HOST", socket.gethostname())
SENSOR_LAYER = os.environ.get("SENSOR_LAYER", "external")
SIGNAL_DIR = os.environ.get("SIGNAL_DIR", "/signal")

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("web-honeypot")


def _passive_fingerprint() -> str:
    parts = "|".join([
        request.headers.get("User-Agent", ""),
        request.headers.get("Accept", ""),
        request.headers.get("Accept-Encoding", ""),
        request.headers.get("Accept-Language", ""),
    ])
    return hashlib.sha256(parts.encode()).hexdigest()[:16]


SENSOR_IP = detect_ip()

# Static headers that every response carries — mimics a typical Ubuntu/Apache/PHP stack.
# Keep these consistent across requests so fingerprinting tools see a stable identity.
_STATIC_HEADERS = {
    "Server": "Apache/2.4.57 (Ubuntu)",
    "X-Powered-By": "PHP/8.1.2-1ubuntu2.14",
    # Security headers a real hardened server would set
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # Keep-alive — real Apache does this
    "Connection": "Keep-Alive",
    "Keep-Alive": "timeout=5, max=100",
}


# ---------------------------------------------------------------------------
# Remote config (control plane, config.apply) — web-honeypot-beacon writes
# web-config.json + a hash file to the shared SIGNAL_DIR volume; each gunicorn
# worker (its own process) watches for a hash change and applies it in
# memory. No restart needed, unlike Cowrie's signal-volume-and-restart.
# ---------------------------------------------------------------------------

_last_applied_config_hash = ""


def _read_local_config_hash() -> str:
    try:
        with open(os.path.join(SIGNAL_DIR, "web.hash")) as f:
            return f.read().strip()
    except Exception:
        return ""


def _apply_web_config(config: dict) -> None:
    server = config.get("server_header")
    powered_by = config.get("powered_by_header")
    log_level = config.get("log_level")
    if server:
        # gunicorn's wsgi.Response.default_headers() always emits its own
        # "Server:" line from this module global (read fresh per request,
        # see gunicorn.conf.py's _patch_server_token docstring) — setting
        # _STATIC_HEADERS["Server"] alone has no effect on the wire, gunicorn
        # overrides it regardless of what Flask's response.headers carries.
        _wsgi.SERVER = server
        _wsgi.SERVER_SOFTWARE = server
        _STATIC_HEADERS["Server"] = server
    if powered_by:
        _STATIC_HEADERS["X-Powered-By"] = powered_by
    if log_level and logging.getLevelName(log.getEffectiveLevel()) != log_level:
        log.setLevel(getattr(logging, log_level, logging.INFO))


def _config_watch_loop():
    global _last_applied_config_hash
    while True:
        h = _read_local_config_hash()
        if h and h != _last_applied_config_hash:
            try:
                with open(os.path.join(SIGNAL_DIR, "web-config.json")) as f:
                    config = json.load(f)
                _apply_web_config(config)
                _last_applied_config_hash = h
                log.info("applied web config (hash=%s)", h)
            except Exception as exc:
                log.warning("config apply read error: %s", exc)
        time.sleep(5)


threading.Thread(target=_config_watch_loop, daemon=True).start()


def get_real_ip() -> str:
    # The honeypot is exposed directly (no trusted reverse proxy in front),
    # so X-Forwarded-For is attacker-controlled and must never be used.
    return request.remote_addr or "unknown"


@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
@app.route("/<path:path>",            methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
def catch_all(path: str):
    src_ip    = get_real_ip()
    method    = request.method
    full_path = "/" + path
    query     = request.query_string.decode("utf-8", errors="replace")
    user_agent = request.headers.get("User-Agent", "")
    body_raw  = request.get_data(as_text=True)[:4096]  # cap at 4 KB

    attack_type = classify(
        path=full_path,
        query=query,
        body=body_raw,
        user_agent=user_agent,
    )

    # Build a convincing response. Handlers may set g.canary_triggered when an
    # attacker reuses the leaked DB credentials, so render before building the event.
    resp_body, content_type, status_code = get_response(full_path, method, query, body_raw, attack_type)

    canary = bool(getattr(g, "canary_triggered", False))
    session_ctx = update_session(src_ip, full_path, attack_type, canary)
    fingerprint = _passive_fingerprint()

    # Build ingest event
    event = {
        "eventId":     str(uuid.uuid4()),
        "sensorId":    SENSOR_ID,
        "timestamp":   datetime.now(timezone.utc).isoformat(),
        "srcIp":       src_ip,
        "method":      method,
        "path":        full_path,
        "query":       query,
        "userAgent":   user_agent,
        "headers":     dict(request.headers),
        "body":        body_raw,
        "attackType":  attack_type,
        "canaryTriggered": canary,
        # Extra context for chain analysis and geo-profiling
        "referer":     request.headers.get("Referer", ""),
        "cookies":     dict(request.cookies),
        "contentType": request.content_type or "",
        "httpVersion": request.environ.get("SERVER_PROTOCOL", ""),
        "acceptLang":  request.headers.get("Accept-Language", ""),
        # Passive fingerprint — stable across IPs for same tool/browser
        "clientFingerprint": fingerprint,
        # Session context — enriches each event with the attacker's history
        **session_ctx,
        **({"layer": "internal"} if SENSOR_LAYER == "internal" else {}),
    }

    if canary:
        token_type = getattr(g, "canary_token_type", "unknown")
        log.warning(
            "[%s] CANARY reuse on %s — token=%s session hits=%d chain=%s fp=%s",
            src_ip, full_path, token_type, session_ctx["sessionHits"],
            session_ctx["isChainAttack"], fingerprint,
        )
    elif session_ctx["isChainAttack"]:
        log.warning(
            "[%s] CHAIN attack detected: %s after %s (hit #%d)",
            src_ip, attack_type, session_ctx["attackTypes"], session_ctx["sessionHits"],
        )
    log.info("[%s] %s %s?%s — %s (session=%d)", src_ip, method, full_path, query, attack_type, session_ctx["sessionHits"])
    send_to_ingest(event)

    # Content-Length jitter: append an HTML comment with a random nonce so every
    # HTML response has a slightly different size. This breaks the static
    # response-length signatures that dir-fuzzers (gobuster, ffuf) use to group or
    # filter pages. HTML-only — injecting into JSON/XML/SQL payloads would corrupt
    # them and hurt the very realism we're trying to preserve.
    if content_type.startswith("text/html") and method != "HEAD":
        resp_body = f"{resp_body}\n<!-- {secrets.token_hex(secrets.randbelow(24) + 4)} -->"

    # HEAD requests: same headers, no body
    if method == "HEAD":
        resp_body = ""

    response = Response(resp_body, status=status_code, content_type=content_type)

    for k, v in _STATIC_HEADERS.items():
        response.headers[k] = v

    # Dynamic headers — vary per request so they look real
    response.headers["Date"] = formatdate(usegmt=True)
    # Fake a last-modified date anchored to a plausible deploy window
    response.headers["Last-Modified"] = "Mon, 18 Nov 2024 08:32:17 GMT"
    # ETag derived from path — stable per URL, changes if the "page" changes
    etag_seed = abs(hash(full_path)) % 0xFFFFFFFF
    response.headers["ETag"] = f'"{etag_seed:08x}-{len(resp_body):x}"'
    response.headers["Accept-Ranges"] = "bytes"

    return response


def _port_open(host: str, port: int, timeout: float = 1.5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _send_heartbeat():
    try:
        headers = {"X-Ingest-Token": INGEST_SHARED_SECRET, "Content-Type": "application/json"}
        listen_port = int(os.environ.get("PORT", 8080))
        display_ports = [
            int(p) for p in os.environ.get("SENSOR_PORTS", str(listen_port)).split()
            if p.strip().isdigit()
        ]
        probe_ports = [
            int(p) for p in os.environ.get("SENSOR_PROBE_PORTS", str(listen_port)).split()
            if p.strip().isdigit()
        ]
        port_status = {
            dp: _port_open("127.0.0.1", probe_ports[i] if i < len(probe_ports) else listen_port)
            for i, dp in enumerate(display_ports)
        }
        payload = {
            "sensorId": SENSOR_ID,
            "name": SENSOR_NAME,
            "clientSlug": CLIENT_SLUG,
            "clientName": CLIENT_NAME,
            "protocol": "http",
            "ip": SENSOR_IP,
            "version": "1.0.0",
            "ports": display_ports,
            "probePorts": probe_ports,
            "portStatus": port_status,
            "host": SENSOR_HOST,
        }
        if SENSOR_LAYER == "internal":
            payload["layer"] = "internal"
            payload["realProtocol"] = "http"
        # Reported to confirm config.apply commands — the server only marks
        # one 'succeeded' once a heartbeat echoes back the hash it applied.
        # Omitted (not null) when there's no local config yet.
        local_hash = _read_local_config_hash()
        if local_hash:
            payload["configHash"] = local_hash
        requests.post(
            f"{INGEST_URL}/sensors/heartbeat",
            json=payload,
            headers=headers,
            timeout=5,
        )
    except Exception as exc:
        log.debug("heartbeat error: %s", exc)


def _heartbeat_loop():
    while True:
        _send_heartbeat()
        time.sleep(30)


# Start heartbeat in background regardless of how the app is launched (python / gunicorn).
# Each gunicorn worker gets its own thread but all upsert the same sensor record — harmless.
threading.Thread(target=_heartbeat_loop, daemon=True).start()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    log.info("Web honeypot listening on :%d  sensor=%s", port, SENSOR_ID)
    app.run(host="0.0.0.0", port=port, debug=False)
