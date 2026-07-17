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

from control_agent import ControlAgent

INGEST_URL  = os.getenv("INGEST_API_URL",       "http://ingest-api:3000")
SECRET      = os.getenv("INGEST_SHARED_SECRET",  "")
CONTROL_SECRET = os.getenv("SENSOR_CONTROL_SECRET", "")
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
SENSOR_LAYER = os.getenv("SENSOR_LAYER",         "external")
SIGNAL_DIR  = os.getenv("SIGNAL_DIR",            "/signal")

CONFIG_POLL_INTERVAL = 10  # seconds between config checks
AGENT_VERSION = "cowrie-beacon/1.0"
START_TIME = time.time()


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
    if SENSOR_LAYER == "internal":
        payload["layer"] = "internal"
        payload["realProtocol"] = PROTOCOL
    # Reported to confirm config.apply commands (Rebanada 5) — the server
    # only marks one 'succeeded' once a heartbeat echoes back the hash it
    # applied. Omitted (not null) when there's no local config yet, since the
    # server schema treats configHash as optional-but-a-string, not nullable.
    local_hash = _read_current_hash()
    if local_hash:
        payload["configHash"] = local_hash
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
    # Wildcard: accept any username and any password so real botnet
    # wordlists land a successful login and enter the post-auth shell.
    return "# Generated by cowrie-beacon — do not edit manually\n*:x:*\n"


def _atomic_write(path: str, content: str) -> None:
    # Write to a temp file in the same directory then os.replace — a crash or
    # kill mid-write can never leave entrypoint.py reading a truncated
    # cowrie.cfg/userdb.txt (os.replace is a single filesystem rename, not a
    # byte-by-byte copy). Same-directory temp file keeps the rename atomic
    # (no cross-filesystem move).
    # Include thread id: the 10s poller and the config.apply WS handler run in
    # separate threads of this same process, so pid alone would collide and one
    # os.replace could hit a temp file the other already moved (spurious apply
    # failure that counts toward auto-rollback).
    tmp_path = f"{path}.tmp{os.getpid()}.{threading.get_ident()}"
    with open(tmp_path, "w") as f:
        f.write(content)
    os.replace(tmp_path, path)


def _apply_config(config: dict, hash_val: str) -> None:
    """Write new cowrie.cfg + userdb.txt to signal dir and drop the reload flag."""
    os.makedirs(SIGNAL_DIR, exist_ok=True)
    cfg_path    = os.path.join(SIGNAL_DIR, "cowrie.cfg")
    udb_path    = os.path.join(SIGNAL_DIR, "userdb.txt")
    flag_path   = os.path.join(SIGNAL_DIR, "cowrie-reload")

    _atomic_write(cfg_path, _generate_cowrie_cfg(config))
    _atomic_write(udb_path, _generate_userdb(config))
    # Write reload flag AFTER files — entrypoint checks this last
    with open(flag_path, "w") as f:
        f.write("")

    _write_current_hash(hash_val)
    print(f"[beacon] config+userdb updated (hash={hash_val}) — cowrie will restart", flush=True)


def _config_loop() -> None:
    # Wait a bit on startup so ingest-api is fully ready
    time.sleep(5)
    while True:
        result = control_agent.fetch_config()
        if result is not None:
            config, remote_hash = result
            local_hash = _read_current_hash()
            if remote_hash and remote_hash != local_hash:
                _apply_config(config, remote_hash)
        time.sleep(CONFIG_POLL_INTERVAL)


# ---------------------------------------------------------------------------
# Control plane (Rebanada 4/5) — status.get (read-only) and config.apply. A
# WS outage never blocks heartbeat/config polling above: the agent runs its
# own thread and reconnect loop, entirely independent of the loops below.
# ---------------------------------------------------------------------------

control_agent = ControlAgent(
    ingest_url=INGEST_URL, sensor_id=SENSOR_ID, secret=CONTROL_SECRET, agent_version=AGENT_VERSION,
    ingest_token=SECRET,
)


@control_agent.action("status.get")
def _handle_status_get(report_running) -> dict:
    return {
        "agentVersion": AGENT_VERSION,
        "uptimeSeconds": int(time.time() - START_TIME),
        "pid": os.getpid(),
        "ports": PORTS,
        "configHash": _read_current_hash() or None,
    }


@control_agent.action("config.apply")
def _handle_config_apply(report_running):
    # No command.result on the happy path: the same write+reload work the
    # 10s poller already does, just triggered instantly instead of waiting up
    # to 10s. Whether cowrie actually comes back up healthy with the new
    # config is confirmed by the NEXT heartbeat's configHash matching — not
    # by this handler, which can't know that a restart it just triggered
    # will succeed. See sensor-config.service.ts confirmApplied().
    report_running()
    result = control_agent.fetch_config()
    if result is None:
        raise RuntimeError("could not fetch pending config from ingest-api")
    config, remote_hash = result
    _apply_config(config, remote_hash)
    return None


if __name__ == "__main__":
    ip = _detect_ip()
    print(f"[beacon] starting  sensor={SENSOR_ID}  protocol={PROTOCOL}  ip={ip or 'unknown'}", flush=True)

    threading.Thread(target=_config_loop, daemon=True).start()
    control_agent.start()

    while True:
        send(ip)
        time.sleep(30)
