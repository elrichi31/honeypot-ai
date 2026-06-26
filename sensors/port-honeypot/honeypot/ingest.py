import json
import logging
import os
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

from .config import (
    INGEST_API_URL, INGEST_SHARED_SECRET, SENSOR_ID,
    SENSOR_NAME, CLIENT_SLUG, CLIENT_NAME, VERSION, SENSOR_HOST,
    EVENT_LOG_PATH, SERVICES,
)

log = logging.getLogger("port-honeypot")


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


def send(
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
    data = {"service": service, "payloadHex": client_hex[:512]}
    if extra:
        data.update(extra)
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


def send_heartbeat(sensor_ip: str, active_ports: list[int]):
    _post("/sensors/heartbeat", {
        "sensorId": SENSOR_ID,
        "name": SENSOR_NAME,
        "clientSlug": CLIENT_SLUG,
        "clientName": CLIENT_NAME,
        "protocol": "port-scan",
        "ip": sensor_ip,
        "version": VERSION,
        "ports": active_ports,
        "probePorts": active_ports,
        "host": SENSOR_HOST,
    })
