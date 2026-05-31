"""
Cowrie entrypoint: applies pending config/userdb from the signal volume,
starts cowrie, then watches for reload signals from the beacon.
"""
import os
import shutil
import subprocess
import sys
import time

SIGNAL_DIR = "/signal"
RELOAD_FLAG = os.path.join(SIGNAL_DIR, "cowrie-reload")
NEW_CFG     = os.path.join(SIGNAL_DIR, "cowrie.cfg")
NEW_UDB     = os.path.join(SIGNAL_DIR, "userdb.txt")
ACTIVE_CFG  = "/cowrie/cowrie-git/etc/cowrie.cfg"
ACTIVE_UDB  = "/cowrie/cowrie-git/etc/userdb.txt"
PYTHON      = "/cowrie/cowrie-env/bin/python3"
COWRIE_DIR  = "/cowrie/cowrie-git"


def apply_pending():
    os.makedirs(SIGNAL_DIR, exist_ok=True)
    for src, dst in [(NEW_CFG, ACTIVE_CFG), (NEW_UDB, ACTIVE_UDB)]:
        if os.path.exists(src):
            shutil.copy2(src, dst)
            os.remove(src)
            print(f"[entrypoint] Applied {os.path.basename(src)}", flush=True)
    try:
        os.remove(RELOAD_FLAG)
    except FileNotFoundError:
        pass


def main():
    apply_pending()

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
        time.sleep(5)

    print("[entrypoint] exiting — Docker will restart container with new config", flush=True)
    sys.exit(0)


if __name__ == "__main__":
    main()
