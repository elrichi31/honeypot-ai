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


def safe_copy(src, dst, *, label, skip_if_exists=False):
    """Copy src -> dst, tolerating read-only destinations.

    Two deployment models share this entrypoint:

      * docker-compose bind-mounts cowrie.cfg / userdb.txt into etc as
        read-only (``:ro``).  The destination already holds the right content
        and is NOT writable — overwriting it raises PermissionError/OSError
        and would crash the entrypoint, leaving cowrie down.  We skip instead.
      * the dashboard "signal volume" model leaves etc writable so config can
        be pushed at runtime; here the copy succeeds normally.
    """
    if not os.path.exists(src):
        return
    if skip_if_exists and os.path.exists(dst):
        print(f"[entrypoint] {os.path.basename(dst)} already present (bind mount?), keeping it", flush=True)
        return
    try:
        shutil.copy2(src, dst)
        print(f"[entrypoint] {label}", flush=True)
    except OSError as e:
        # Read-only bind mount (EROFS) or no write permission (EACCES):
        # the mounted file is authoritative, so just use it as-is.
        print(f"[entrypoint] Could not write {dst} ({e}); using mounted file as-is", flush=True)


def apply_pending():
    os.makedirs(SIGNAL_DIR, exist_ok=True)
    os.makedirs(ETC_DIR, exist_ok=True)

    # Install baked-in defaults only when etc doesn't already provide the file.
    # The base image declares a VOLUME on etc so the Dockerfile COPY is
    # discarded; we copy at runtime AFTER the volume/bind mount is in place.
    # If the file is bind-mounted (read-only), it already exists -> keep it.
    for name in ("cowrie.cfg", "userdb.txt"):
        safe_copy(
            os.path.join(DEFAULTS_DIR, name),
            os.path.join(ETC_DIR, name),
            label=f"Installed default {name}",
            skip_if_exists=True,
        )

    # Apply any pending dashboard config (overrides defaults).
    # Signal files are kept (not deleted) so they survive subsequent restarts.
    for src, dst in [(NEW_CFG, ACTIVE_CFG), (NEW_UDB, ACTIVE_UDB)]:
        safe_copy(src, dst, label=f"Applied signal {os.path.basename(src)}")

    try:
        os.remove(RELOAD_FLAG)
    except FileNotFoundError:
        pass


def drop_to_cowrie():
    """Drop from root to the cowrie user so cowrie won't refuse to start."""
    # Already non-root (the container was started with `user:` or USER): nothing
    # to drop, and cowrie is happy.
    if os.geteuid() != 0:
        print("[entrypoint] Already non-root, skipping privilege drop", flush=True)
        return
    try:
        pw = pwd.getpwnam("cowrie")
        os.setgid(pw.pw_gid)
        os.setuid(pw.pw_uid)
        print(f"[entrypoint] Dropped privileges to uid={pw.pw_uid}", flush=True)
    except KeyError:
        print("[entrypoint] cowrie user not found, staying as current user", flush=True)
    except PermissionError:
        # We ARE root but setuid was denied — almost always because the
        # container dropped CAP_SETUID/CAP_SETGID. Cowrie refuses to run as
        # root, so fail loudly instead of looping forever with a misleading
        # "already non-root" message.
        print(
            "[entrypoint] FATAL: running as root but cannot drop privileges "
            "(missing CAP_SETUID/CAP_SETGID). Add `cap_add: [SETUID, SETGID]` "
            "to the cowrie service, or run it with `user: cowrie`.",
            flush=True,
        )
        sys.exit(1)


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
