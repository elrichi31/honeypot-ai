import json
import logging
import os
import threading
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

from .config import (
    INGEST_API_URL, INGEST_SHARED_SECRET, SENSOR_ID, SENSOR_NAME,
    CLIENT_SLUG, CLIENT_NAME, VERSION, SENSOR_HOST, SENSOR_LAYER,
    DST_PORT, EVENT_LOG_PATH,
)

log = logging.getLogger("smb-honeypot")
_log_lock = threading.Lock()


def detect_ip() -> str:
    ip = os.getenv("SENSOR_IP", "")
    if ip:
        return ip
    for url in ("http://ifconfig.me/ip", "http://api.ipify.org", "http://checkip.amazonaws.com"):
        try:
            return urlopen(url, timeout=4).read().decode().strip()
        except Exception:
            continue
    return ""


def _post(path: str, payload: dict) -> tuple[bool, int | None, str | None]:
    body = json.dumps(payload, default=str).encode()
    req = Request(
        f"{INGEST_API_URL}{path}",
        data=body,
        headers={"Content-Type": "application/json", "X-Ingest-Token": INGEST_SHARED_SECRET},
        method="POST",
    )
    try:
        with urlopen(req, timeout=5) as resp:
            return 200 <= getattr(resp, "status", 200) < 300, getattr(resp, "status", 200), None
    except Exception as exc:
        return False, None, str(exc)


def post_malware(payload: dict):
    ok, status, err = _post("/ingest/malware", payload)
    if not ok:
        log.warning("post_malware failed status=%s err=%s", status, err)


def _emit(event: dict):
    try:
        line = json.dumps(event, default=str) + "\n"
        with _log_lock:
            with open(EVENT_LOG_PATH, "a") as fh:
                fh.write(line)
                fh.flush()
    except Exception as exc:
        log.debug("event log write error: %s", exc)


def send(event_type: str, src_ip: str, src_port: int | None,
         username: str | None = None, extra: dict | None = None):
    data = dict(extra or {})
    if SENSOR_LAYER == "internal":
        data["layer"] = "internal"
    _emit({
        "eventId":   str(uuid.uuid4()),
        "sensorId":  SENSOR_ID,
        "protocol":  "smb",
        "srcIp":     src_ip,
        "srcPort":   src_port,
        "dstPort":   DST_PORT,
        "eventType": event_type,
        "username":  username,
        "data":      data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    log.info("shipped event_type=%s src=%s user=%s", event_type, src_ip, username or "-")


def send_heartbeat(sensor_ip: str) -> tuple[bool, int | None, str | None]:
    payload: dict = {
        "sensorId":   SENSOR_ID,
        "name":       SENSOR_NAME,
        "clientSlug": CLIENT_SLUG,
        "clientName": CLIENT_NAME,
        "protocol":   "smb",
        "ip":         sensor_ip,
        "version":    VERSION,
        "ports":      [DST_PORT],
        "probePorts": [int(os.getenv("PORT", "445"))],
        "host":       SENSOR_HOST,
    }
    if SENSOR_LAYER == "internal":
        payload["layer"] = "internal"
        payload["realProtocol"] = "smb"
    return _post("/sensors/heartbeat", payload)
