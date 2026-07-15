#!/usr/bin/env python3
"""Control-only beacon for web-honeypot — status.get + config.apply via the
shared control agent. app.py already sends its own heartbeat; this process
does not."""
import json
import os
import socket
import threading
import time
from urllib.request import Request, urlopen

from control_agent import ControlAgent

INGEST_URL = os.getenv("INGEST_API_URL", "http://ingest-api:3000")
CONTROL_SECRET = os.getenv("SENSOR_CONTROL_SECRET", "")
SENSOR_ID = os.getenv("SENSOR_ID", f"web-{socket.gethostname()}")
_ports_raw = os.getenv("SENSOR_PORTS", "8080")
PORTS = [int(p) for p in _ports_raw.split() if p.strip().isdigit()]
SIGNAL_DIR = os.getenv("SIGNAL_DIR", "/signal")

AGENT_VERSION = "web-honeypot-beacon/1.0"
START_TIME = time.time()

control_agent = ControlAgent(
    ingest_url=INGEST_URL, sensor_id=SENSOR_ID, secret=CONTROL_SECRET,
    agent_version=AGENT_VERSION,
)


# ---------------------------------------------------------------------------
# Config management — same shape as sensors/cowrie/heartbeat.py, minus the
# 10s direct-poll loop: config.apply delivery already has a generic HTTP
# fallback (control_agent.py's _poll_forever, Rebanada 6), so a second,
# sensor-specific poller would just be redundant belt-and-suspenders here.
# ---------------------------------------------------------------------------

def _fetch_config() -> tuple[dict, str] | None:
    """Return (config_dict, config_hash) or None on error. No auth header —
    GET /sensors/:id/config doesn't require ensureIngestToken."""
    try:
        url = f"{INGEST_URL}/sensors/{SENSOR_ID}/config"
        with urlopen(Request(url), timeout=8) as resp:
            data = json.loads(resp.read())
        return data.get("config", {}), data.get("configHash", "")
    except Exception as exc:
        print(f"[web-beacon] config fetch error: {exc}", flush=True)
        return None


def _read_current_hash() -> str:
    try:
        with open(os.path.join(SIGNAL_DIR, "web.hash")) as f:
            return f.read().strip()
    except Exception:
        return ""


def _write_current_hash(h: str) -> None:
    os.makedirs(SIGNAL_DIR, exist_ok=True)
    with open(os.path.join(SIGNAL_DIR, "web.hash"), "w") as f:
        f.write(h)


def _atomic_write(path: str, content: str) -> None:
    tmp_path = f"{path}.tmp{os.getpid()}.{threading.get_ident()}"
    with open(tmp_path, "w") as f:
        f.write(content)
    os.replace(tmp_path, path)


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
    # No command.result on the happy path — app.py's next heartbeat echoing
    # this hash back is what confirms success (sensor-config.service.ts
    # confirmApplied()), same contract as Cowrie's config.apply handler.
    report_running()
    result = _fetch_config()
    if result is None:
        raise RuntimeError("could not fetch pending config from ingest-api")
    config, remote_hash = result
    os.makedirs(SIGNAL_DIR, exist_ok=True)
    _atomic_write(os.path.join(SIGNAL_DIR, "web-config.json"), json.dumps(config))
    _write_current_hash(remote_hash)
    print(f"[web-beacon] config updated (hash={remote_hash})", flush=True)
    return None


if __name__ == "__main__":
    print(f"[web-beacon] starting  sensor={SENSOR_ID}", flush=True)
    control_agent.start()
    while True:
        time.sleep(3600)
