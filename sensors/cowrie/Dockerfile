FROM cowrie/cowrie:latest

# Overlay our custom honeyfs on top of the image's defaults.
# Files we provide take precedence; files we don't touch remain from the base.
COPY honeyfs/ /cowrie/cowrie-git/honeyfs/
COPY txtcmds/ /cowrie/cowrie-git/txtcmds/

# Enforce minimum 8-character password policy in Cowrie's auth layer.
# userdb.txt has no length-based syntax so we patch the Python class directly.
# Use exec form (JSON array) — the cowrie base image has no /bin/sh.
COPY patch_auth.py /tmp/patch_auth.py
RUN ["/cowrie/cowrie-env/bin/python3", "/tmp/patch_auth.py"]
