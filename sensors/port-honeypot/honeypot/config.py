import os
import socket

from persisted_config import load_override

INGEST_API_URL = os.getenv("INGEST_API_URL", "http://ingest-api:3000")
INGEST_SHARED_SECRET = os.getenv("INGEST_SHARED_SECRET", "")
SENSOR_ID = os.getenv("SENSOR_ID", f"port-{socket.gethostname()}")
SENSOR_NAME = os.getenv("SENSOR_NAME", "Port Honeypot")
CLIENT_SLUG = os.getenv("CLIENT_SLUG", "")
CLIENT_NAME = os.getenv("CLIENT_NAME", "")
VERSION = "1.1.0"
SENSOR_HOST = os.getenv("SENSOR_HOST", socket.gethostname())

# config.apply — restart-based (see app.py's config.apply handler). Applied
# via /config/override.json, written by the control agent, read fresh on
# every process start.
_OVERRIDE_PATH = "/config/override.json"
_override_doc = load_override(_OVERRIDE_PATH)
_override = _override_doc.get("config", {})
CONFIG_HASH = _override_doc.get("configHash")

PANEL_TITLE = _override.get("panel_title", os.getenv("PORT_PANEL_TITLE", "Operations Dashboard"))
PANEL_ORG = _override.get("panel_org", os.getenv("PORT_PANEL_ORG", "Corp Internal Dashboard"))

EVENT_LOG_PATH = os.getenv("EVENT_LOG_PATH", "/var/log/port-honeypot/events.json")

DEFAULT_PORTS = "1433 2375 3389 4444 5900 6379 8888 9090 9200 27017"
PORTS = [int(p) for p in os.getenv("PORTS", DEFAULT_PORTS).split() if p.isdigit()]

SERVICES: dict[int, str] = {
    1433:  "mssql",
    2375:  "docker-api",
    3389:  "rdp",
    4444:  "metasploit",
    5900:  "vnc",
    6379:  "redis",
    8888:  "http-alt",
    9090:  "cockpit",
    9200:  "elasticsearch",
    27017: "mongodb",
}

BANNERS: dict[int, bytes] = {}
