import hashlib
import hmac
import os
import secrets
import time

from .config import SHARE_PATH, SERVER_NAME, SERVER_DOMAIN

_TOKEN_SECRET = secrets.token_bytes(32)


def honeytoken(src_ip: str) -> str:
    """Per-IP honeytoken for SMB decoys."""
    ts_hour = str(int(time.time()) // 3600)
    mac = hmac.new(_TOKEN_SECRET, f"{src_ip}:{ts_hour}".encode(), hashlib.sha256)
    return mac.hexdigest()[:16]


def seed_decoy_files(path: str):
    domain = os.getenv("SENSOR_WIN_DOMAIN", SERVER_DOMAIN)
    hostname = os.getenv("SENSOR_HOSTNAME", SERVER_NAME)
    decoys = {
        "desktop.ini":           b"[.ShellClassInfo]\r\nIconResource=C:\\Windows\\System32\\imageres.dll,-3\r\n",
        "Q4-Budget-2024.xlsx":   b"PK\x03\x04" + b"\x00" * 100,
        "IT-Passwords-TEMP.txt": (
            f"# {domain} temporary password list\r\n"
            f"it-admin: TempAdm!n2024\r\n"
            f"backup-svc: B@ckup_2024!\r\n"
            f"# ref: smb-decoy\r\n"
        ).encode(),
        "VPN-Config.ovpn":       (
            f"client\r\ndev tun\r\nproto udp\r\n"
            f"remote vpn.{domain.lower()}.internal 1194\r\n"
        ).encode(),
        "network-scan.bat":      (
            f"@echo off\r\n"
            f"net view /domain:{domain}\r\n"
            f"nltest /domain_trusts\r\n"
            f"ping {hostname}\r\n"
        ).encode(),
    }
    for name, content in decoys.items():
        fpath = os.path.join(path, name)
        if not os.path.exists(fpath):
            with open(fpath, "wb") as fh:
                fh.write(content)
