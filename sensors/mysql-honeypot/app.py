#!/usr/bin/env python3
"""MySQL Honeypot — captures auth attempts using the MySQL 5.7 handshake protocol."""

import asyncio
import logging
import os
import time

from control_agent import ControlAgent
from persisted_config import write_override
from honeypot.config import CONFIG_HASH, INGEST_API_URL, INGEST_SHARED_SECRET, PORT, DST_PORT, SENSOR_ID, EVENT_LOG_PATH
from honeypot.protocol import handle
from honeypot.ingest import detect_ip, send_heartbeat

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("mysql-honeypot")

os.makedirs(os.path.dirname(EVENT_LOG_PATH), exist_ok=True)

SENSOR_IP = detect_ip()

AGENT_VERSION = "mysql-honeypot/1.0"
_START_TIME = time.time()

control_agent = ControlAgent(
    ingest_url=INGEST_API_URL, sensor_id=SENSOR_ID,
    secret=os.getenv("SENSOR_CONTROL_SECRET", ""), agent_version=AGENT_VERSION,
    ingest_token=INGEST_SHARED_SECRET,
    secret_file=os.getenv("SENSOR_CONTROL_SECRET_FILE", "/config/control-secret"),
)


@control_agent.action("status.get")
def _handle_status_get(report_running) -> dict:
    return {
        "agentVersion": AGENT_VERSION,
        "uptimeSeconds": int(time.time() - _START_TIME),
        "pid": os.getpid(),
        "ports": [PORT],
        "configHash": CONFIG_HASH,
    }


@control_agent.action("config.apply")
def _handle_config_apply(report_running):
    # No command.result on the happy path — restarting exits this process;
    # the fresh one's next heartbeat echoing the new configHash is what
    # confirms success (sensor-config.service.ts confirmApplied()).
    report_running()
    result = control_agent.fetch_config()
    if result is None:
        raise RuntimeError("could not fetch pending config from ingest-api")
    config, remote_hash = result
    write_override("/config/override.json", config, remote_hash)
    log.info("config written (hash=%s), restarting to apply", remote_hash)
    os._exit(1)


async def heartbeat():
    loop = asyncio.get_event_loop()
    while True:
        await loop.run_in_executor(None, send_heartbeat, SENSOR_IP)
        await asyncio.sleep(30)


async def main():
    server = await asyncio.start_server(handle, "0.0.0.0", PORT)
    log.info("MySQL honeypot on :%d (logging as :%d) sensor=%s", PORT, DST_PORT, SENSOR_ID)
    control_agent.start()
    async with server:
        await asyncio.gather(server.serve_forever(), heartbeat())


if __name__ == "__main__":
    asyncio.run(main())
