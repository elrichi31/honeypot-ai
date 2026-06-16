FROM cowrie/cowrie:latest

# Overlay our custom honeyfs on top of the image's defaults.
COPY honeyfs/ /cowrie/cowrie-git/honeyfs/
COPY txtcmds/ /cowrie/cowrie-git/txtcmds/

# Enforce minimum 8-character password policy in Cowrie's auth layer.
COPY --chmod=644 patch_auth.py /cowrie/cowrie-git/patch_auth.py
RUN ["/cowrie/cowrie-env/bin/python3", "/cowrie/cowrie-git/patch_auth.py"]

# Stage defaults outside the VOLUME path — entrypoint.py copies them at runtime.
# Switch to root so COPY+chmod run with the right privileges; restore cowrie after.
USER root
# moduli enables diffie-hellman-group-exchange for modern SSH clients (OpenSSH 9+).
# Generate with: ssh-keygen -G /tmp/m.all -b 2048 && ssh-keygen -T sensors/cowrie/moduli -f /tmp/m.all
COPY moduli /cowrie/cowrie-git/etc/moduli

COPY cowrie.cfg   /cowrie-defaults/cowrie.cfg
COPY userdb.txt   /cowrie-defaults/userdb.txt
RUN ["/cowrie/cowrie-env/bin/python3", "-c", "import os; os.chmod('/cowrie-defaults',0o755); os.chmod('/cowrie-defaults/cowrie.cfg',0o644); os.chmod('/cowrie-defaults/userdb.txt',0o644)"]
# Stay as root so entrypoint.py can write to VOLUME-mounted directories at runtime.

# Entrypoint: applies pending config from /signal volume, then starts cowrie and
# watches for reload signals written by the beacon when config changes.
COPY entrypoint.py /entrypoint.py
# Override the base image ENTRYPOINT with our Python wrapper (image has no shell).
ENTRYPOINT ["/cowrie/cowrie-env/bin/python3", "/entrypoint.py"]
