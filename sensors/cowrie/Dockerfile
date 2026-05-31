FROM cowrie/cowrie:latest

# Overlay our custom honeyfs on top of the image's defaults.
COPY honeyfs/ /cowrie/cowrie-git/honeyfs/
COPY txtcmds/ /cowrie/cowrie-git/txtcmds/

# Enforce minimum 8-character password policy in Cowrie's auth layer.
COPY --chmod=644 patch_auth.py /cowrie/cowrie-git/patch_auth.py
RUN ["/cowrie/cowrie-env/bin/python3", "/cowrie/cowrie-git/patch_auth.py"]

# Bake in default config + credentials — both overrideable at runtime via the signal volume.
COPY --chmod=644 cowrie.cfg   /cowrie/cowrie-git/etc/cowrie.cfg
COPY --chmod=644 userdb.txt   /cowrie/cowrie-git/etc/userdb.txt

# Entrypoint: applies pending config from /signal volume, then starts cowrie and
# watches for reload signals written by the beacon when config changes.
COPY --chmod=755 entrypoint.sh /entrypoint.sh
# Override the base image ENTRYPOINT so our wrapper runs instead of cowrie directly.
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
