#!/usr/bin/env python3
"""Cowrie beacon — sends sensor heartbeats to the ingest-api every 30 seconds."""
import json
import os
import socket
import time
from urllib.request import Request, urlopen

INGEST_URL = os.getenv("INGEST_API_URL", "http://ingest-api:3000")
SECRET = os.getenv("INGEST_SHARED_SECRET", "")
SENSOR_ID = os.getenv("SENSOR_ID", f"cowrie-{socket.gethostname()}")
SENSOR_IP = os.getenv("SENSOR_IP", "")


def _detect_ip() -> str:
    """Return SENSOR_IP env var, or try to discover the public IP at startup."""
    if SENSOR_IP:
        return SENSOR_IP
    for url in ("http://ifconfig.me/ip", "http://api.ipify.org", "http://checkip.amazonaws.com"):
        try:
            resp = urlopen(url, timeout=4)
            ip = resp.read().decode().strip()
            if ip:
                return ip
        except Exception:
            continue
    return ""


def send(ip: str) -> None:
    payload = json.dumps({
        "sensorId": SENSOR_ID,
        "name": "SSH Honeypot (Cowrie)",
        "protocol": "ssh",
        "ip": ip,
        "version": "cowrie",
        "ports": [22],
    }).encode()
    req = Request(
        f"{INGEST_URL}/sensors/heartbeat",
        data=payload,
        headers={"Content-Type": "application/json", "X-Ingest-Token": SECRET},
        method="POST",
    )
    try:
        urlopen(req, timeout=5)
        print(f"[beacon] heartbeat ok  sensor={SENSOR_ID}  ip={ip or '-'}", flush=True)
    except Exception as exc:
        print(f"[beacon] heartbeat error: {exc}", flush=True)


if __name__ == "__main__":
    ip = _detect_ip()
    print(f"[beacon] starting  sensor={SENSOR_ID}  ip={ip or 'unknown'}", flush=True)
    while True:
        send(ip)
        time.sleep(30)
