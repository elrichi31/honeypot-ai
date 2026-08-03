import json
import logging
import os
import socket
import threading
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

from .config import (
    CONFIG_HASH, INGEST_API_URL, INGEST_SHARED_SECRET, SENSOR_ID, SENSOR_NAME,
    CLIENT_SLUG, CLIENT_NAME, VERSION, SENSOR_HOST, SENSOR_LAYER, SENSOR_LOCAL_IP,
    DST_PORT, EVENT_LOG_PATH,
)

log = logging.getLogger("smb-honeypot")
_log_lock = threading.Lock()


def _port_open(host: str, port: int, timeout: float = 1.5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


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


def _post(path: str, payload: dict) -> tuple[bool, int | None, str | None, dict | None]:
    body = json.dumps(payload, default=str).encode()
    req = Request(
        f"{INGEST_API_URL}{path}",
        data=body,
        headers={"Content-Type": "application/json", "X-Ingest-Token": INGEST_SHARED_SECRET},
        method="POST",
    )
    try:
        with urlopen(req, timeout=5) as resp:
            status = getattr(resp, "status", 200)
            raw = resp.read()
            doc = json.loads(raw) if raw else {}
            return 200 <= status < 300, status, None, doc
    except Exception as exc:
        return False, None, str(exc), None


def _put_sample(md5: str, content: bytes) -> bool:
    """Ship the captured bytes so the dashboard can serve them. A sensor on a
    client network shares no volume with the platform, so without this the
    sample exists only here and every download 404s."""
    req = Request(
        f"{INGEST_API_URL}/ingest/malware/{md5}/content",
        data=content,
        headers={
            "Content-Type": "application/octet-stream",
            "X-Ingest-Token": INGEST_SHARED_SECRET,
        },
        method="PUT",
    )
    try:
        # Generous timeout: this is the one call whose size is attacker-chosen.
        with urlopen(req, timeout=120) as resp:
            return 200 <= resp.status < 300
    except Exception as exc:
        log.warning("sample upload %s failed: %s", md5, exc)
        return False


def post_malware(payload: dict, content: bytes | None = None):
    ok, status, err, doc = _post("/ingest/malware", payload)
    if not ok:
        log.warning("post_malware failed status=%s err=%s", status, err)
        return
    if content and doc and doc.get("needsContent"):
        _put_sample(payload["md5"], content)


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
        "portStatus": {DST_PORT: _port_open("127.0.0.1", int(os.getenv("PORT", "445")))},
        "host":       SENSOR_HOST,
    }
    if SENSOR_LOCAL_IP:
        payload["localIp"] = SENSOR_LOCAL_IP
    if SENSOR_LAYER == "internal":
        payload["layer"] = "internal"
        payload["realProtocol"] = "smb"
    if CONFIG_HASH:
        payload["configHash"] = CONFIG_HASH
    # Baked into the image at build (SENSOR_IMAGE_VERSION); lets the dashboard
    # show which image version this sensor runs (SENSOR_FLEET_UPDATES Fase 0).
    image_version = os.getenv("SENSOR_IMAGE_VERSION")
    if image_version:
        payload["imageVersion"] = image_version
    ok, status, err, _doc = _post("/sensors/heartbeat", payload)
    return ok, status, err
