#!/usr/bin/env python3
"""
Appends UserDBWithLengthPolicy to Cowrie's auth module.

The proper cowrie way to add custom auth logic is to define a class in
cowrie/core/auth.py and set auth_class in cowrie.cfg — NOT to patch the
internals of existing methods.

The correct checklogin signature in cowrie is:
    checklogin(self, thelogin: bytes, thepasswd: bytes, src_ip: str) -> bool
Note: parameter is `thepasswd` (bytes), not `thepassword` (str).
"""

import sys

AUTH_PATH = "/cowrie/cowrie-git/src/cowrie/core/auth.py"
MIN_LENGTH = 8
MARKER = "class UserDBWithLengthPolicy"

content = open(AUTH_PATH).read()

if MARKER in content:
    print(f"[patch_auth] UserDBWithLengthPolicy already present in {AUTH_PATH}, skipping.")
    sys.exit(0)

CUSTOM_CLASS = f"""

class UserDBWithLengthPolicy(UserDB):
    \"\"\"UserDB subclass that rejects passwords shorter than {MIN_LENGTH} characters.\"\"\"

    def checklogin(self, thelogin: bytes, thepasswd: bytes, src_ip: str = "0.0.0.0") -> bool:
        if len(thepasswd) < {MIN_LENGTH}:
            return False
        return super().checklogin(thelogin, thepasswd, src_ip)
"""

with open(AUTH_PATH, "a") as f:
    f.write(CUSTOM_CLASS)

print(f"[patch_auth] Appended UserDBWithLengthPolicy to {AUTH_PATH} — passwords < {MIN_LENGTH} chars will be rejected.")
