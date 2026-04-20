#!/usr/bin/env python3
"""
Patches Cowrie at build time:
  1. Appends UserDBWithLengthPolicy to cowrie/core/auth.py — enforces 8-char min.
  2. Appends a dataReceived monkey-patch to cowrie/ssh/transport.py — drops
     connections from known mass-scanner SSH clients (SSH-2.0-Go, ZGrab, etc.)
     the moment their version string arrives, before any KEX completes.
"""

import sys

# ── 1. Auth length policy ───────────────────────────────────────────────────

AUTH_PATH = "/cowrie/cowrie-git/src/cowrie/core/auth.py"
MIN_LENGTH = 8
AUTH_MARKER = "class UserDBWithLengthPolicy"

content = open(AUTH_PATH).read()

if AUTH_MARKER not in content:
    CUSTOM_CLASS = f"""

class UserDBWithLengthPolicy(UserDB):
    \"\"\"Rejects passwords shorter than {MIN_LENGTH} characters.\"\"\"

    def checklogin(self, thelogin: bytes, thepasswd: bytes, src_ip: str = "0.0.0.0") -> bool:
        if len(thepasswd) < {MIN_LENGTH}:
            return False
        return super().checklogin(thelogin, thepasswd, src_ip)
"""
    with open(AUTH_PATH, "a") as f:
        f.write(CUSTOM_CLASS)
    print(f"[patch_auth] Appended UserDBWithLengthPolicy — passwords < {MIN_LENGTH} chars rejected.")
else:
    print(f"[patch_auth] UserDBWithLengthPolicy already present, skipping.")

# ── 2. Scanner client blocker ───────────────────────────────────────────────

TRANSPORT_PATH = "/cowrie/cowrie-git/src/cowrie/ssh/transport.py"
TRANSPORT_MARKER = "_BLOCKED_SCANNER_VERSIONS"

content = open(TRANSPORT_PATH).read()

if TRANSPORT_MARKER not in content:
    SCANNER_PATCH = """

# ── Scanner-client blocker (injected by patch_auth.py) ─────────────────────
_BLOCKED_SCANNER_VERSIONS = [
    b"SSH-2.0-Go",          # Go x/crypto/ssh — accounts for ~93% of scan traffic
    b"SSH-2.0-ZGrab",       # ZGrab internet scanner
    b"SSH-2.0-zgrab",
    b"SSH-2.0-masscan",     # Masscan with SSH probe
    b"SSH-2.0-libssh-",     # libssh generic (not libssh2; libssh2 is already in userdb)
    b"SSH-2.0-JSCH-",       # Java JSch automated tools
    b"SSH-2.0-AsyncSSH",    # Python asyncssh scanners
]

_original_dataReceived = HoneyPotSSHTransport.dataReceived

def _scanner_filtering_dataReceived(self, data):
    had_version = getattr(self, "gotVersion", False)
    _original_dataReceived(self, data)
    if not had_version and getattr(self, "gotVersion", False):
        version: bytes = getattr(self, "otherVersionString", b"")
        for blocked in _BLOCKED_SCANNER_VERSIONS:
            if version.startswith(blocked):
                self.transport.loseConnection()
                return

HoneyPotSSHTransport.dataReceived = _scanner_filtering_dataReceived
# ── End scanner-client blocker ──────────────────────────────────────────────
"""
    with open(TRANSPORT_PATH, "a") as f:
        f.write(SCANNER_PATCH)
    print(f"[patch_auth] Appended scanner-client blocker to {TRANSPORT_PATH} — SSH-2.0-Go and friends will be dropped.")
else:
    print(f"[patch_auth] Scanner-client blocker already present, skipping.")
