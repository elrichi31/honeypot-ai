#!/usr/bin/env python3
"""Control-only beacon for web-honeypot — status.get via the shared control
agent. app.py already sends its own heartbeat; this process does not."""
import os
import socket
import time

from control_agent import ControlAgent

INGEST_URL = os.getenv("INGEST_API_URL", "http://ingest-api:3000")
CONTROL_SECRET = os.getenv("SENSOR_CONTROL_SECRET", "")
SENSOR_ID = os.getenv("SENSOR_ID", f"web-{socket.gethostname()}")
_ports_raw = os.getenv("SENSOR_PORTS", "8080")
PORTS = [int(p) for p in _ports_raw.split() if p.strip().isdigit()]

AGENT_VERSION = "web-honeypot-beacon/1.0"
START_TIME = time.time()

control_agent = ControlAgent(
    ingest_url=INGEST_URL, sensor_id=SENSOR_ID, secret=CONTROL_SECRET,
    agent_version=AGENT_VERSION,
)


@control_agent.action("status.get")
def _handle_status_get(report_running) -> dict:
    return {
        "agentVersion": AGENT_VERSION,
        "uptimeSeconds": int(time.time() - START_TIME),
        "pid": os.getpid(),
        "ports": PORTS,
        "configHash": None,
    }


if __name__ == "__main__":
    print(f"[web-beacon] starting  sensor={SENSOR_ID}", flush=True)
    control_agent.start()
    while True:
        time.sleep(3600)
