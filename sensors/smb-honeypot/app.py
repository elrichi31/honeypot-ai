#!/usr/bin/env python3
"""SMB Honeypot — full SMBv1/v2 server via Impacket.

Captures NTLM auth (username, domain, OS, NT/LM hashes), share access,
and file drops using Impacket's official setAuthCallback API.
"""

import hashlib
import json
import logging
import os
import shutil
import socket
import threading
import time
import traceback
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

from impacket.smbserver import SimpleSMBServer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("smb-honeypot")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
INGEST_API_URL       = os.getenv("INGEST_API_URL", "http://ingest-api:3000")
INGEST_SHARED_SECRET = os.getenv("INGEST_SHARED_SECRET", "")
PORT                 = int(os.getenv("PORT", "445"))
DST_PORT             = int(os.getenv("DST_PORT", str(PORT)))
SENSOR_ID            = os.getenv("SENSOR_ID", f"smb-{socket.gethostname()}")
SENSOR_NAME          = os.getenv("SENSOR_NAME", "SMB Honeypot")
CLIENT_SLUG          = os.getenv("CLIENT_SLUG", "")
CLIENT_NAME          = os.getenv("CLIENT_NAME", "")
SENSOR_HOST          = os.getenv("SENSOR_HOST", socket.gethostname())
VERSION              = "1.0.0"

CAPTURE_DIR   = os.getenv("SMB_CAPTURE_DIR", "/captures")
SHARE_NAME    = os.getenv("SMB_SHARE_NAME", "ADMIN$")
SHARE_PATH    = os.getenv("SMB_SHARE_PATH", "/share")
SERVER_DOMAIN = os.getenv("SMB_SERVER_DOMAIN", "CORP")


# ---------------------------------------------------------------------------
# IP detection
# ---------------------------------------------------------------------------
def _detect_ip() -> str:
    ip = os.getenv("SENSOR_IP", "")
    if ip:
        return ip
    for url in ("http://ifconfig.me/ip", "http://api.ipify.org", "http://checkip.amazonaws.com"):
        try:
            return urlopen(url, timeout=4).read().decode().strip()
        except Exception:
            continue
    return ""


SENSOR_IP = _detect_ip()


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------
def _post(path: str, payload: dict):
    body = json.dumps(payload, default=str).encode()
    req = Request(
        f"{INGEST_API_URL}{path}",
        data=body,
        headers={"Content-Type": "application/json", "X-Ingest-Token": INGEST_SHARED_SECRET},
        method="POST",
    )
    try:
        urlopen(req, timeout=5)
    except Exception as exc:
        log.debug("ingest error: %s", exc)


