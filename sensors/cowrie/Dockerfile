FROM cowrie/cowrie:latest

# Overlay our custom honeyfs on top of the image's defaults.
COPY honeyfs/ /cowrie/cowrie-git/honeyfs/
COPY txtcmds/ /cowrie/cowrie-git/txtcmds/

# Enforce minimum 8-character password policy in Cowrie's auth layer.
COPY --chmod=644 patch_auth.py /cowrie/cowrie-git/patch_auth.py
RUN ["/cowrie/cowrie-env/bin/python3", "/cowrie/cowrie-git/patch_auth.py"]

# Bake in the default config — can be overridden at runtime via the signal volume.
COPY --chmod=644 cowrie.cfg /cowrie/cowrie-git/etc/cowrie.cfg

# Entrypoint: applies pending config from /signal volume, then starts cowrie and
# watches for reload signals written by the beacon when config changes.
COPY --chmod=755 entrypoint.sh /entrypoint.sh
CMD ["/bin/bash", "/entrypoint.sh"]
