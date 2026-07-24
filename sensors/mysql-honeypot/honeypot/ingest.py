import json
import logging
import os
import socket
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

from .config import (
    CONFIG_HASH, INGEST_API_URL, INGEST_SHARED_SECRET, SENSOR_ID, SENSOR_NAME,
    CLIENT_SLUG, CLIENT_NAME, VERSION, SENSOR_HOST, SENSOR_LAYER,
    DST_PORT, EVENT_LOG_PATH,
)

log = logging.getLogger("mysql-honeypot")


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


def send(event_type, src_ip, src_port, username=None, database=None, extra=None):
    data: dict = {}
    if database:
        data["database"] = database
    if isinstance(extra, dict):
        data.update(extra)
    if SENSOR_LAYER == "internal":
        data["layer"] = "internal"
    _emit({
        "eventId": str(uuid.uuid4()),
        "sensorId": SENSOR_ID,
        "protocol": "mysql",
        "srcIp": src_ip,
        "srcPort": src_port,
        "dstPort": DST_PORT,
        "eventType": event_type,
        "username": username,
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


def send_heartbeat(sensor_ip: str):
    payload: dict = {
        "sensorId": SENSOR_ID,
        "name": SENSOR_NAME,
        "clientSlug": CLIENT_SLUG,
        "clientName": CLIENT_NAME,
        "protocol": "mysql",
        "ip": sensor_ip,
        "version": VERSION,
        "ports": [DST_PORT],
        "probePorts": [int(os.getenv("PORT", "3306"))],
        "portStatus": {DST_PORT: _port_open("127.0.0.1", int(os.getenv("PORT", "3306")))},
        "host": SENSOR_HOST,
    }
    if SENSOR_LAYER == "internal":
        payload["layer"] = "internal"
        payload["realProtocol"] = "mysql"
    if CONFIG_HASH:
        payload["configHash"] = CONFIG_HASH
    _post("/sensors/heartbeat", payload)
