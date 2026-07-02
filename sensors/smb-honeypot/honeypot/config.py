import os
import socket

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

CAPTURE_DIR   = os.getenv("SMB_CAPTURE_DIR", "/captures")
SHARE_NAME    = os.getenv("SMB_SHARE_NAME", "ADMIN$")
SHARE_PATH    = os.getenv("SMB_SHARE_PATH", "/share")
SHARE_COMMENT = os.getenv("SMB_SHARE_COMMENT", os.getenv("SMB_SHARE_COMMENT", "Corp Remote Admin"))
SERVER_NAME   = os.getenv("SMB_SERVER_NAME", os.getenv("SENSOR_HOSTNAME", "web-prod-01"))
SERVER_OS     = os.getenv("SMB_SERVER_OS", os.getenv("SENSOR_OS", "Windows Server 2008 R2 Standard"))
SERVER_DOMAIN = os.getenv("SMB_SERVER_DOMAIN", os.getenv("SENSOR_WIN_DOMAIN", "CORP"))

EVENT_LOG_PATH = os.getenv("EVENT_LOG_PATH", "/var/log/smb-honeypot/events.json")
