"""
Cowrie entrypoint: applies pending config/userdb from the signal volume,
starts cowrie, then watches for reload signals from the beacon.
"""
import os
import pwd
import shutil
import subprocess
import sys
import time

SIGNAL_DIR   = "/signal"
DEFAULTS_DIR = "/cowrie-defaults"
RELOAD_FLAG  = os.path.join(SIGNAL_DIR, "cowrie-reload")
NEW_CFG      = os.path.join(SIGNAL_DIR, "cowrie.cfg")
NEW_UDB      = os.path.join(SIGNAL_DIR, "userdb.txt")
ETC_DIR      = "/cowrie/cowrie-git/etc"
ACTIVE_CFG   = os.path.join(ETC_DIR, "cowrie.cfg")
ACTIVE_UDB   = os.path.join(ETC_DIR, "userdb.txt")
PYTHON       = "/cowrie/cowrie-env/bin/python3"
COWRIE_DIR   = "/cowrie/cowrie-git"


def apply_pending():
    os.makedirs(SIGNAL_DIR, exist_ok=True)
    os.makedirs(ETC_DIR, exist_ok=True)

    # Always copy baked-in defaults first.  The base image declares a VOLUME on
    # the etc directory so COPY in the Dockerfile is silently discarded; we
    # copy at runtime instead so the files land AFTER the volume is mounted.
    for name in ("cowrie.cfg", "userdb.txt"):
        src = os.path.join(DEFAULTS_DIR, name)
        dst = os.path.join(ETC_DIR, name)
        if os.path.exists(src):
            shutil.copy2(src, dst)
            print(f"[entrypoint] Installed default {name}", flush=True)

    # Apply any pending dashboard config (overrides defaults).
    # Signal files are kept (not deleted) so they survive subsequent restarts.
    for src, dst in [(NEW_CFG, ACTIVE_CFG), (NEW_UDB, ACTIVE_UDB)]:
        if os.path.exists(src):
            shutil.copy2(src, dst)
            print(f"[entrypoint] Applied signal {os.path.basename(src)}", flush=True)

    try:
        os.remove(RELOAD_FLAG)
    except FileNotFoundError:
        pass


def drop_to_cowrie():
    """Drop from root to the cowrie user so cowrie won't refuse to start."""
    try:
        pw = pwd.getpwnam("cowrie")
        os.setgid(pw.pw_gid)
        os.setuid(pw.pw_uid)
        print(f"[entrypoint] Dropped privileges to uid={pw.pw_uid}", flush=True)
    except KeyError:
        print("[entrypoint] cowrie user not found, staying as current user", flush=True)
    except PermissionError:
        print("[entrypoint] Already non-root, skipping privilege drop", flush=True)


def main():
    apply_pending()
    drop_to_cowrie()

    # Exact same invocation as the base image:
    #   ENTRYPOINT ["/cowrie/cowrie-env/bin/python3"]
    #   CMD ["/cowrie/cowrie-env/bin/twistd", "-n", "--umask=0022", "--pidfile=", "cowrie"]
    # Running python3 as the interpreter (not twistd directly) is required
    # because the image is distroless — no /usr/bin/env to resolve shebangs.
    PYTHON = "/cowrie/cowrie-env/bin/python3"
    TWISTD = "/cowrie/cowrie-env/bin/twistd"
    print("[entrypoint] Starting cowrie", flush=True)
    proc = subprocess.Popen(
        [PYTHON, TWISTD, "-n", "--umask=0022", "--pidfile=", "cowrie"],
        cwd=COWRIE_DIR,
    )
    print(f"[entrypoint] cowrie PID={proc.pid} — watching for reload signal", flush=True)

    while True:
        if proc.poll() is not None:
            print("[entrypoint] cowrie exited", flush=True)
            break
        if os.path.exists(RELOAD_FLAG):
            print("[entrypoint] Reload signal — stopping cowrie for config restart", flush=True)
            os.remove(RELOAD_FLAG)
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
            break
        time.sleep(2)

    print("[entrypoint] exiting — Docker will restart container with new config", flush=True)
    sys.exit(0)


if __name__ == "__main__":
    main()
