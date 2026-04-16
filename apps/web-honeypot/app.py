"""
Web Honeypot — captures HTTP attacks and forwards events to the ingest-api.

Design goals (inspired by SNARE/TANNER):
  - Respond convincingly so scanners keep probing (more data for us)
  - Classify attack type before forwarding
  - Never block — always reply, even on ingest failures
  - Minimal deps: Flask only
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone

import requests
from flask import Flask, request, Response
from classifier import classify
from responses import get_response

app = Flask(__name__)

INGEST_URL = os.environ.get("INGEST_API_URL", "http://ingest-api:3000")
INGEST_SHARED_SECRET = os.environ.get("INGEST_SHARED_SECRET", "")
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("web-honeypot")

# Headers that make us look like Apache
APACHE_HEADERS = {
    "Server": "Apache/2.4.57 (Ubuntu)",
    "X-Powered-By": "PHP/8.1.2-1ubuntu2.14",
}


def get_real_ip() -> str:
    """Respect X-Forwarded-For if behind a proxy, fall back to remote addr."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def send_to_ingest(event: dict) -> None:
    """Fire-and-forget POST to ingest-api. Never raises."""
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

    # Build ingest event
    event = {
        "eventId":    str(uuid.uuid4()),
        "timestamp":  datetime.now(timezone.utc).isoformat(),
        "srcIp":      src_ip,
        "method":     method,
        "path":       full_path,
        "query":      query,
        "userAgent":  user_agent,
        "headers":    dict(request.headers),
        "body":       body_raw,
        "attackType": attack_type,
    }

    log.info("[%s] %s %s?%s — %s", src_ip, method, full_path, query, attack_type)
    send_to_ingest(event)

    # Build a convincing response
    resp_body, content_type, status_code = get_response(full_path, method, body_raw, attack_type)

    # HEAD requests: same headers, no body
    if method == "HEAD":
        resp_body = ""

    response = Response(resp_body, status=status_code, content_type=content_type)
    for k, v in APACHE_HEADERS.items():
        response.headers[k] = v

    return response


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    log.info("Web honeypot listening on :%d", port)
    app.run(host="0.0.0.0", port=port, debug=False)
