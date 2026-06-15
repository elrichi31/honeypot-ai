#!/usr/bin/env python3
"""SMB Honeypot — full SMBv1/v2 server via Impacket.

Captures: NTLM auth (username, domain, workgroup, OS), share access,
file read/write attempts, and drops malware to disk for analysis.
"""

import hashlib
import json
import logging
import os
import shutil
import socket
import struct
import threading
import time
import traceback
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen

# ---------------------------------------------------------------------------
# Impacket imports — install via: pip install impacket
# ---------------------------------------------------------------------------
from impacket import smbserver
from impacket.smbserver import SimpleSMBServer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("smb-honeypot")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
INGEST_API_URL    = os.getenv("INGEST_API_URL", "http://ingest-api:3000")
INGEST_SHARED_SECRET = os.getenv("INGEST_SHARED_SECRET", "")
PORT              = int(os.getenv("PORT", "445"))
DST_PORT          = int(os.getenv("DST_PORT", str(PORT)))
SENSOR_ID         = os.getenv("SENSOR_ID", f"smb-{socket.gethostname()}")
SENSOR_NAME       = os.getenv("SENSOR_NAME", "SMB Honeypot")
CLIENT_SLUG       = os.getenv("CLIENT_SLUG", "")
CLIENT_NAME       = os.getenv("CLIENT_NAME", "")
SENSOR_HOST       = os.getenv("SENSOR_HOST", socket.gethostname())
VERSION           = "1.0.0"

