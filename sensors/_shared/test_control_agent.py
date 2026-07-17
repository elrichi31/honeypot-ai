#!/usr/bin/env python3
"""Self-check for ControlAgent.fetch_config — run: python test_control_agent.py

Guards the regression that motivated centralizing it: five of the six per-sensor
copies had silently dropped the X-Ingest-Token header, which went unnoticed
because GET /sensors/:id/config wasn't enforcing it either.
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from control_agent import ControlAgent

received = {}


class Handler(BaseHTTPRequestHandler):
    status = 200

    def do_GET(self):
        received["path"] = self.path
        received["token"] = self.headers.get("X-Ingest-Token")
        self.send_response(self.status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({
            "config": {"banner": "220 test"},
            "configHash": "hash-abc",
        }).encode())

    def log_message(self, *args):
        pass


def serve():
    httpd = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def agent_for(port):
    return ControlAgent(
        ingest_url=f"http://127.0.0.1:{port}", sensor_id="ftp-test-1",
        secret="", agent_version="test/1.0", ingest_token="tok-123",
    )


def main():
    httpd, port = serve()

    Handler.status = 200
    assert agent_for(port).fetch_config() == ({"banner": "220 test"}, "hash-abc")
    assert received["token"] == "tok-123", f"auth header not sent: {received['token']!r}"
    assert received["path"] == "/sensors/ftp-test-1/config", received["path"]

    # A trailing slash on INGEST_API_URL must not produce a double slash.
    ControlAgent(
        ingest_url=f"http://127.0.0.1:{port}/", sensor_id="ftp-test-1",
        secret="", agent_version="test/1.0", ingest_token="tok-123",
    ).fetch_config()
    assert received["path"] == "/sensors/ftp-test-1/config", received["path"]

    Handler.status = 500
    assert agent_for(port).fetch_config() is None, "HTTP error must return None, not raise"

    httpd.shutdown()
    print("ok")


if __name__ == "__main__":
    main()
