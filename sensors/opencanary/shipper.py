#!/usr/bin/env python3
"""
opencanary-shipper: tails all OpenCanary JSON log files in /var/log/opencanary/
and ships each event to ingest-api as a protocol_hit.
"""
import glob
import json
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

INGEST_URL = os.getenv("INGEST_API_URL", "http://ingest-api:3000").rstrip("/")
SECRET = os.getenv("INGEST_SHARED_SECRET", "")
LOG_DIR = os.getenv("OPENCANARY_LOG_DIR", "/var/log/opencanary")
STATE_DIR = os.getenv("STATE_DIR", "/state")
READ_FROM_END = os.getenv("READ_FROM_END", "1") == "1"

# Heartbeat sent for each node (node_id → metadata)
NODE_SENSORS: dict[str, dict] = {
    "fake-dc":         {"name": "Deception: DC (10.0.1.2)",         "ip": "10.0.1.2",  "ports": [22, 80],         "protocol": "deception"},
    "fake-intranet":   {"name": "Deception: Intranet (10.0.1.5)",   "ip": "10.0.1.5",  "ports": [22, 80],         "protocol": "deception"},
    "fake-db":         {"name": "Deception: DB Primary (10.0.1.10)", "ip": "10.0.1.10", "ports": [22, 3306],       "protocol": "deception"},
    "fake-db-replica": {"name": "Deception: DB Replica (10.0.1.11)", "ip": "10.0.1.11", "ports": [3306],           "protocol": "deception"},
    "fake-cache":      {"name": "Deception: Cache (10.0.1.20)",      "ip": "10.0.1.20", "ports": [22, 80],         "protocol": "deception"},
}

# OpenCanary logtype → protocol name
LOGTYPE_PROTOCOL: dict[int, str] = {
    2000: "ftp",
    3000: "git",
    4000: "http",
    4002: "https",
    5000: "ssh",
    5002: "ssh-tunnel",
    6001: "telnet",
    6002: "http-proxy",
    8001: "mysql",
    9001: "mssql",
    10001: "smb",
    11001: "vnc",
}


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _post_json(url: str, payload: dict) -> int:
    req = Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "X-Ingest-Token": SECRET},
        method="POST",
    )
    with urlopen(req, timeout=5) as resp:
        return resp.status


# ---------------------------------------------------------------------------
# Heartbeats — one per node, every 30 s
# ---------------------------------------------------------------------------

def _send_heartbeat(node_key: str, meta: dict) -> None:
    payload = {
        "sensorId": f"opencanary-{node_key}",
        "name": meta["name"],
        "clientSlug": "",
        "clientName": "",
        "protocol": meta["protocol"],
        "ip": meta["ip"],
        "version": "opencanary",
        "ports": meta["ports"],
        "probePorts": meta["ports"],
        "host": f"opencanary-{node_key}",
    }
    try:
        _post_json(f"{INGEST_URL}/sensors/heartbeat", payload)
        print(f"[opencanary-shipper] heartbeat ok sensor=opencanary-{node_key}", flush=True)
    except Exception as exc:
        print(f"[opencanary-shipper] heartbeat error ({node_key}): {exc}", flush=True)


def _heartbeat_loop() -> None:
    while True:
        for node_key, meta in NODE_SENSORS.items():
            _send_heartbeat(node_key, meta)
        time.sleep(30)


# ---------------------------------------------------------------------------
# Offset persistence (one file per log source)
# ---------------------------------------------------------------------------

def _offset_path(log_path: str) -> str:
    name = os.path.splitext(os.path.basename(log_path))[0]
    os.makedirs(STATE_DIR, exist_ok=True)
    return os.path.join(STATE_DIR, f"{name}.offset")


def _load_offset(log_path: str) -> int:
    try:
        with open(_offset_path(log_path), "r") as fh:
            return int(fh.read().strip() or "0")
    except Exception:
        return 0


def _save_offset(log_path: str, value: int) -> None:
    with open(_offset_path(log_path), "w") as fh:
        fh.write(str(value))


# ---------------------------------------------------------------------------
# Event parsing
# ---------------------------------------------------------------------------

