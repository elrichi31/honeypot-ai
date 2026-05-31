FROM cowrie/cowrie:latest

# Overlay our custom honeyfs on top of the image's defaults.
COPY honeyfs/ /cowrie/cowrie-git/honeyfs/
COPY txtcmds/ /cowrie/cowrie-git/txtcmds/

# Enforce minimum 8-character password policy in Cowrie's auth layer.
COPY --chmod=644 patch_auth.py /cowrie/cowrie-git/patch_auth.py
RUN ["/cowrie/cowrie-env/bin/python3", "/cowrie/cowrie-git/patch_auth.py"]

# Stage defaults outside the VOLUME path — entrypoint.py copies them at runtime.
# COPY to /cowrie/cowrie-git/etc/ is silently discarded if the base image declares
# a VOLUME there; /cowrie-defaults/ is safe because it is not a declared VOLUME.
COPY cowrie.cfg   /cowrie-defaults/cowrie.cfg
COPY userdb.txt   /cowrie-defaults/userdb.txt
# Ensure the cowrie user (uid=1000) can read the directory and files.
RUN chmod 755 /cowrie-defaults && chmod 644 /cowrie-defaults/cowrie.cfg /cowrie-defaults/userdb.txt

# Entrypoint: applies pending config from /signal volume, then starts cowrie and
# watches for reload signals written by the beacon when config changes.
COPY entrypoint.py /entrypoint.py
# Override the base image ENTRYPOINT with our Python wrapper (image has no shell).
ENTRYPOINT ["/cowrie/cowrie-env/bin/python3", "/entrypoint.py"]
