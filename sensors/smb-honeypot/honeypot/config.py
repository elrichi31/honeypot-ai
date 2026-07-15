import os
import socket

from persisted_config import load_override

INGEST_API_URL       = os.getenv("INGEST_API_URL", "http://ingest-api:3000")
INGEST_SHARED_SECRET = os.getenv("INGEST_SHARED_SECRET", "")
PORT                 = int(os.getenv("PORT", "445"))
DST_PORT             = int(os.getenv("DST_PORT", str(PORT)))
SENSOR_ID            = os.getenv("SENSOR_ID", f"smb-{socket.gethostname()}")
SENSOR_NAME          = os.getenv("SENSOR_NAME", "SMB Honeypot")
CLIENT_SLUG          = os.getenv("CLIENT_SLUG", "")
CLIENT_NAME          = os.getenv("CLIENT_NAME", "")
SENSOR_HOST          = os.getenv("SENSOR_HOST", socket.gethostname())
SENSOR_LAYER         = os.getenv("SENSOR_LAYER", "external")
VERSION              = "1.0.0"

# config.apply — restart-based (see app.py's config.apply handler). Applied
# via /config/override.json, written by the control agent, read fresh on
# every process start.
_OVERRIDE_PATH = "/config/override.json"
_override_doc = load_override(_OVERRIDE_PATH)
_override = _override_doc.get("config", {})
CONFIG_HASH = _override_doc.get("configHash")

CAPTURE_DIR   = os.getenv("SMB_CAPTURE_DIR", "/captures")
SHARE_PATH    = os.getenv("SMB_SHARE_PATH", "/share")
SHARE_NAME    = _override.get("share_name", os.getenv("SMB_SHARE_NAME", "ADMIN$"))
SHARE_COMMENT = _override.get("share_comment", os.getenv("SMB_SHARE_COMMENT", "Corp Remote Admin"))
SERVER_NAME   = _override.get("server_name", os.getenv("SMB_SERVER_NAME", os.getenv("SENSOR_HOSTNAME", "web-prod-01")))
SERVER_OS     = _override.get("server_os", os.getenv("SMB_SERVER_OS", os.getenv("SENSOR_OS", "Windows Server 2008 R2 Standard")))
SERVER_DOMAIN = _override.get("server_domain", os.getenv("SMB_SERVER_DOMAIN", os.getenv("SENSOR_WIN_DOMAIN", "CORP")))

EVENT_LOG_PATH = os.getenv("EVENT_LOG_PATH", "/var/log/smb-honeypot/events.json")
