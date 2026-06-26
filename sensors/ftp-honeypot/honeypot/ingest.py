import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

from .config import (
    INGEST_API_URL, INGEST_SHARED_SECRET, SENSOR_ID, SENSOR_NAME,
    CLIENT_SLUG, CLIENT_NAME, VERSION, SENSOR_HOST,
    DST_PORT, EVENT_LOG_PATH, CAPTURES_DIR,
)

log = logging.getLogger("ftp-honeypot")


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


def _emit(event: dict):
    try:
        with open(EVENT_LOG_PATH, "a") as fh:
            fh.write(json.dumps(event, default=str) + "\n")
            fh.flush()
    except Exception as exc:
        log.debug("event log write error: %s", exc)


def send(event_type, src_ip, src_port, username=None, password=None, extra=None):
    _emit({
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


def save_upload(content: bytes, filename: str, src_ip: str, src_port: int) -> dict:
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


def send_heartbeat(sensor_ip: str, dst_port: int):
    _post("/sensors/heartbeat", {
        "sensorId": SENSOR_ID,
        "name": SENSOR_NAME,
        "clientSlug": CLIENT_SLUG,
        "clientName": CLIENT_NAME,
        "protocol": "ftp",
        "ip": sensor_ip,
        "version": VERSION,
        "ports": [dst_port],
        "probePorts": [int(os.getenv("PORT", "21"))],
        "host": SENSOR_HOST,
    })