# Where to store captured files (malware drops, uploads)
CAPTURE_DIR = os.getenv("SMB_CAPTURE_DIR", "/captures")
# The SMB share name exposed to attackers
SHARE_NAME  = os.getenv("SMB_SHARE_NAME", "ADMIN$")
SHARE_PATH  = os.getenv("SMB_SHARE_PATH", "/share")
# Fake server strings to blend in as a Windows DC
SERVER_NAME   = os.getenv("SMB_SERVER_NAME", "FILESERVER01")
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
# Ingest helpers
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
          username: str | None = None, password: str | None = None,
          extra: dict | None = None):
    _post("/ingest/protocol/event", {
        "eventId":   str(uuid.uuid4()),
        "sensorId":  SENSOR_ID,
        "protocol":  "smb",
        "srcIp":     src_ip,
        "srcPort":   src_port,
        "dstPort":   DST_PORT,
        "eventType": event_type,
        "username":  username,
        "password":  password,
        "data":      extra or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


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
        except Exception as exc:
            log.warning("heartbeat error: %s", exc)
        time.sleep(30)


# ---------------------------------------------------------------------------
# File capture — hash and store dropped binaries
# ---------------------------------------------------------------------------
def _capture_file(local_path: str, share: str, requested_path: str, src_ip: str) -> dict:
    os.makedirs(CAPTURE_DIR, exist_ok=True)
    try:
        size = os.path.getsize(local_path)
        if size == 0:
            return {}

        with open(local_path, "rb") as fh:
            data = fh.read()

        md5  = hashlib.md5(data).hexdigest()
        sha256 = hashlib.sha256(data).hexdigest()

        dest = os.path.join(CAPTURE_DIR, sha256)
        if not os.path.exists(dest):
            shutil.copy2(local_path, dest)

        meta_path = dest + ".meta.json"
        if not os.path.exists(meta_path):
            with open(meta_path, "w") as fh:
                json.dump({
                    "srcIp":         src_ip,
                    "share":         share,
                    "requestedPath": requested_path,
                    "md5":           md5,
                    "sha256":        sha256,
                    "size":          size,
                    "capturedAt":    datetime.now(timezone.utc).isoformat(),
                }, fh)

        log.info("captured file src=%s share=%s path=%s sha256=%s size=%d",
                 src_ip, share, requested_path, sha256[:16], size)
        return {"sha256": sha256, "md5": md5, "fileSize": size}
    except Exception as exc:
        log.warning("capture error %s: %s", local_path, exc)
        return {}


# ---------------------------------------------------------------------------
# Impacket SMB server with instrumented callbacks
# ---------------------------------------------------------------------------
class HoneypotSMBServer(SimpleSMBServer):
    """Subclass of Impacket's SimpleSMBServer that hooks auth and file events."""

    def __init__(self):
        os.makedirs(SHARE_PATH, exist_ok=True)
        # Pre-populate decoy files so the share looks real
        _seed_decoy_files(SHARE_PATH)

        super().__init__(listenAddress="0.0.0.0", listenPort=PORT)

        self.addShare(SHARE_NAME, SHARE_PATH, "File Share")

        self.setSMBChallenge("")  # static challenge makes NTLM hashes reproducible
        self.setLogFile("/dev/null")  # suppress Impacket's own file logging

    # ------------------------------------------------------------------
    # Impacket callback: called after NTLM negotiation completes.
    # Signature matches impacket.smbserver.SimpleSMBServer.
    # ------------------------------------------------------------------
    def hookSmbAuth(self, connId, smbServer, spnegoData,  # noqa: N802
                    username, domain, password, ntHash, lmHash, token):
        conn = smbServer.getConnectionData(connId, checkStatus=False)
        client_ip   = conn.get("ClientIP", "unknown")
        client_port = conn.get("ClientPort")
        native_os   = conn.get("NativeOS", "")
        native_lan  = conn.get("NativeLanManager", "")

        user_str = username.decode(errors="replace") if isinstance(username, bytes) else str(username or "")
        dom_str  = domain.decode(errors="replace")   if isinstance(domain,   bytes) else str(domain   or "")

        # NTLM response hashes (NTLMv1/v2 — crackable offline with hashcat)
        nt_hex = ntHash.hex() if ntHash else None
        lm_hex = lmHash.hex() if lmHash else None

        log.info("auth user=%s domain=%s os=%s lan=%s from %s:%s hash=%s",
                 user_str, dom_str, native_os, native_lan,
                 client_ip, client_port, nt_hex[:16] if nt_hex else "-")

        _send("auth", client_ip, client_port,
              username=user_str or None,
              extra={
                  "domain":       dom_str or None,
                  "nativeOS":     native_os or None,
                  "nativeLAN":    native_lan or None,
                  "ntlmHash":     nt_hex,
                  "lmHash":       lm_hex,
                  "shareName":    SHARE_NAME,
              })

        # Return False = deny auth (attacker gets ACCESS_DENIED)
        # This is correct honeypot behaviour — we log but never grant access.
        return False

    # ------------------------------------------------------------------
    # Impacket callback: called on every SMB tree connect (share access).
    # ------------------------------------------------------------------
    def hookSmbTreeConnect(self, connId, smbServer, recvPacket,  # noqa: N802
                           path, service, errorCode):
        conn   = smbServer.getConnectionData(connId, checkStatus=False)
        client_ip   = conn.get("ClientIP", "unknown")
        client_port = conn.get("ClientPort")
        username    = conn.get("LastRecvUsername", "")

        share = path.split("\\")[-1] if path else ""
        log.info("tree-connect share=%s user=%s from %s", share, username, client_ip)

        _send("command", client_ip, client_port,
              username=username or None,
              extra={"command": f"TREE_CONNECT:{share}", "share": share, "path": path})

    # ------------------------------------------------------------------
    # Impacket callback: called on CREATE (open/create file).
    # ------------------------------------------------------------------
    def hookSmbCreate(self, connId, smbServer, recvPacket,  # noqa: N802
                      fileName, desiredAccess, fileAttributes,
                      shareAccess, createDisposition, createOptions,
                      fileId, errorCode):
        conn       = smbServer.getConnectionData(connId, checkStatus=False)
        client_ip  = conn.get("ClientIP", "unknown")
        client_port = conn.get("ClientPort")
        username   = conn.get("LastRecvUsername", "")
        share      = conn.get("ConnectedShares", {}).get(conn.get("Tid", 0), {}).get("shareName", "")

        fname = fileName.decode(errors="replace") if isinstance(fileName, bytes) else str(fileName or "")
        is_write = bool(desiredAccess & 0x40000000)  # GENERIC_WRITE
        action = "WRITE" if is_write else "READ"

        log.info("file-%s file=%s share=%s user=%s from %s",
                 action.lower(), fname, share, username, client_ip)

        extra: dict = {
            "command":     f"FILE_{action}:{fname}",
            "share":       share,
            "fileName":    fname,
            "fileAction":  action,
            "desiredAccess": hex(desiredAccess),
        }

        # If attacker is writing, check for file drop after a short delay
        if is_write:
            local = os.path.join(SHARE_PATH, fname.lstrip("/\\").replace("\\", "/"))
            threading.Timer(2.0, self._check_drop, args=(local, share, fname, client_ip, extra.copy())).start()

        _send("command", client_ip, client_port, username=username or None, extra=extra)

    def _check_drop(self, local_path: str, share: str, requested: str,
                    src_ip: str, extra: dict):
        if os.path.exists(local_path):
            cap = _capture_file(local_path, share, requested, src_ip)
            if cap:
                extra.update(cap)
                _send("command", src_ip, None,
                      extra={**extra, "command": f"FILE_DROP:{requested}"})


# ---------------------------------------------------------------------------
# Decoy files — make the share look like a real Windows server
# ---------------------------------------------------------------------------
def _seed_decoy_files(path: str):
    decoys = {
        "desktop.ini": b"[.ShellClassInfo]\r\nIconResource=C:\\Windows\\System32\\imageres.dll,-3\r\n",
        "Q4-Budget-2024.xlsx": b"PK\x03\x04" + b"\x00" * 100,  # ZIP magic (xlsx)
        "IT-Passwords-TEMP.txt": b"# Temporary password list\r\nAdmin: Ch@ng3M3!\r\nBackup: B@ckup2024\r\n",
        "VPN-Config.ovpn": b"client\r\ndev tun\r\nproto udp\r\nremote vpn.corp.internal 1194\r\n",
        "network-scan.bat": b"@echo off\r\nnet view\r\nnltest /domain_trusts\r\n",
    }
    for name, content in decoys.items():
        fpath = os.path.join(path, name)
        if not os.path.exists(fpath):
            with open(fpath, "wb") as fh:
                fh.write(content)


# ---------------------------------------------------------------------------
# Fallback: raw TCP listener for scanners that don't speak SMB
# (records the connection and any banner/probe they send)
# ---------------------------------------------------------------------------
def _raw_connect_listener():
    """Accept raw TCP connections on PORT+1 as a secondary probe catcher.
    The real SMB server already handles port 445; this catches anything
    that fails the SMB handshake before Impacket gets a chance to log it.
    This runs only if SMB_RAW_PROBE_PORT is set."""
    raw_port = os.getenv("SMB_RAW_PROBE_PORT")
    if not raw_port:
        return
    raw_port = int(raw_port)
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", raw_port))
    srv.listen(128)
    log.info("raw probe listener on :%d", raw_port)
    while True:
        try:
            conn, addr = srv.accept()
            src_ip, src_port = addr
            try:
                conn.settimeout(3)
                probe = conn.recv(512)
                conn.close()
            except Exception:
                probe = b""
            log.info("raw-probe from %s:%d probe_len=%d", src_ip, src_port, len(probe))
            _send("connect", src_ip, src_port, extra={
                "probeHex": probe[:64].hex() if probe else None,
                "probeLen": len(probe),
            })
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    os.makedirs(SHARE_PATH, exist_ok=True)
    os.makedirs(CAPTURE_DIR, exist_ok=True)

    log.info("SMB honeypot starting — share=%s path=%s port=%d sensor=%s",
             SHARE_NAME, SHARE_PATH, PORT, SENSOR_ID)

    threading.Thread(target=_heartbeat_loop, daemon=True).start()
    threading.Thread(target=_raw_connect_listener, daemon=True).start()

    try:
        server = HoneypotSMBServer()
        server.start()
    except Exception as exc:
        log.error("SMB server error: %s\n%s", exc, traceback.format_exc())
        raise


if __name__ == "__main__":
    main()
