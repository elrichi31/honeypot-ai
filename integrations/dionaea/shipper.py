#!/usr/bin/env python3
import json
import os
import socket
import threading
import time
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

INGEST_URL = os.getenv("INGEST_API_URL", "http://ingest-api:3000").rstrip("/")
SECRET = os.getenv("INGEST_SHARED_SECRET", "")

SENSOR_ID = os.getenv("SENSOR_ID", f"dionaea-{socket.gethostname()}")
SENSOR_NAME = os.getenv("SENSOR_NAME", "Dionaea Multi-Protocol Honeypot")
SENSOR_PROTOCOL = os.getenv("SENSOR_PROTOCOL", "dionaea")
SENSOR_VERSION = os.getenv("SENSOR_VERSION", "dionaea")
SENSOR_IP = os.getenv("SENSOR_IP", "")
SENSOR_HOST = os.getenv("SENSOR_HOST", "dionaea")
PORTS = [int(p) for p in os.getenv("SENSOR_PORTS", "21 42 69 135 445 1433 1723 1883 3306 8081").split() if p.isdigit()]
PROBE_PORTS = [int(p) for p in os.getenv("SENSOR_PROBE_PORTS", "").split() if p.isdigit()]

DIONAEA_LOG_PATH = os.getenv("DIONAEA_LOG_PATH", "/opt/dionaea/var/lib/dionaea/dionaea.json")
OFFSET_FILE = os.getenv("DIONAEA_OFFSET_FILE", "/state/dionaea.offset")
READ_FROM_END = os.getenv("READ_FROM_END", "1") == "1"

PORT_PROTOCOLS = {
    21: "ftp",
    42: "wins",
    69: "tftp",
    135: "rpc",
    445: "smb",
    1433: "mssql",
    1723: "pptp",
    1883: "mqtt",
    3306: "mysql",
    5060: "sip",
    5061: "sip",
    8081: "http-alt",
    27017: "mongodb",
}


def _detect_ip():
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


def _post_json(url, payload):
    req = Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "X-Ingest-Token": SECRET},
        method="POST",
    )
    with urlopen(req, timeout=5) as response:
        return response.status


def _send_heartbeat(ip):
    payload = {
        "sensorId": SENSOR_ID,
        "name": SENSOR_NAME,
        "protocol": SENSOR_PROTOCOL,
        "ip": ip,
        "version": SENSOR_VERSION,
        "ports": PORTS,
        "probePorts": PROBE_PORTS or PORTS,
        "host": SENSOR_HOST,
    }
    try:
        _post_json(f"{INGEST_URL}/sensors/heartbeat", payload)
        print(f"[dionaea-shipper] heartbeat ok sensor={SENSOR_ID} ip={ip or '-'}", flush=True)
    except Exception as exc:
        print(f"[dionaea-shipper] heartbeat error: {exc}", flush=True)


def _heartbeat_loop():
    ip = _detect_ip()
    print(f"[dionaea-shipper] starting heartbeat sensor={SENSOR_ID} ip={ip or 'unknown'}", flush=True)
    while True:
        _send_heartbeat(ip)
        time.sleep(30)


def _load_offset():
    try:
        with open(OFFSET_FILE, "r", encoding="utf-8") as fh:
            return int(fh.read().strip() or "0")
    except Exception:
        return 0


def _save_offset(value):
    os.makedirs(os.path.dirname(OFFSET_FILE), exist_ok=True)
    with open(OFFSET_FILE, "w", encoding="utf-8") as fh:
        fh.write(str(value))


def _normalize_timestamp(raw):
    if isinstance(raw, str):
        try:
            if raw.endswith("Z") or "+" in raw[10:]:
                return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
            return datetime.fromisoformat(raw).replace(tzinfo=timezone.utc).isoformat()
        except Exception:
            pass
    return datetime.now(timezone.utc).isoformat()


def _to_int(value, default=None):
    try:
        return int(value)
    except Exception:
        return default


