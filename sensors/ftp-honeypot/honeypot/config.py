import os
import socket

from persisted_config import load_override

INGEST_API_URL = os.getenv("INGEST_API_URL", "http://ingest-api:3000")
INGEST_SHARED_SECRET = os.getenv("INGEST_SHARED_SECRET", "")
PORT = int(os.getenv("PORT", "21"))
DST_PORT = int(os.getenv("DST_PORT", str(PORT)))
SENSOR_ID = os.getenv("SENSOR_ID", f"ftp-{socket.gethostname()}")
SENSOR_NAME = os.getenv("SENSOR_NAME", "FTP Honeypot")
CLIENT_SLUG = os.getenv("CLIENT_SLUG", "")
CLIENT_NAME = os.getenv("CLIENT_NAME", "")
VERSION = "1.0.0"
SENSOR_HOST = os.getenv("SENSOR_HOST", socket.gethostname())
SENSOR_LAYER = os.getenv("SENSOR_LAYER", "external")

# config.apply — restart-based (see app.py's config.apply handler). Applied
# via /config/override.json, written by the control agent, read fresh on
# every process start.
_OVERRIDE_PATH = "/config/override.json"
_override_doc = load_override(_OVERRIDE_PATH)
_override = _override_doc.get("config", {})
CONFIG_HASH = _override_doc.get("configHash")

# The override is plain banner text (no wire framing — that's an
# implementation detail the operator shouldn't have to type); FTP_BANNER set
# directly via env is trusted to already include its own \r\n, as before.
_banner_override = _override.get("banner")
BANNER = f"{_banner_override}\r\n" if _banner_override else os.getenv("FTP_BANNER", "220 (vsFTPd 3.0.5)\r\n")

CAPTURES_DIR = os.getenv("FTP_CAPTURES_DIR", "/captures")
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))

PASV_PORT_MIN = int(os.getenv("PASV_PORT_MIN", "50000"))
PASV_PORT_MAX = int(os.getenv("PASV_PORT_MAX", "50019"))

EVENT_LOG_PATH = os.getenv("EVENT_LOG_PATH", "/var/log/ftp-honeypot/events.json")
