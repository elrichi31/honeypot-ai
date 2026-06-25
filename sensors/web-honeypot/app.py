"""
Web Honeypot — captures HTTP attacks and forwards events to the ingest-api.

Design goals (inspired by SNARE/TANNER):
  - Respond convincingly so scanners keep probing (more data for us)
  - Classify attack type before forwarding
  - Never block — always reply, even on ingest failures
  - Minimal deps: Flask only
"""

import hashlib
import logging
import os
import secrets
import socket
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from email.utils import formatdate
from urllib.request import urlopen

import requests
from flask import Flask, g, request, Response, session
from classifier import classify
from response_catalog import get_response

app = Flask(__name__)
# Stable key keeps sessions alive across WSGI worker restarts.
# Override via SECRET_KEY env var in production.
app.secret_key = os.environ.get("SECRET_KEY", "hp-default-secret-change-me")

INGEST_URL = os.environ.get("INGEST_API_URL", "http://ingest-api:3000")
INGEST_SHARED_SECRET = os.environ.get("INGEST_SHARED_SECRET", "")
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
SENSOR_ID = os.environ.get("SENSOR_ID", f"http-{socket.gethostname()}")
SENSOR_NAME = os.environ.get("SENSOR_NAME", "Web Honeypot")
CLIENT_SLUG = os.environ.get("CLIENT_SLUG", "")
CLIENT_NAME = os.environ.get("CLIENT_NAME", "")
SENSOR_HOST = os.environ.get("SENSOR_HOST", socket.gethostname())

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("web-honeypot")


# ---------------------------------------------------------------------------
# Per-IP session tracker — pure in-memory, no external deps.
#
# Keeps a rolling window of activity per source IP so each event is enriched
# with session context: how many hits, which paths were visited, what attack
# types were seen, and whether this looks like recon → exploitation chain.
#
# Design constraints:
#   - O(1) per request (dict lookup + deque append)
#   - Bounded memory: max MAX_IPS entries, last MAX_PATHS_PER_IP paths kept
#   - TTL eviction: sessions older than SESSION_TTL_S are pruned lazily on
#     each new request from that IP (no background thread needed)
#   - Thread-safe via a single lock (coarse but sufficient — contention is
#     negligible compared to network I/O in the ingest thread)
# ---------------------------------------------------------------------------

_SESSION_TTL_S     = 1800        # forget IP after 30 min of inactivity
_MAX_IPS           = 8_000       # cap total tracked IPs to bound RAM
_MAX_PATHS_PER_IP  = 50          # keep last N paths per IP
_SESSION_LOCK      = threading.Lock()
_IP_SESSIONS: dict[str, dict] = {}


def _session_get_or_create(ip: str) -> dict:
    now = time.monotonic()
    sess = _IP_SESSIONS.get(ip)
    if sess is None or (now - sess["last_seen"]) > _SESSION_TTL_S:
        sess = {
            "first_seen":   now,
            "last_seen":    now,
            "hits":         0,
            "paths":        deque(maxlen=_MAX_PATHS_PER_IP),
            "attack_types": set(),
            "canary_hits":  0,
        }
        if len(_IP_SESSIONS) >= _MAX_IPS:
            # Evict the oldest entry to stay within the cap
            oldest = min(_IP_SESSIONS, key=lambda k: _IP_SESSIONS[k]["last_seen"])
            del _IP_SESSIONS[oldest]
        _IP_SESSIONS[ip] = sess
    return sess


def update_session(ip: str, path: str, attack_type: str, canary: bool) -> dict:
    """Update per-IP state and return a snapshot for the current event."""
    with _SESSION_LOCK:
        sess = _session_get_or_create(ip)
        now  = time.monotonic()
        sess["hits"]        += 1
        sess["last_seen"]    = now
        sess["paths"].append(path)
        sess["attack_types"].add(attack_type)
        if canary:
            sess["canary_hits"] += 1

        elapsed = now - sess["first_seen"]
        return {
            "sessionHits":      sess["hits"],
            "sessionElapsedS":  round(elapsed, 1),
            "pathsVisited":     list(sess["paths"]),
            "attackTypes":      list(sess["attack_types"]),
            "canaryHitsTotal":  sess["canary_hits"],
            # Simple chain signal: recon paths followed by exploit attempt
            "isChainAttack":    (
                sess["hits"] > 1
                and attack_type not in ("recon", "scanner", "info_disclosure")
                and any(t in sess["attack_types"] - {attack_type}
                        for t in ("recon", "scanner", "info_disclosure"))
            ),
        }


def _passive_fingerprint() -> str:
    """
    Stable browser/tool fingerprint from passive HTTP headers.
    Same client → same hash even across different IPs (VPN detection).
    Combines UA + Accept + Accept-Encoding + Accept-Language.
    """
    parts = "|".join([
        request.headers.get("User-Agent", ""),
        request.headers.get("Accept", ""),
        request.headers.get("Accept-Encoding", ""),
        request.headers.get("Accept-Language", ""),
    ])
    return hashlib.sha256(parts.encode()).hexdigest()[:16]


def _detect_ip() -> str:
    ip = os.environ.get("SENSOR_IP", "")
    if ip:
        return ip
    for url in ("http://ifconfig.me/ip", "http://api.ipify.org", "http://checkip.amazonaws.com"):
        try:
            detected = urlopen(url, timeout=4).read().decode().strip()
            if detected:
                return detected
        except Exception:
            continue
    return ""


SENSOR_IP = _detect_ip()

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


def get_real_ip() -> str:
    # The honeypot is exposed directly (no trusted reverse proxy in front),
    # so X-Forwarded-For is attacker-controlled and must never be used.
    return request.remote_addr or "unknown"


def _post_to_ingest(event: dict) -> None:
    try:
        headers = {}
        if INGEST_SHARED_SECRET:
            headers["X-Ingest-Token"] = INGEST_SHARED_SECRET
        resp = requests.post(
            f"{INGEST_URL}/ingest/web/event",
            json=event,
            headers=headers,
            timeout=3,
        )
        if resp.status_code not in (200, 201):
            log.warning("Ingest returned %s: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        log.warning("Ingest send failed: %s", exc)


def send_to_ingest(event: dict) -> None:
    """Non-blocking: fires ingest POST in a daemon thread so the handler returns immediately."""
    threading.Thread(target=_post_to_ingest, args=(event,), daemon=True).start()


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
        requests.post(
            f"{INGEST_URL}/sensors/heartbeat",
            json={
                "sensorId": SENSOR_ID,
                "name": SENSOR_NAME,
                "clientSlug": CLIENT_SLUG,
                "clientName": CLIENT_NAME,
                "protocol": "http",
                "ip": SENSOR_IP,
                "version": "1.0.0",
                "ports": display_ports,
                "probePorts": probe_ports,
                "host": SENSOR_HOST,
            },
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
