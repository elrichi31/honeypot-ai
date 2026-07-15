import os
import socket

from persisted_config import load_override

INGEST_API_URL = os.getenv("INGEST_API_URL", "http://ingest-api:3000")
INGEST_SHARED_SECRET = os.getenv("INGEST_SHARED_SECRET", "")
PORT = int(os.getenv("PORT", "3306"))
DST_PORT = int(os.getenv("DST_PORT", str(PORT)))
SENSOR_ID = os.getenv("SENSOR_ID", f"mysql-{socket.gethostname()}")
SENSOR_NAME = os.getenv("SENSOR_NAME", "MySQL Honeypot")
CLIENT_SLUG = os.getenv("CLIENT_SLUG", "")
CLIENT_NAME = os.getenv("CLIENT_NAME", "")
SENSOR_LAYER = os.getenv("SENSOR_LAYER", "external")
VERSION = "1.0.0"
SENSOR_HOST = os.getenv("SENSOR_HOST", socket.gethostname())

EVENT_LOG_PATH = os.getenv("EVENT_LOG_PATH", "/var/log/mysql-honeypot/events.json")

# config.apply — restart-based (see app.py's config.apply handler). Applied
# via /config/override.json, written by the control agent, read fresh on
# every process start.
_OVERRIDE_PATH = "/config/override.json"
_override_doc = load_override(_OVERRIDE_PATH)
_override = _override_doc.get("config", {})
CONFIG_HASH = _override_doc.get("configHash")

SERVER_VERSION = _override.get("server_version", os.getenv("MYSQL_SERVER_VERSION", "5.7.44-log"))
