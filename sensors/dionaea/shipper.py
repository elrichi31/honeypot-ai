#!/usr/bin/env python3
import hashlib
import json
import os
import shutil
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
CLIENT_SLUG = os.getenv("CLIENT_SLUG", "")
CLIENT_NAME = os.getenv("CLIENT_NAME", "")
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
    81: "http-alt",
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
        "clientSlug": CLIENT_SLUG,
        "clientName": CLIENT_NAME,
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

    # Dionaea's official log_json handler emits flattened connection fields:
    # src_ip/src_port/dst_ip/dst_port plus a lightweight connection object
    # containing protocol/transport/type.
    dst_port = _to_int(raw.get("dst_port"))
    src_port = _to_int(raw.get("src_port"))
    src_ip = str(raw.get("src_ip") or "").strip()
    dst_ip = str(raw.get("dst_ip") or "").strip()
    src_hostname = str(raw.get("src_hostname") or "").strip()

    # Keep backward compatibility with the older nested format we initially
    # assumed for the integration.
    if dst_port is None or not src_ip:
        local = connection.get("local") or {}
        remote = connection.get("remote") or {}
        dst_port = _to_int(local.get("port"))
        src_port = _to_int(remote.get("port"))
        src_ip = str(remote.get("address") or "").strip()
        dst_ip = str(local.get("address") or "").strip()
        src_hostname = str(remote.get("hostname") or "").strip()

    if dst_port is None or not src_ip:
        return None

    protocol_name = PORT_PROTOCOLS.get(dst_port)
    if not protocol_name:
        raw_proto = str(connection.get("protocol") or SENSOR_PROTOCOL or "dionaea").strip().lower()
        protocol_name = {
            "ftpd": "ftp",
            "epmapper": "rpc",
            "smbd": "smb",
            "mssqld": "mssql",
            "mysqld": "mysql",
            "mqttd": "mqtt",
            "pptpd": "pptp",
            "httpd": "http-alt",
            "tftpd": "tftp",
            "mirror": "wins",
        }.get(raw_proto, raw_proto)

    return {
        "srcIp": src_ip,
        "srcPort": src_port,
        "dstPort": dst_port,
        "protocol": protocol_name,
        "connectionType": str(connection.get("type") or "").strip().lower(),
        "transport": str(connection.get("transport") or "").strip().lower(),
        "localAddress": dst_ip,
        "remoteHostname": src_hostname,
    }


def _event_base(raw):
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
        "sensorId": SENSOR_ID,
        "protocol": conn["protocol"],
        "srcIp": conn["srcIp"],
        "srcPort": conn["srcPort"],
        "dstPort": conn["dstPort"],
        "timestamp": timestamp,
        "data": data,
    }


def _to_protocol_events(raw):
    base = _event_base(raw)
    if not base:
        return []

    events = [{
        "eventId": base["eventId"],
        "sensorId": base["sensorId"],
        "protocol": base["protocol"],
        "srcIp": base["srcIp"],
        "srcPort": base["srcPort"],
        "dstPort": base["dstPort"],
        "eventType": "connect",
        "username": None,
        "password": None,
        "data": base["data"],
        "timestamp": base["timestamp"],
    }]

    credentials = raw.get("credentials")
    if isinstance(credentials, list):
        for idx, cred in enumerate(credentials):
            if not isinstance(cred, dict):
                continue
            events.append({
                "eventId": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{base['eventId']}:auth:{idx}")),
                "sensorId": base["sensorId"],
                "protocol": base["protocol"],
                "srcIp": base["srcIp"],
                "srcPort": base["srcPort"],
                "dstPort": base["dstPort"],
                "eventType": "auth",
                "username": None if cred.get("username") is None else str(cred.get("username")),
                "password": None if cred.get("password") is None else str(cred.get("password")),
                "data": {
                    **base["data"],
                    "credentialIndex": idx,
                },
                "timestamp": base["timestamp"],
            })

    ftp_commands = ((raw.get("ftp") or {}).get("commands")) if isinstance(raw.get("ftp"), dict) else None
    if isinstance(ftp_commands, list):
        for idx, cmd in enumerate(ftp_commands):
            if not isinstance(cmd, dict):
                continue
            command = str(cmd.get("command") or "").strip()
            arguments = cmd.get("arguments")
            if not command:
                continue
            events.append({
                "eventId": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{base['eventId']}:command:{idx}")),
                "sensorId": base["sensorId"],
                "protocol": base["protocol"],
                "srcIp": base["srcIp"],
                "srcPort": base["srcPort"],
                "dstPort": base["dstPort"],
                "eventType": "command",
                "username": None,
                "password": None,
                "data": {
                    **base["data"],
                    "commandIndex": idx,
                    "command": command,
                    "arguments": None if arguments is None else str(arguments),
                },
                "timestamp": base["timestamp"],
            })

    return events


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

                    events = _to_protocol_events(raw)
                    if not events:
                        continue

                    for event in events:
                        _ship_event(event)
        except Exception as exc:
            print(f"[dionaea-shipper] tail loop error: {exc}", flush=True)
            time.sleep(2)


BINARIES_DIR = "/opt/dionaea/var/lib/dionaea/binaries"
UPLOAD_WATCH_DIRS = {
    "ftp":  "/opt/dionaea/var/lib/dionaea/ftp/root",
    "tftp": "/opt/dionaea/var/lib/dionaea/tftp/root",
}


def _md5_file(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _collect_files(directory):
    result = []
    try:
        for root, _, files in os.walk(directory):
            for name in files:
                result.append(os.path.join(root, name))
    except Exception:
        pass
    return result


def _unify_upload(src_path, source_type, source_name):
    try:
        if os.path.getsize(src_path) == 0:
            return
        md5 = _md5_file(src_path)
        dest = os.path.join(BINARIES_DIR, md5)
        meta = os.path.join(BINARIES_DIR, md5 + ".meta.json")
        os.makedirs(BINARIES_DIR, exist_ok=True)
        if not os.path.exists(dest):
            shutil.copy2(src_path, dest)
        if not os.path.exists(meta):
            with open(meta, "w") as f:
                json.dump({
                    "sourceUrl": f"{source_type}://upload/{source_name}",
                    "sourceName": source_name,
                    "sourceType": source_type,
                }, f)
        print(f"[dionaea-shipper] unified {source_type} upload → binaries/{md5} ({source_name})", flush=True)
    except Exception as exc:
        print(f"[dionaea-shipper] unify error {src_path}: {exc}", flush=True)


def _upload_watcher_loop():
    seen = set()
    # Seed with already-existing files so we don't re-process old uploads
    for source_type, directory in UPLOAD_WATCH_DIRS.items():
        for path in _collect_files(directory):
            seen.add(path)

    print(f"[dionaea-shipper] upload watcher started, watching {list(UPLOAD_WATCH_DIRS.keys())}", flush=True)
    while True:
        time.sleep(5)
        for source_type, directory in UPLOAD_WATCH_DIRS.items():
            for path in _collect_files(directory):
                if path in seen:
                    continue
                seen.add(path)
                source_name = os.path.basename(path)
                _unify_upload(path, source_type, source_name)


if __name__ == "__main__":
    threading.Thread(target=_heartbeat_loop, daemon=True).start()
    threading.Thread(target=_upload_watcher_loop, daemon=True).start()
    _tail_loop()
