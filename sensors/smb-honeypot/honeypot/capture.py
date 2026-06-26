import hashlib
import json
import logging
import os
import shutil
from datetime import datetime, timezone

from .config import CAPTURE_DIR, SHARE_PATH, SHARE_NAME
from .ingest import send

log = logging.getLogger("smb-honeypot")


def _capture_file(local_path: str, share: str, requested_path: str, src_ip: str) -> dict:
    os.makedirs(CAPTURE_DIR, exist_ok=True)
    try:
        size = os.path.getsize(local_path)
        if size == 0:
            return {}
        with open(local_path, "rb") as fh:
            data = fh.read()
        md5    = hashlib.md5(data).hexdigest()
        sha256 = hashlib.sha256(data).hexdigest()
        dest   = os.path.join(CAPTURE_DIR, sha256)
        if not os.path.exists(dest):
            shutil.copy2(local_path, dest)
        meta = dest + ".meta.json"
        if not os.path.exists(meta):
            with open(meta, "w") as fh:
                json.dump({
                    "srcIp": src_ip, "share": share,
                    "requestedPath": requested_path,
                    "md5": md5, "sha256": sha256, "size": size,
                    "capturedAt": datetime.now(timezone.utc).isoformat(),
                }, fh)
        log.info("captured file sha256=%s size=%d from %s", sha256[:16], size, src_ip)
        return {"sha256": sha256, "md5": md5, "fileSize": size}
    except Exception as exc:
        log.warning("capture error %s: %s", local_path, exc)
        return {}


def _mark_write(connData: dict, file_id, data_len: int):
    opened = connData.get("OpenedFiles", {}).get(file_id)
    if not opened or data_len <= 0:
        return
    opened["__written"] = True
    opened["__bytes_written"] = int(opened.get("__bytes_written", 0)) + data_len


def _finalize_capture(connData: dict, file_id, tree_id=None):
    opened = connData.get("OpenedFiles", {}).get(file_id)
    if not opened or not opened.get("__written"):
        return

    file_path = opened.get("FileName")
    if not file_path or not os.path.isfile(file_path):
        return

    src_ip = connData.get("ClientIP", "unknown")
    src_port = connData.get("ClientPort")
    requested_path = os.path.relpath(file_path, SHARE_PATH)
    share_name = SHARE_NAME
    if tree_id is not None:
        share = connData.get("ConnectedShares", {}).get(tree_id)
        if isinstance(share, dict):
            share_name = share.get("shareName") or share.get("name") or share_name

    info = _capture_file(file_path, share_name, requested_path, src_ip)
    if not info:
        return

    send(
        "file.upload",
        src_ip,
        src_port,
        extra={
            "shareName": share_name,
            "requestedPath": requested_path,
            **info,
        },
    )
