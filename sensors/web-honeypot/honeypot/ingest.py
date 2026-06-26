"""Ingest client for web-honeypot — writes JSONL for Vector to tail."""

import json
import logging
import os
import threading
from urllib.request import urlopen

log = logging.getLogger("web-honeypot")

EVENT_LOG_PATH = os.environ.get("EVENT_LOG_PATH", "/var/log/web-honeypot/events.json")
os.makedirs(os.path.dirname(EVENT_LOG_PATH), exist_ok=True)
_log_lock = threading.Lock()


def send_to_ingest(event: dict) -> None:
    try:
        line = json.dumps(event, default=str) + "\n"
        with _log_lock:
            with open(EVENT_LOG_PATH, "a") as fh:
                fh.write(line)
                fh.flush()
    except Exception as exc:
        log.warning("Event log write failed: %s", exc)


def detect_ip() -> str:
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
