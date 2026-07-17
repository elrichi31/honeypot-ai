#!/usr/bin/env python3
"""Self-check for ControlAgent.fetch_config and _ensure_secret — run:
python test_control_agent.py

fetch_config guards the regression that motivated centralizing it: five of
the six per-sensor copies had silently dropped the X-Ingest-Token header,
which went unnoticed because GET /sensors/:id/config wasn't enforcing it
either.

_ensure_secret guards the Rebanada 8h auto-enroll precedence (env > file >
enroll > disabled) — the exact bug class that left port-01/smb-01 stuck
"Control · disconnected" in prod would resurface if this order regressed.
"""
import json
import os
import shutil
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from control_agent import ControlAgent

received = {}


class Handler(BaseHTTPRequestHandler):
    status = 200
    enroll_secret = "enrolled-secret-xyz"

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

    def do_POST(self):
        received["path"] = self.path
        received["ingest_token"] = self.headers.get("X-Ingest-Token")
        received["sensor_id"] = self.headers.get("X-Sensor-Id")
        self.send_response(self.status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        if self.status == 201:
            self.wfile.write(json.dumps({
                "sensorId": received["sensor_id"],
                "secret": self.enroll_secret,
                "secretPrefix": self.enroll_secret[:8],
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
    Handler.status = 201

    tmpdir = tempfile.mkdtemp()
    try:
        secret_file = os.path.join(tmpdir, "sub", "control-secret")

        # env secret wins even if a file/enroll would also be available.
        env_agent = ControlAgent(
            ingest_url=f"http://127.0.0.1:{port}", sensor_id="test-1",
            secret="env-secret", agent_version="test/1.0",
            ingest_token="tok-123", secret_file=secret_file,
        )
        assert env_agent._ensure_secret() is True
        assert env_agent._secret == "env-secret"
        assert not os.path.exists(secret_file), "env secret must not be persisted to the enroll file"

        # persisted file wins over enroll when no env secret is set.
        os.makedirs(os.path.dirname(secret_file), exist_ok=True)
        with open(secret_file, "w") as f:
            f.write("file-secret\n")
        file_agent = ControlAgent(
            ingest_url=f"http://127.0.0.1:{port}", sensor_id="test-1",
            secret="", agent_version="test/1.0",
            ingest_token="tok-123", secret_file=secret_file,
        )
        received.pop("path", None)
        assert file_agent._ensure_secret() is True
        assert file_agent._secret == "file-secret"
        assert "path" not in received, "must not call enroll when a persisted file exists"
        os.remove(secret_file)

        # no env, no file -> enrolls, and persists the result atomically.
        enroll_agent = ControlAgent(
            ingest_url=f"http://127.0.0.1:{port}", sensor_id="test-1",
            secret="", agent_version="test/1.0",
            ingest_token="tok-123", secret_file=secret_file,
        )
        assert enroll_agent._ensure_secret() is True
        assert enroll_agent._secret == Handler.enroll_secret
        assert received["path"] == "/sensors/control/enroll"
        assert received["ingest_token"] == "tok-123"
        assert received["sensor_id"] == "test-1"
        with open(secret_file) as f:
            assert f.read() == Handler.enroll_secret
        os.remove(secret_file)

        # no env, no file, no ingest_token -> nothing to resolve with.
        disabled_agent = ControlAgent(
            ingest_url=f"http://127.0.0.1:{port}", sensor_id="test-1",
            secret="", agent_version="test/1.0",
            ingest_token="", secret_file=secret_file,
        )
        assert disabled_agent._ensure_secret() is False

        # enroll failure (sensor row doesn't exist yet) -> resolves to False,
        # retryable by the caller's backoff loop, nothing persisted.
        Handler.status = 404
        retry_agent = ControlAgent(
            ingest_url=f"http://127.0.0.1:{port}", sensor_id="test-1",
            secret="", agent_version="test/1.0",
            ingest_token="tok-123", secret_file=secret_file,
        )
        assert retry_agent._ensure_secret() is False
        assert not os.path.exists(secret_file)
    finally:
        shutil.rmtree(tmpdir)

    httpd.shutdown()
    print("ok")


if __name__ == "__main__":
    main()
