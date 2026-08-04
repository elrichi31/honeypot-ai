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

# ── 3. Tolerant userdb decoding ─────────────────────────────────────────────
# UserDB.load() reads etc/userdb.txt with encoding="ascii" (strict). A single
# non-ASCII byte anywhere in the file (e.g. an em-dash or accented char in a
# comment) raises UnicodeDecodeError *on every login attempt*, which crashes
# checkUserPass before it can record the attempt — so auth silently fails for
# everyone and nothing is logged. Relax the read to UTF-8 with replacement so a
# stray byte can never take down authentication again.

auth_content = open(AUTH_PATH).read()

_REPLACEMENTS = [
    ('.read_text(encoding="ascii")', '.read_text(encoding="utf-8", errors="replace")'),
    ('.decode("ascii")', '.decode("utf-8", "replace")'),
]

if any(old in auth_content for old, _ in _REPLACEMENTS):
    for old, new in _REPLACEMENTS:
        auth_content = auth_content.replace(old, new)
    with open(AUTH_PATH, "w") as f:
        f.write(auth_content)
    print("[patch_auth] Relaxed userdb decoding to UTF-8 (errors=replace) — non-ASCII chars no longer crash auth.")
else:
    print("[patch_auth] Tolerant userdb decoding already applied, skipping.")

# ── 4. find(1) node budget ──────────────────────────────────────────────────

FIND_PATH = "/cowrie/cowrie-git/src/cowrie/commands/find.py"
FIND_MARKER = "_FIND_NODE_BUDGET"

FIND_PATCH = '''

# ── find(1) node budget (injected by patch_auth.py) ────────────────────────
# find_recursive() walks the fake filesystem synchronously inside the Twisted
# reactor, and cowrie is single-threaded: while it walks, every other SSH
# session is frozen. maxdepth alone does not bound the work — the honeyfs has
# symlink cycles, so a depth-20 walk re-expands the same subtrees over and
# over. On 2026-08-04 a single `find / -name "*.env"` (no -maxdepth, so the
# default 20) pinned a core for 5h43m: the port stayed bound, no handshake
# completed, and the sensor logged nothing until it was restarted.
# Cap total nodes visited so the walk always terminates promptly.
_FIND_NODE_BUDGET = 20000

_original_find_start = Command_find.start
_original_find_recursive = Command_find.find_recursive


def _budgeted_start(self) -> None:
    self._find_budget = _FIND_NODE_BUDGET
    _original_find_start(self)


def _budgeted_find_recursive(self, path: str, depth: int) -> None:
    if getattr(self, "_find_budget", _FIND_NODE_BUDGET) <= 0:
        return
    self._find_budget -= 1
    _original_find_recursive(self, path, depth)


Command_find.start = _budgeted_start
Command_find.find_recursive = _budgeted_find_recursive
# ── End find(1) node budget ────────────────────────────────────────────────
'''

find_content = open(FIND_PATH).read()

if FIND_MARKER not in find_content:
    with open(FIND_PATH, "a") as f:
        f.write(FIND_PATCH)
    print("[patch_auth] Appended find(1) node budget — `find /` can no longer wedge the reactor.")
else:
    print("[patch_auth] find(1) node budget already present, skipping.")