def _parse_timestamp(raw: dict) -> str:
    for key in ("utc_time", "local_time"):
        val = raw.get(key)
        if isinstance(val, str) and val:
            try:
                dt = datetime.strptime(val, "%Y-%m-%d %H:%M:%S.%f")
            except ValueError:
                try:
                    dt = datetime.strptime(val, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    continue
            return dt.replace(tzinfo=timezone.utc).isoformat()
    return datetime.now(timezone.utc).isoformat()


def _to_event(raw: dict) -> dict | None:
    logtype = raw.get("logtype")
    protocol = LOGTYPE_PROTOCOL.get(logtype) if isinstance(logtype, int) else None
    if not protocol:
        return None

    src_ip = str(raw.get("src_host") or "").strip()
    if not src_ip:
        return None

    src_port_raw = raw.get("src_port")
    src_port = int(src_port_raw) if src_port_raw is not None else None

    dst_port_raw = raw.get("dst_port")
    if dst_port_raw is None:
        return None
    dst_port = int(dst_port_raw)

    logdata = raw.get("logdata") or {}
    username = logdata.get("USERNAME") or logdata.get("username") or None
    password = logdata.get("PASSWORD") or logdata.get("password") or None
    if username:
        username = str(username)
    if password:
        password = str(password)

    event_type = "auth" if (username or password) else "connect"

    event_id_source = json.dumps(raw, sort_keys=True, default=str)
    event_id = str(uuid.uuid5(uuid.NAMESPACE_URL, event_id_source))

    return {
        "eventId": event_id,
        "sensorId": str(raw.get("node_id") or "opencanary"),
        "protocol": protocol,
        "srcIp": src_ip,
        "srcPort": src_port,
        "dstPort": dst_port,
        "eventType": event_type,
        "username": username,
        "password": password,
        "data": {
            "source": "opencanary",
            "node_id": raw.get("node_id"),
            "logtype": logtype,
            "logdata": logdata,
            "dst_host": raw.get("dst_host"),
        },
        "timestamp": _parse_timestamp(raw),
    }


# ---------------------------------------------------------------------------
# Tail loop for a single log file
# ---------------------------------------------------------------------------

def _tail_file(log_path: str) -> None:
    offset = _load_offset(log_path)
    started = False
    name = os.path.basename(log_path)

    while True:
        try:
            if not os.path.exists(log_path):
                time.sleep(2)
                continue

            size = os.path.getsize(log_path)

            if not started:
                started = True
                if offset == 0 and READ_FROM_END:
                    offset = size
                    _save_offset(log_path, offset)
                    print(f"[opencanary-shipper] {name}: starting from end (offset={offset})", flush=True)
                else:
                    print(f"[opencanary-shipper] {name}: resuming at offset={offset}", flush=True)

            if size < offset:
                offset = 0
                _save_offset(log_path, offset)

            with open(log_path, "r", encoding="utf-8") as fh:
                fh.seek(offset)
                while True:
                    line = fh.readline()
                    if not line:
                        offset = fh.tell()
                        _save_offset(log_path, offset)
                        time.sleep(1)
                        break

                    offset = fh.tell()
                    _save_offset(log_path, offset)

                    line = line.strip()
                    if not line:
                        continue

                    try:
                        raw = json.loads(line)
                    except Exception:
                        continue

                    event = _to_event(raw)
                    if not event:
                        continue

                    try:
                        status = _post_json(f"{INGEST_URL}/ingest/protocol/event", event)
                        if status in (200, 201):
                            print(
                                f"[opencanary-shipper] {name}: shipped"
                                f" protocol={event['protocol']}"
                                f" src={event['srcIp']}:{event.get('srcPort') or '-'}"
                                f" dst={event['dstPort']}"
                                f" type={event['eventType']}",
                                flush=True,
                            )
                    except Exception as exc:
                        print(f"[opencanary-shipper] {name}: ship error: {exc}", flush=True)

        except Exception as exc:
            print(f"[opencanary-shipper] {name}: tail error: {exc}", flush=True)
            time.sleep(2)


# ---------------------------------------------------------------------------
# Directory watcher — spawns a thread per log file it discovers
# ---------------------------------------------------------------------------

def _watch_dir() -> None:
    known: set[str] = set()
    print(f"[opencanary-shipper] watching {LOG_DIR} for *.json files", flush=True)

    while True:
        try:
            found = set(glob.glob(os.path.join(LOG_DIR, "*.json")))
            new = found - known
            for path in sorted(new):
                print(f"[opencanary-shipper] discovered {os.path.basename(path)}", flush=True)
                t = threading.Thread(target=_tail_file, args=(path,), daemon=True)
                t.start()
            known |= new
        except Exception as exc:
            print(f"[opencanary-shipper] watch error: {exc}", flush=True)

        time.sleep(5)


if __name__ == "__main__":
    threading.Thread(target=_heartbeat_loop, daemon=True).start()
    _watch_dir()
