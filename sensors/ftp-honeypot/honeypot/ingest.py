import hashlib
import json
import logging
import os
import socket
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

from .config import (
    CONFIG_HASH, INGEST_API_URL, INGEST_SHARED_SECRET, SENSOR_ID, SENSOR_NAME,
    CLIENT_SLUG, CLIENT_NAME, VERSION, SENSOR_HOST,
    DST_PORT, EVENT_LOG_PATH, CAPTURES_DIR, SENSOR_LAYER,
)

log = logging.getLogger("ftp-honeypot")


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
        with urlopen(req, timeout=5) as resp:
            status = resp.status
            if status >= 400:
                log.warning("ingest %s returned %s: %s", path, status, resp.read().decode()[:200])
    except Exception as exc:
        log.warning("ingest %s error: %s", path, exc)


def _emit(event: dict):
    try:
        with open(EVENT_LOG_PATH, "a") as fh:
            fh.write(json.dumps(event, default=str) + "\n")
            fh.flush()
    except Exception as exc:
        log.debug("event log write error: %s", exc)


def send(event_type, src_ip, src_port, username=None, password=None, extra=None):
    data = extra or {}
    if SENSOR_LAYER == "internal":
        data = {**data, "layer": "internal"}
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
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


def _detect_file_type(content: bytes) -> str:
    if content[:2] == b'MZ': return 'PE/EXE'
    if content[:4] == b'\x7fELF': return 'ELF'
    if content[:2] == b'PK': return 'ZIP'
    if content[:2] == b'\x1f\x8b': return 'GZIP'
    if content[:4] == b'\x89PNG': return 'PNG'
    if content[:2] == b'\xff\xd8': return 'JPEG'
    if content[:4] == b'%PDF': return 'PDF'
    if content[:6] == b'Rar!\x1a\x07': return 'RAR'
    if content[:4] == b'\xca\xfe\xba\xbe': return 'Mach-O'
    return 'Binary'


def save_upload(content: bytes, filename: str, src_ip: str, src_port: int) -> dict:
    md5 = hashlib.md5(content).hexdigest()
    sha256 = hashlib.sha256(content).hexdigest()
    file_type = _detect_file_type(content)
    source_url = f"ftp://upload/{filename}"
    meta = {
        "sourceUrl": source_url,
        "sourceName": filename,
        "sourceType": "ftp",
        "srcIp": src_ip,
        "srcPort": src_port,
        "dstPort": DST_PORT,
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

    _post("/ingest/malware", {
        "md5": md5,
        "fileType": file_type,
        "size": len(content),
        "source": "ftp",
        "sourceUrl": source_url,
        "sourceName": filename,
        "srcIp": src_ip,
        "srcPort": src_port,
        "dstPort": DST_PORT,
        "sensorId": SENSOR_ID,
        "capturedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    })

    return {"fileName": filename, "md5": md5, "sha256": sha256, "size": len(content)}


def send_heartbeat(sensor_ip: str, dst_port: int):
    payload = {
        "sensorId": SENSOR_ID,
        "name": SENSOR_NAME,
        "clientSlug": CLIENT_SLUG,
        "clientName": CLIENT_NAME,
        "protocol": "ftp",
        "ip": sensor_ip,
        "version": VERSION,
        "ports": [dst_port],
        "probePorts": [int(os.getenv("PORT", "21"))],
        "portStatus": {dst_port: _port_open("127.0.0.1", int(os.getenv("PORT", "21")))},
        "host": SENSOR_HOST,
    }
    if SENSOR_LAYER == "internal":
        payload["layer"] = "internal"
        payload["realProtocol"] = "ftp"
    if CONFIG_HASH:
        payload["configHash"] = CONFIG_HASH
    _post("/sensors/heartbeat", payload)
