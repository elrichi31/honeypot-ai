import asyncio
from typing import Any

from ..http_emulation import parse_http_request, docker_response, es_response, web_panel_response
from ..config import SERVICES

_MAX_KEEPALIVE_REQUESTS = 10


async def handle_httpish(reader, writer, src_ip, src_port, port, send_fn):
    raw = b""
    extra: dict[str, Any] = {"protocolName": SERVICES.get(port, "http")}
    event_type = "connect"
    username = None
    password = None
    request_count = 0

    try:
        while request_count < _MAX_KEEPALIVE_REQUESTS:
            try:
                chunk = await asyncio.wait_for(reader.read(8192), timeout=5)
            except asyncio.TimeoutError:
                break
            if not chunk:
                break
            raw += chunk

            # Wait for a complete HTTP request (headers terminated by \r\n\r\n)
            if b"\r\n\r\n" not in raw:
                continue

            req = parse_http_request(raw)
            raw = b""  # reset for next request
            request_count += 1

            method = req["method"] or "GET"
            path = req["path"] or "/"
            headers = req["headers"]
            extra.update({
                "httpMethod": method,
                "httpPath": path[:200],
                "userAgent": headers.get("user-agent", ""),
                "hostHeader": headers.get("host", ""),
            })

            auth = headers.get("authorization", "")
            if auth:
                event_type = "auth"
                username = auth[:160]
                extra["authorizationHeader"] = auth[:200]

            if port == 2375:
                response = docker_response(method, path)
            elif port == 9200:
                response = es_response(path)
            else:
                response = web_panel_response(port, path)

            # Rewrite Connection: close → keep-alive for ES and Docker
            if port in (2375, 9200):
                response = response.replace(b"Connection: close", b"Connection: keep-alive", 1)

            writer.write(response)
            await writer.drain()

            # Stop on Connection: close or non-keep-alive client
            conn_hdr = headers.get("connection", "").lower()
            if conn_hdr == "close" or port not in (2375, 9200):
                break

    except (asyncio.TimeoutError, Exception):
        pass

    await asyncio.get_event_loop().run_in_executor(
        None, send_fn, src_ip, src_port, port, "", event_type, username, password, extra
    )
