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
# Client this deception network belongs to. The whole 5-node unit is assigned to
# one client; we suffix each node's sensorId with the (already unique, URL-safe)
# slug so multiple clients' deception networks don't collide in the sensors table.
CLIENT_SLUG = os.getenv("CLIENT_SLUG", "").strip()
CLIENT_NAME = os.getenv("CLIENT_NAME", "").strip()

# Heartbeat sent for each node (node_key → metadata)
NODE_SENSORS: dict[str, dict] = {
    "fake-dc":         {"name": "Deception: DC (10.0.1.2)",         "ip": "10.0.1.2",  "ports": [22, 80],         "protocol": "deception"},
    "fake-intranet":   {"name": "Deception: Intranet (10.0.1.5)",   "ip": "10.0.1.5",  "ports": [22, 80],         "protocol": "deception"},
    "fake-db":         {"name": "Deception: DB Primary (10.0.1.10)", "ip": "10.0.1.10", "ports": [22, 3306],       "protocol": "deception"},
    "fake-db-replica": {"name": "Deception: DB Replica (10.0.1.11)", "ip": "10.0.1.11", "ports": [3306],           "protocol": "deception"},
    "fake-cache":      {"name": "Deception: Cache (10.0.1.20)",      "ip": "10.0.1.20", "ports": [22, 80],         "protocol": "deception"},
}


def _sensor_id(node_key: str) -> str:
    """Per-client unique sensorId for a node. Falls back to the bare id when the
    deception network isn't assigned to a client."""
    base = f"opencanary-{node_key}"
    return f"{base}-{CLIENT_SLUG}" if CLIENT_SLUG else base


def _node_key_from_node_id(node_id: str | None) -> str | None:
    """OpenCanary's device.node_id is 'opencanary-<node_key>' (e.g.
    opencanary-fake-cache). Strip the prefix to recover the node_key so event
    sensorIds match the heartbeat sensorIds."""
    if not node_id:
        return None
    return node_id[len("opencanary-"):] if node_id.startswith("opencanary-") else node_id

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

# Canonical service port per protocol. OpenCanary's dst_port in the event JSON is
# unreliable for some modules (e.g. the HTTP module reports dst_port=22 even
# though it served on :80), which surfaced as nonsense like "HTTP :22" in the UI.
# When the protocol has a well-known port, prefer it over the raw dst_port so the
# reported service/port pair is always coherent.
PROTOCOL_PORT: dict[str, int] = {
    "ftp": 21,
    "git": 9418,
    "http": 80,
    "https": 443,
    "ssh": 22,
    "ssh-tunnel": 22,
    "telnet": 23,
    "http-proxy": 8080,
    "mysql": 3306,
    "mssql": 1433,
    "smb": 445,
    "vnc": 5900,
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
    sensor_id = _sensor_id(node_key)
    payload = {
        "sensorId": sensor_id,
        "name": meta["name"],
        "clientSlug": CLIENT_SLUG,
        "clientName": CLIENT_NAME,
        "protocol": meta["protocol"],
        "ip": meta["ip"],
        "version": "opencanary",
        "ports": meta["ports"],
        "probePorts": meta["ports"],
        "host": f"opencanary-{node_key}",
    }
    try:
        _post_json(f"{INGEST_URL}/sensors/heartbeat", payload)
        print(f"[opencanary-shipper] heartbeat ok sensor={sensor_id}", flush=True)
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

    # Prefer the protocol's canonical port: OpenCanary's raw dst_port is wrong for
    # some modules (HTTP reports 22), which would otherwise show as e.g. "HTTP :22".
    # Fall back to the raw dst_port only when the protocol has no well-known port.
    dst_port_raw = raw.get("dst_port")
    dst_port = PROTOCOL_PORT.get(protocol)
    if dst_port is None:
        if dst_port_raw is None or int(dst_port_raw) < 0:
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

    # The event's sensorId must match the per-client heartbeat sensorId so the
    # dashboard can scope events by client (sensor_id IN client's sensors). Derive
    # it from the OpenCanary node_id rather than using node_id raw. We also set
    # data.node_id to this same per-client sensorId so the deception views that
    # GROUP BY data->>'node_id' map cleanly to the sensors row (sensors.name gives
    # the human label). data.node_raw keeps the original OpenCanary node for ref.
    node_key = _node_key_from_node_id(raw.get("node_id"))
    sensor_id = _sensor_id(node_key) if node_key else "opencanary"

    return {
        "eventId": event_id,
        "sensorId": sensor_id,
        "protocol": protocol,
        "srcIp": src_ip,
        "srcPort": src_port,
        "dstPort": dst_port,
        "eventType": event_type,
        "username": username,
        "password": password,
        "data": {
            "source": "opencanary",
            "node_id": sensor_id,
            "node_raw": raw.get("node_id"),
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

                    pending_offset = fh.tell()

                    line = line.strip()
                    if not line:
                        offset = pending_offset
                        _save_offset(log_path, offset)
                        continue

                    try:
                        raw = json.loads(line)
                    except Exception:
                        offset = pending_offset
                        _save_offset(log_path, offset)
                        continue

                    event = _to_event(raw)
                    if not event:
                        offset = pending_offset
                        _save_offset(log_path, offset)
                        continue

                    try:
                        status = _post_json(f"{INGEST_URL}/ingest/protocol/event", event)
                        if status in (200, 201):
                            offset = pending_offset
                            _save_offset(log_path, offset)
                            print(
                                f"[opencanary-shipper] {name}: shipped"
                                f" protocol={event['protocol']}"
                                f" src={event['srcIp']}:{event.get('srcPort') or '-'}"
                                f" dst={event['dstPort']}"
                                f" type={event['eventType']}",
                                flush=True,
                            )
                        else:
                            print(f"[opencanary-shipper] {name}: ingest returned {status}, will retry", flush=True)
                            time.sleep(2)
                            break
                    except Exception as exc:
                        print(f"[opencanary-shipper] {name}: ship error: {exc}, will retry", flush=True)
                        time.sleep(2)
                        break

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
