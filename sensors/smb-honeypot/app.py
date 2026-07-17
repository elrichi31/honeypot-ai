#!/usr/bin/env python3
"""SMB Honeypot — full SMB server via Impacket."""

import logging
import os
import threading
import time
import traceback

from impacket.smbserver import SimpleSMBServer

from control_agent import ControlAgent
from persisted_config import write_override
from honeypot.config import (
    CONFIG_HASH, INGEST_API_URL, INGEST_SHARED_SECRET, PORT, SENSOR_ID, SHARE_NAME, SHARE_PATH,
    SHARE_COMMENT, SERVER_NAME, SERVER_OS, SERVER_DOMAIN, CAPTURE_DIR, EVENT_LOG_PATH,
)
from honeypot.identity import seed_decoy_files
from honeypot.impacket_patches import patch_impacket_writes, patch_smb2_negotiate
from honeypot.ingest import detect_ip, send, send_heartbeat

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("smb-honeypot")

os.makedirs(os.path.dirname(EVENT_LOG_PATH), exist_ok=True)

SENSOR_IP = detect_ip()

AGENT_VERSION = "smb-honeypot/1.0"
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

# Generated once per process start — random per the Tarea 2.2 fix.
_SERVER_GUID = os.urandom(16)


def _apply_server_identity(server: SimpleSMBServer):
    cfg = getattr(server, "_SimpleSMBServer__smbConfig", None)
    if cfg is None:
        return
    cfg.set("global", "server_name", SERVER_NAME)
    cfg.set("global", "server_os", SERVER_OS)
    cfg.set("global", "server_domain", SERVER_DOMAIN)
    for attr in ("_SimpleSMBServer__server", "_SimpleSMBServer__srvsServer", "_SimpleSMBServer__wkstServer"):
        obj = getattr(server, attr, None)
        if obj is None:
            continue
        try:
            obj.setServerConfig(cfg)
            obj.processConfigFile()
        except Exception as exc:
            log.debug("could not apply SMB identity to %s: %s", attr, exc)


def _auth_callback(smbServer, connData, domain_name, user_name, host_name):
    try:
        src_ip   = connData.get("ClientIP", "unknown")
        src_port = connData.get("ClientPort")
        log.info("auth user=%s domain=%s host=%s from %s:%s",
                 user_name, domain_name, host_name, src_ip, src_port)
        threading.Thread(
            target=send,
            args=("auth", src_ip, src_port),
            kwargs={
                "username": user_name or None,
                "extra": {
                    "domain":    domain_name or None,
                    "hostName":  host_name or None,
                    "shareName": SHARE_NAME,
                },
            },
            daemon=True,
        ).start()
    except Exception as exc:
        log.warning("auth callback error: %s", exc)


def _heartbeat_loop():
    while True:
        try:
            ok, status, error = send_heartbeat(SENSOR_IP)
            if ok:
                log.info("heartbeat ok status=%s", status)
            else:
                log.warning("heartbeat failed %s", error or f"http_status={status}")
        except Exception as exc:
            log.warning("heartbeat error: %s", exc)
        time.sleep(30)


def main():
    os.makedirs(SHARE_PATH, exist_ok=True)
    os.makedirs(CAPTURE_DIR, exist_ok=True)
    seed_decoy_files(SHARE_PATH)
    patch_impacket_writes()
    patch_smb2_negotiate(_SERVER_GUID)

    log.info("SMB honeypot starting — share=%s path=%s port=%d sensor=%s",
             SHARE_NAME, SHARE_PATH, PORT, SENSOR_ID)

    threading.Thread(target=_heartbeat_loop, daemon=True).start()
    control_agent.start()

    try:
        server = SimpleSMBServer(listenAddress="0.0.0.0", listenPort=PORT)
        _apply_server_identity(server)
        server.addShare(SHARE_NAME, SHARE_PATH, SHARE_COMMENT)
        server.setSMB2Support(True)
        server.setSMBChallenge("")
        server.setLogFile("/dev/null")
        server.addCredential("__honeypot__", 0, "aad3b435b51404eeaad3b435b51404ee", "31d6cfe0d16ae931b73c59d7e0c089c0")
        server.setAuthCallback(_auth_callback)

        log.info(
            "SMB honeypot ready on :%d share=\\\\%s\\%s smb2=true os=%s domain=%s guid=%s",
            PORT, SERVER_NAME, SHARE_NAME, SERVER_OS, SERVER_DOMAIN, _SERVER_GUID.hex()[:8],
        )
        server.start()

    except Exception as exc:
        log.error("SMB server error: %s\n%s", exc, traceback.format_exc())
        raise


if __name__ == "__main__":
    main()
