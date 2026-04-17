#!/usr/bin/env python3
"""
Build-time patch: inserts a minimum password length guard into Cowrie's
UserDB.checklogin so that any password shorter than MIN_LENGTH is rejected
before userdb.txt is even consulted.

Why this approach: Cowrie's userdb.txt only supports exact-match deny rules
(e.g. !password) — there is no wildcard-by-length syntax. Patching the method
directly is the only reliable way to enforce a length policy.
"""

import re
import sys

AUTH_PATH = "/cowrie/cowrie-git/src/cowrie/core/auth.py"
MIN_LENGTH = 8

GUARD = (
    "\n"
    "        # --- minimum password length policy (injected at build time) ---\n"
    f"        if len(thepassword) < {MIN_LENGTH}:\n"
    "            return False\n"
    "        # --- end policy ---\n"
)

content = open(AUTH_PATH).read()

# Match the checklogin signature line (possibly with a return-type annotation).
# We insert the guard immediately after the colon that ends the def line.
pattern = r"([ \t]+def checklogin\(self[^)]*\)[^:]*:[ \t]*\n)"

new_content, n = re.subn(pattern, r"\1" + GUARD, content, count=1)

if n == 0:
    print("ERROR: could not locate checklogin in", AUTH_PATH, file=sys.stderr)
    sys.exit(1)

with open(AUTH_PATH, "w") as f:
    f.write(new_content)

print(f"[patch_auth] Patched {AUTH_PATH} — passwords < {MIN_LENGTH} chars will be rejected.")
