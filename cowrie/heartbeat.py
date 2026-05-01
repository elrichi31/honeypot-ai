#!/usr/bin/env python3
"""Generic sensor beacon — sends heartbeats to the ingest-api every 30 seconds.
Used by cowrie-beacon, galah-beacon, and any other sidecar that needs to register
a sensor without modifying the honeypot process itself.
"""
import json
import os
import socket
import time
from urllib.request import Request, urlopen

INGEST_URL  = os.getenv("INGEST_API_URL",       "http://ingest-api:3000")
SECRET      = os.getenv("INGEST_SHARED_SECRET",  "")
SENSOR_ID   = os.getenv("SENSOR_ID",             f"sensor-{socket.gethostname()}")
SENSOR_NAME = os.getenv("SENSOR_NAME",           "SSH Honeypot (Cowrie)")
SENSOR_IP   = os.getenv("SENSOR_IP",             "")
PROTOCOL    = os.getenv("SENSOR_PROTOCOL",       "ssh")
VERSION     = os.getenv("SENSOR_VERSION",        "cowrie")
_ports_raw  = os.getenv("SENSOR_PORTS",          "22")
PORTS       = [int(p) for p in _ports_raw.split() if p.strip().isdigit()]
_probe_raw  = os.getenv("SENSOR_PROBE_PORTS",    "")
PROBE_PORTS = [int(p) for p in _probe_raw.split() if p.strip().isdigit()]
# Docker service hostname of the actual honeypot container (not the beacon).
# When set, the ingest-api uses this for TCP port probing instead of the beacon's IP.
HOST        = os.getenv("SENSOR_HOST",           "")


def _detect_ip() -> str:
    if SENSOR_IP:
        return SENSOR_IP
    for url in ("http://ifconfig.me/ip", "http://api.ipify.org", "http://checkip.amazonaws.com"):
        try:
            ip = urlopen(url, timeout=4).read().decode().strip()
            if ip:
                return ip
        except Exception:
            continue
    return ""


def send(ip: str) -> None:
    payload = json.dumps({
        "sensorId":   SENSOR_ID,
        "name":       SENSOR_NAME,
        "protocol":   PROTOCOL,
        "ip":         ip,
        "version":    VERSION,
        "ports":      PORTS,
        "probePorts": PROBE_PORTS,
        "host":       HOST,
    }).encode()
    req = Request(
        f"{INGEST_URL}/sensors/heartbeat",
        data=payload,
        headers={"Content-Type": "application/json", "X-Ingest-Token": SECRET},
        method="POST",
    )
    try:
        urlopen(req, timeout=5)
        print(f"[beacon] heartbeat ok  sensor={SENSOR_ID}  protocol={PROTOCOL}  ip={ip or '-'}", flush=True)
    except Exception as exc:
        print(f"[beacon] heartbeat error: {exc}", flush=True)


if __name__ == "__main__":
    ip = _detect_ip()
    print(f"[beacon] starting  sensor={SENSOR_ID}  protocol={PROTOCOL}  ip={ip or 'unknown'}", flush=True)
    while True:
        send(ip)
        time.sleep(30)