def _send(event_type: str, src_ip: str, src_port: int | None,
          username: str | None = None, extra: dict | None = None):
    _post("/ingest/protocol/event", {
        "eventId":   str(uuid.uuid4()),
        "sensorId":  SENSOR_ID,
        "protocol":  "smb",
        "srcIp":     src_ip,
        "srcPort":   src_port,
        "dstPort":   DST_PORT,
        "eventType": event_type,
        "username":  username,
        "data":      extra or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    log.info("shipped event_type=%s src=%s user=%s", event_type, src_ip, username or "-")


def _send_heartbeat():
    _post("/sensors/heartbeat", {
        "sensorId":   SENSOR_ID,
        "name":       SENSOR_NAME,
        "clientSlug": CLIENT_SLUG,
        "clientName": CLIENT_NAME,
        "protocol":   "smb",
        "ip":         SENSOR_IP,
        "version":    VERSION,
        "ports":      [DST_PORT],
        "probePorts": [PORT],
        "host":       SENSOR_HOST,
    })


def _heartbeat_loop():
    while True:
        try:
            _send_heartbeat()
            log.info("heartbeat ok")
        except Exception as exc:
            log.warning("heartbeat error: %s", exc)
        time.sleep(30)


# ---------------------------------------------------------------------------
# File capture
# ---------------------------------------------------------------------------
def _capture_file(local_path: str, share: str, requested_path: str, src_ip: str) -> dict:
    os.makedirs(CAPTURE_DIR, exist_ok=True)
    try:
        size = os.path.getsize(local_path)
        if size == 0:
            return {}
        with open(local_path, "rb") as fh:
            data = fh.read()
        md5    = hashlib.md5(data).hexdigest()
        sha256 = hashlib.sha256(data).hexdigest()
        dest   = os.path.join(CAPTURE_DIR, sha256)
        if not os.path.exists(dest):
            shutil.copy2(local_path, dest)
        meta = dest + ".meta.json"
        if not os.path.exists(meta):
            with open(meta, "w") as fh:
                json.dump({
                    "srcIp": src_ip, "share": share,
                    "requestedPath": requested_path,
                    "md5": md5, "sha256": sha256, "size": size,
                    "capturedAt": datetime.now(timezone.utc).isoformat(),
                }, fh)
        log.info("captured file sha256=%s size=%d from %s", sha256[:16], size, src_ip)
        return {"sha256": sha256, "md5": md5, "fileSize": size}
    except Exception as exc:
        log.warning("capture error %s: %s", local_path, exc)
        return {}


# ---------------------------------------------------------------------------
# Decoy files
# ---------------------------------------------------------------------------
def _seed_decoy_files(path: str):
    decoys = {
        "desktop.ini":           b"[.ShellClassInfo]\r\nIconResource=C:\\Windows\\System32\\imageres.dll,-3\r\n",
        "Q4-Budget-2024.xlsx":   b"PK\x03\x04" + b"\x00" * 100,
        "IT-Passwords-TEMP.txt": b"# Temporary password list\r\nAdmin: Ch@ng3M3!\r\nBackup: B@ckup2024\r\n",
        "VPN-Config.ovpn":       b"client\r\ndev tun\r\nproto udp\r\nremote vpn.corp.internal 1194\r\n",
        "network-scan.bat":      b"@echo off\r\nnet view\r\nnltest /domain_trusts\r\n",
    }
    for name, content in decoys.items():
        fpath = os.path.join(path, name)
        if not os.path.exists(fpath):
            with open(fpath, "wb") as fh:
                fh.write(content)


# ---------------------------------------------------------------------------
# Auth callback — called by Impacket for every NTLM Type 3 message.
#
# Signature from Impacket source:
#   callback(connId, smbServer, spnegoData, username, domain,
#            password, ntHash, lmHash, authenticateMessageBlob)
#
# Return (errorCode, errorString):
#   (0xc000006d, 'STATUS_LOGON_FAILURE') = deny auth (honeypot behaviour)
# ---------------------------------------------------------------------------
def _auth_callback(smbServer, connData, domain_name, user_name, host_name):
    import sys
    try:
        src_ip   = connData.get("ClientIP", "unknown")
        src_port = connData.get("ClientPort")

        print(f"[smb-auth] user={user_name} domain={domain_name} host={host_name} src={src_ip}:{src_port}", flush=True, file=sys.stderr)
        log.info("auth user=%s domain=%s host=%s from %s:%s",
                 user_name, domain_name, host_name, src_ip, src_port)

        threading.Thread(
            target=_send,
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
        print(f"[smb-auth] callback error: {exc}", flush=True, file=sys.stderr)
        log.warning("auth callback error: %s", exc)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    os.makedirs(SHARE_PATH, exist_ok=True)
    os.makedirs(CAPTURE_DIR, exist_ok=True)
    _seed_decoy_files(SHARE_PATH)

    log.info("SMB honeypot starting — share=%s path=%s port=%d sensor=%s",
             SHARE_NAME, SHARE_PATH, PORT, SENSOR_ID)

    threading.Thread(target=_heartbeat_loop, daemon=True).start()

    try:
        server = SimpleSMBServer(listenAddress="0.0.0.0", listenPort=PORT)
        server.addShare(SHARE_NAME, SHARE_PATH, "File Share")
        server.setSMBChallenge("")          # static challenge — hashes reproducible
        server.setLogFile("/dev/null")      # suppress Impacket's own file log
        # Add a dummy credential so Impacket always runs NTLM verification
        # (without any credential entry it grants access without calling auth_callback)
        server.addCredential("__honeypot__", 0, "aad3b435b51404eeaad3b435b51404ee", "31d6cfe0d16ae931b73c59d7e0c089c0")

        # Register our auth interception callback
        server.setAuthCallback(_auth_callback)

        log.info("SMB honeypot ready on :%d share=\\\\localhost\\%s", PORT, SHARE_NAME)
        server.start()

    except Exception as exc:
        log.error("SMB server error: %s\n%s", exc, traceback.format_exc())
        raise


if __name__ == "__main__":
    main()
