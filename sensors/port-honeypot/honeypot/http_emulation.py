import json
import os
import random
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

from .config import PANEL_TITLE, PANEL_ORG

# Generated once per process start for stable Docker IDs/GUIDs
_DOCKER_ID = uuid.uuid4().hex[:24].upper() + uuid.uuid4().hex[:8].upper()
_DOCKER_SERVER_GUID = uuid.uuid4().hex
_START_TIME = time.time()


def _http_response(
    status: str,
    body: bytes,
    *,
    content_type: str = "application/json",
    headers: dict[str, str] | None = None,
) -> bytes:
    extra_headers = headers or {}
    header_lines = [
        f"HTTP/1.1 {status}",
        f"Content-Type: {content_type}",
        f"Content-Length: {len(body)}",
        "Connection: close",
    ]
    header_lines.extend(f"{k}: {v}" for k, v in extra_headers.items())
    return ("\r\n".join(header_lines) + "\r\n\r\n").encode() + body


def parse_http_request(data: bytes) -> dict[str, Any]:
    text = data.decode("latin-1", "replace")
    lines = text.split("\r\n")
    request_line = lines[0] if lines else ""
    parts = request_line.split()
    method = parts[0] if len(parts) >= 1 else ""
    path = parts[1] if len(parts) >= 2 else "/"
    version = parts[2] if len(parts) >= 3 else "HTTP/1.1"
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if not line:
            break
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()
    body = b""
    if b"\r\n\r\n" in data:
        body = data.split(b"\r\n\r\n", 1)[1]
    return {
        "method": method,
        "path": path,
        "version": version,
        "headers": headers,
        "body": body,
        "rawText": text,
    }


def docker_response(method: str, path: str) -> bytes:
    if path == "/_ping":
        return _http_response("200 OK", b"OK", content_type="text/plain", headers={"Api-Version": "1.45"})
    if path in ("/version", "/v1.24/version"):
        body = json.dumps({
            "Platform": {"Name": "Docker Engine - Community"},
            "Version": "26.1.4",
            "ApiVersion": "1.45",
            "MinAPIVersion": "1.24",
            "GitCommit": "5650f9b",
            "GoVersion": "go1.22.3",
            "Os": "linux",
            "Arch": "amd64",
            "KernelVersion": "5.15.0-91-generic",
        }).encode()
        return _http_response("200 OK", body, headers={"Api-Version": "1.45"})
    if path in ("/info", "/v1.24/info"):
        running = random.randint(2, 5)
        total = running + random.randint(1, 4)
        body = json.dumps({
            "ID": _DOCKER_ID,
            "Containers": total,
            "ContainersRunning": running,
            "ContainersStopped": total - running,
            "Images": random.randint(8, 16),
            "Driver": "overlay2",
            "DockerRootDir": "/var/lib/docker",
            "Name": os.getenv("SENSOR_HOSTNAME", "web-prod-01"),
            "ServerVersion": "26.1.4",
            "OperatingSystem": "Ubuntu 22.04.4 LTS",
            "Architecture": "x86_64",
            "CPUs": 4,
            "MemTotal": 8363184128,
        }).encode()
        return _http_response("200 OK", body, headers={"Api-Version": "1.45"})
    if path.startswith("/containers/json"):
        body = json.dumps([
            {
                "Id": "4f8f4c8d0b0db4d88e2b9e4fcb0d8d3b5123456789abcdef0123456789abcd",
                "Image": "nginx:1.25-alpine",
                "Command": '"/docker-entrypoint.sh nginx -g \'daemon off;\'"',
                "Created": 1719302400,
                "State": "running",
                "Status": "Up 3 days",
                "Names": ["/proxy"],
            },
            {
                "Id": "ad2ce0f3d1a944c4b6d8f0a81234567890abcdef1234567890abcdef123456",
                "Image": "redis:7.2",
                "Command": '"docker-entrypoint.sh redis-server"',
                "Created": 1719298800,
                "State": "running",
                "Status": "Up 3 days",
                "Names": ["/cache"],
            },
        ]).encode()
        return _http_response("200 OK", body, headers={"Api-Version": "1.45"})
    if method == "POST" and "/containers/create" in path:
        body = json.dumps({
            "Id": "7c9de711234567890abcdef1234567890abcdef1234567890abcdef1234567",
            "Warnings": [],
        }).encode()
        return _http_response("201 Created", body, headers={"Api-Version": "1.45"})
    return _http_response("404 Not Found", b'{"message":"page not found"}')


def es_response(path: str) -> bytes:
    if path in ("/", ""):
        body = json.dumps({
            "name": "es-data-01",
            "cluster_name": "prod-search",
            "cluster_uuid": "k8Y2wHfYQz2A1B9mD4xN5Q",
            "version": {"number": "8.13.4", "lucene_version": "9.10.0"},
            "tagline": "You Know, for Search",
        }).encode()
        return _http_response("200 OK", body)
    if path.startswith("/_cluster/health"):
        body = json.dumps({
            "cluster_name": "prod-search",
            "status": "green",
            "number_of_nodes": 3,
            "number_of_data_nodes": 2,
            "active_primary_shards": 16,
            "active_shards": 32,
        }).encode()
        return _http_response("200 OK", body)
    if path.startswith("/_cat/indices"):
        today = datetime.now(timezone.utc).strftime("%Y.%m.%d")
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y.%m.%d")
        docs_today = random.randint(38000, 48000)
        docs_yday = random.randint(85000, 95000)
        size_today = f"{random.randint(25, 32)}.{random.randint(1, 9)}mb"
        size_yday = f"{random.randint(60, 80)}.{random.randint(1, 9)}mb"
        body = (
            f"green open logs-prod-{today}  8YxR7k31Q6WwN3cA2t7wQg 1 1 {docs_today}  0 {size_today} {size_today}\n"
            f"green open logs-prod-{yesterday} 9JmN6b20E5VuM2bF1s6vPf 1 1 {docs_yday} 0 {size_yday} {size_yday}\n"
        ).encode()
        return _http_response("200 OK", body, content_type="text/plain; charset=utf-8")
    if path.startswith("/_search"):
        body = json.dumps({
            "took": 4,
            "timed_out": False,
            "_shards": {"total": 1, "successful": 1, "skipped": 0, "failed": 0},
            "hits": {"total": {"value": 0, "relation": "eq"}, "hits": []},
        }).encode()
        return _http_response("200 OK", body)
    return _http_response("404 Not Found", b'{"error":"resource_not_found_exception","status":404}')


def web_panel_response(port: int, path: str) -> bytes:
    panel_title = PANEL_TITLE
    panel_org = PANEL_ORG
    if port == 9090:
        server = "Cockpit/295"
        body = (
            "<!DOCTYPE html><html><head><title>Cockpit</title></head>"
            "<body><div id='brand'>Cockpit</div><form>"
            "<input name='username' /><input name='password' type='password' />"
            "</form></body></html>"
        ).encode()
    else:
        server = "nginx/1.24.0"
        body = (
            f"<!DOCTYPE html><html><head><title>{panel_title}</title></head>"
            f"<body><h1>{panel_org}</h1><p>Status: nominal</p>"
            "<form><input name='username' /><input name='password' type='password' /></form>"
            "</body></html>"
        ).encode()
    if path.startswith("/api/health"):
        return _http_response("200 OK", b'{"status":"ok"}', headers={"Server": server})
    return _http_response("200 OK", body, content_type="text/html; charset=utf-8", headers={"Server": server})
