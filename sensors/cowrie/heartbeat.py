#!/usr/bin/env python3
"""
Generic sensor beacon — sends heartbeats to the ingest-api every 30 seconds.
Also polls for sensor config changes every 60s and writes new cowrie.cfg +
a reload signal to the shared /signal volume when config changes.
"""
import json
import os
import socket
import threading
import time
from urllib.request import Request, urlopen

INGEST_URL  = os.getenv("INGEST_API_URL",       "http://ingest-api:3000")
SECRET      = os.getenv("INGEST_SHARED_SECRET",  "")
SENSOR_ID   = os.getenv("SENSOR_ID",             f"sensor-{socket.gethostname()}")
SENSOR_NAME = os.getenv("SENSOR_NAME",           "SSH Honeypot (Cowrie)")
CLIENT_SLUG = os.getenv("CLIENT_SLUG",           "")
CLIENT_NAME = os.getenv("CLIENT_NAME",           "")
SENSOR_IP   = os.getenv("SENSOR_IP",             "")
PROTOCOL    = os.getenv("SENSOR_PROTOCOL",       "ssh")
VERSION     = os.getenv("SENSOR_VERSION",        "cowrie")
_ports_raw  = os.getenv("SENSOR_PORTS",          "22")
PORTS       = [int(p) for p in _ports_raw.split() if p.strip().isdigit()]
_probe_raw  = os.getenv("SENSOR_PROBE_PORTS",    "")
PROBE_PORTS = [int(p) for p in _probe_raw.split() if p.strip().isdigit()]
HOST        = os.getenv("SENSOR_HOST",           "")
SIGNAL_DIR  = os.getenv("SIGNAL_DIR",            "/signal")

CONFIG_POLL_INTERVAL = 10  # seconds between config checks


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


def _post(url: str, payload: dict) -> None:
    data = json.dumps(payload).encode()
    req = Request(url, data=data,
                  headers={"Content-Type": "application/json", "X-Ingest-Token": SECRET},
                  method="POST")
    urlopen(req, timeout=5)


def send(ip: str) -> None:
    payload = {
        "sensorId":   SENSOR_ID,
        "name":       SENSOR_NAME,
        "clientSlug": CLIENT_SLUG,
        "clientName": CLIENT_NAME,
        "protocol":   PROTOCOL,
        "ip":         ip,
        "version":    VERSION,
        "ports":      PORTS,
        "probePorts": PROBE_PORTS,
        "host":       HOST,
    }
    try:
        _post(f"{INGEST_URL}/sensors/heartbeat", payload)
        print(f"[beacon] heartbeat ok  sensor={SENSOR_ID}  protocol={PROTOCOL}  ip={ip or '-'}", flush=True)
    except Exception as exc:
        print(f"[beacon] heartbeat error: {exc}", flush=True)


# ---------------------------------------------------------------------------
# Config management
# ---------------------------------------------------------------------------

def _generate_cowrie_cfg(config: dict) -> str:
    h          = config.get("hostname",               "web-prod-01")
    i_timeout  = config.get("interactive_timeout",    300)
    a_timeout  = config.get("authentication_timeout", 120)
    kver       = config.get("kernel_version",         "5.15.0-91-generic")
    kbuild     = config.get("kernel_build_string",    "#101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023")
    hwplat     = config.get("hardware_platform",      "x86_64")
    ssh_ver    = config.get("ssh_version",            "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6")

    return f"""[honeypot]
hostname = {h}
auth_class = UserDB
log_path = var/log/cowrie
download_path = var/lib/cowrie/downloads
share_path = share/cowrie
state_path = var/lib/cowrie
etc_path = etc
contents_path = honeyfs
txtcmds_path = txtcmds
ttylog = true
ttylog_path = var/lib/cowrie/tty
interactive_timeout = {i_timeout}
authentication_timeout = {a_timeout}

[shell]
kernel_version = {kver}
kernel_build_string = {kbuild}
hardware_platform = {hwplat}
operating_system = GNU/Linux

[ssh]
enabled = true
listen_endpoints = tcp:2222:interface=0.0.0.0
version = {ssh_ver}
pub_key_auth = true
auth_none_enabled = false

[output_jsonlog]
enabled = true
logfile = var/log/cowrie/cowrie.json
epoch_timestamp = false
"""


def _fetch_config() -> tuple[dict, str] | None:
    """Return (config_dict, config_hash) or None on error."""
    try:
        url = f"{INGEST_URL}/sensors/{SENSOR_ID}/config"
        req = Request(url, headers={"X-Ingest-Token": SECRET})
        with urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
        return data.get("config", {}), data.get("configHash", "")
    except Exception as exc:
        print(f"[beacon] config fetch error: {exc}", flush=True)
        return None


def _read_current_hash() -> str:
    path = os.path.join(SIGNAL_DIR, "cowrie.hash")
    try:
        with open(path) as f:
            return f.read().strip()
    except Exception:
        return ""


def _write_current_hash(h: str) -> None:
    os.makedirs(SIGNAL_DIR, exist_ok=True)
    path = os.path.join(SIGNAL_DIR, "cowrie.hash")
    with open(path, "w") as f:
        f.write(h)


def _generate_userdb(config: dict) -> str:
    usernames = config.get("usernames", ["root", "ubuntu", "admin"])
    passwords = config.get("passwords", ["HoneyTrap2026!"])
    lines = ["# Generated by cowrie-beacon — do not edit manually"]
    for username in usernames:
        for password in passwords:
            lines.append(f"{username}:x:{password}")
    return "\n".join(lines) + "\n"


def _apply_config(config: dict, hash_val: str) -> None:
    """Write new cowrie.cfg + userdb.txt to signal dir and drop the reload flag."""
    os.makedirs(SIGNAL_DIR, exist_ok=True)
    cfg_path    = os.path.join(SIGNAL_DIR, "cowrie.cfg")
    udb_path    = os.path.join(SIGNAL_DIR, "userdb.txt")
    flag_path   = os.path.join(SIGNAL_DIR, "cowrie-reload")

    with open(cfg_path, "w") as f:
        f.write(_generate_cowrie_cfg(config))
    with open(udb_path, "w") as f:
        f.write(_generate_userdb(config))
    # Write reload flag AFTER files — entrypoint checks this last
    with open(flag_path, "w") as f:
        f.write("")

    _write_current_hash(hash_val)
    print(f"[beacon] config+userdb updated (hash={hash_val}) — cowrie will restart", flush=True)


def _config_loop() -> None:
    # Wait a bit on startup so ingest-api is fully ready
    time.sleep(5)
    while True:
        result = _fetch_config()
        if result is not None:
            config, remote_hash = result
            local_hash = _read_current_hash()
            if remote_hash and remote_hash != local_hash:
                _apply_config(config, remote_hash)
        time.sleep(CONFIG_POLL_INTERVAL)


# ---------------------------------------------------------------------------

if __name__ == "__main__":
    ip = _detect_ip()
    print(f"[beacon] starting  sensor={SENSOR_ID}  protocol={PROTOCOL}  ip={ip or 'unknown'}", flush=True)

    threading.Thread(target=_config_loop, daemon=True).start()

    while True:
        send(ip)
        time.sleep(30)