def _extract_connection(raw):
    connection = raw.get("connection")
    if not isinstance(connection, dict):
        return None
    local = connection.get("local") or {}
    remote = connection.get("remote") or {}
    dst_port = _to_int(local.get("port"))
    if dst_port is None:
        return None

    src_port = _to_int(remote.get("port"))
    src_ip = str(remote.get("address") or "").strip()
    if not src_ip:
        return None

    protocol_name = PORT_PROTOCOLS.get(dst_port)
    if not protocol_name:
        protocol_name = str(connection.get("protocol") or SENSOR_PROTOCOL or "dionaea").strip().lower()

    return {
        "srcIp": src_ip,
        "srcPort": src_port,
        "dstPort": dst_port,
        "protocol": protocol_name,
        "connectionType": str(connection.get("type") or "").strip().lower(),
        "transport": str(connection.get("transport") or "").strip().lower(),
        "localAddress": str(local.get("address") or "").strip(),
        "remoteHostname": str(remote.get("hostname") or "").strip(),
    }


def _to_protocol_event(raw):
    conn = _extract_connection(raw)
    if not conn:
        return None

    event_id_source = json.dumps(raw, sort_keys=True, default=str)
    event_id = str(uuid.uuid5(uuid.NAMESPACE_URL, event_id_source))
    timestamp = _normalize_timestamp(raw.get("timestamp"))

    data = {
        "source": "dionaea",
        "sensor": SENSOR_ID,
        "connectionType": conn["connectionType"],
        "transport": conn["transport"],
        "localAddress": conn["localAddress"],
        "remoteHostname": conn["remoteHostname"],
        "raw": raw,
    }

    return {
        "eventId": event_id,
        "protocol": conn["protocol"],
        "srcIp": conn["srcIp"],
        "srcPort": conn["srcPort"],
        "dstPort": conn["dstPort"],
        "eventType": "connect",
        "username": None,
        "password": None,
        "data": data,
        "timestamp": timestamp,
    }


def _ship_event(event):
    try:
        status = _post_json(f"{INGEST_URL}/ingest/protocol/event", event)
        if status in (200, 201):
            print(
                f"[dionaea-shipper] shipped protocol={event['protocol']} src={event['srcIp']}:{event.get('srcPort') or '-'} dst={event['dstPort']}",
                flush=True,
            )
            return True
    except Exception as exc:
        print(f"[dionaea-shipper] ship error: {exc}", flush=True)
    return False


def _tail_loop():
    offset = _load_offset()
    started = False

    while True:
        try:
            if not os.path.exists(DIONAEA_LOG_PATH):
                time.sleep(2)
                continue

            size = os.path.getsize(DIONAEA_LOG_PATH)
            if not started:
                started = True
                if offset == 0 and READ_FROM_END:
                    offset = size
                    _save_offset(offset)
                    print(f"[dionaea-shipper] starting from end of {DIONAEA_LOG_PATH}", flush=True)
                else:
                    print(f"[dionaea-shipper] resuming {DIONAEA_LOG_PATH} at offset {offset}", flush=True)

            if size < offset:
                offset = 0
                _save_offset(offset)

            with open(DIONAEA_LOG_PATH, "r", encoding="utf-8") as fh:
                fh.seek(offset)

                while True:
                    line = fh.readline()
                    if not line:
                        offset = fh.tell()
                        _save_offset(offset)
                        time.sleep(1)
                        break

                    offset = fh.tell()
                    _save_offset(offset)

                    line = line.strip()
                    if not line:
                        continue

                    try:
                        raw = json.loads(line)
                    except Exception:
                        continue

                    event = _to_protocol_event(raw)
                    if not event:
                        continue

                    _ship_event(event)
        except Exception as exc:
            print(f"[dionaea-shipper] tail loop error: {exc}", flush=True)
            time.sleep(2)


if __name__ == "__main__":
    threading.Thread(target=_heartbeat_loop, daemon=True).start()
    _tail_loop()
