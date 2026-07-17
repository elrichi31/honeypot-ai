#!/usr/bin/env python3
"""Shared sensor control-plane agent — canonical copy (see ingest.py.template
for the copy-don't-import convention this follows).

Connects to ingest-api's /sensors/control/ws, completes the v1 hello
handshake, answers server pings, and dispatches incoming `command` messages
to handlers registered via `agent.action("name", fn)`. Runs its own
reconnect loop with backoff+jitter in a daemon thread — call `.start()` once
and forget it.

Handlers take one arg, `report_running()`, and either return a result dict
(reported as command.result status=succeeded), return None (no
command.result is sent at all — the caller confirms success some other way,
e.g. config.apply's next heartbeat carrying the new configHash), or raise
(reported as command.result status=failed).

config.apply handlers get the pending config via `agent.fetch_config()` —
one authenticated implementation for every sensor, rather than a copy per
app.py that can (and did) drift out of sync on the auth header.

Rebanada 6 (docs/plans/SENSOR_REMOTE_CONTROL.md): when the WS connection is
down, a second daemon thread polls GET /sensors/control/poll and reports
back via POST /sensors/control/report instead — same handlers, same dedup
set, same envelope. Dispatch is transport-agnostic (`_dispatch_command`
takes a `send_fn`, not a socket), so both paths share one code path. The
server-side CAS on markSent (whichever transport claims a queued command
first) is what stops WS and HTTP from ever running the same command twice —
no separate lease state needed here.

No-ops entirely when SENSOR_CONTROL_SECRET is unset, no secret file is
present, and no ingest_token is available for auto-enrollment — so a sensor
that hasn't been issued a control credential yet (or one that doesn't want
remote control) is unaffected — same opt-in shape as the rest of the beacon.

Rebanada 8h (docs/plans/SENSOR_REMOTE_CONTROL.md): if no secret is configured
via env or persisted file, the agent trades its already-baked-in
ingest_token for a per-sensor credential via POST /sensors/control/enroll,
and persists it to secret_file so future restarts reuse it instead of
re-enrolling. Precedence: env secret > persisted file > enroll > disabled.

Deliberately synchronous (websockets.sync.client for the WS half, urllib for
the HTTP half), matching the thread-based style already used by
heartbeat.py's config-poll loop — no asyncio elsewhere in these sensors.
"""
import json
import os
import random
import threading
import time
import uuid
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.request import Request, urlopen

from websockets.sync.client import connect
from websockets.exceptions import WebSocketException

PROTOCOL_VERSION = 1
MAX_BACKOFF_SECONDS = 60
# Commands carry a 60s (status.get) to 90s (config.apply) server-side TTL; a
# duplicate delivered after that has already expired server-side, so dedup
# entries older than this are inert and safe to drop.
DEDUP_WINDOW_SECONDS = 120
POLL_INTERVAL_SECONDS = 15
POLL_MAX_BACKOFF_SECONDS = 60
# While the WS is up it delivers everything instantly; the poll loop just
# idles at this cadence instead of hammering the endpoint for nothing.
POLL_IDLE_SECONDS = 5


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _envelope(msg_type: str, **fields) -> dict:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "messageId": str(uuid.uuid4()),
        "sentAt": _now_iso(),
        "type": msg_type,
        **fields,
    }


class ControlAgent:
    def __init__(self, *, ingest_url: str, sensor_id: str, secret: str, agent_version: str,
                 ingest_token: str = "", secret_file: str = ""):
        self._http_url = ingest_url.rstrip("/")
        self._ws_url = ingest_url.replace("http", "ws", 1) + "/sensors/control/ws"
        self._sensor_id = sensor_id
        self._secret = secret
        self._ingest_token = ingest_token
        self._secret_file = secret_file
        self._agent_version = agent_version
        self._handlers: dict[str, callable] = {}
        self._seen: dict[str, float] = {}
        self._ws_connected = False
        self.stats = {"connects": 0, "commands": 0, "errors": 0, "http_polls": 0}

    def action(self, name: str):
        """Decorator: register a handler — see module docstring for its
        (report_running) -> dict | None contract."""
        def register(fn):
            self._handlers[name] = fn
            return fn
        return register

    def start(self) -> None:
        if not self._secret and not self._secret_file and not self._ingest_token:
            print("[control] no control secret source configured, control plane disabled", flush=True)
            return
        threading.Thread(target=self._run_forever, daemon=True).start()
        threading.Thread(target=self._poll_forever, daemon=True).start()

    # --- Secret resolution (Rebanada 8h) -----------------------------------
    # Called from _run_forever's retry loop (not start()) so a 404 from
    # enroll — the sensor's own heartbeat hasn't created its row yet — is
    # just another connection failure the existing backoff already handles.

    def _ensure_secret(self) -> bool:
        if self._secret:
            return True
        if self._secret_file:
            persisted = self._read_secret_file()
            if persisted:
                self._secret = persisted
                return True
        if self._ingest_token:
            enrolled = self._enroll()
            if enrolled:
                self._secret = enrolled
                if self._secret_file:
                    self._write_secret_file(enrolled)
                return True
        return False

    def _enroll(self) -> str:
        try:
            req = Request(
                f"{self._http_url}/sensors/control/enroll",
                data=b"{}",
                headers={
                    "Content-Type": "application/json",
                    "X-Ingest-Token": self._ingest_token,
                    "X-Sensor-Id": self._sensor_id,
                },
                method="POST",
            )
            with urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            secret = data.get("secret", "")
            if secret:
                print(f"[control] auto-enrolled {self._sensor_id}", flush=True)
            return secret
        except Exception as exc:
            print(f"[control] enroll error: {exc}", flush=True)
            return ""

    def _read_secret_file(self) -> str:
        try:
            with open(self._secret_file) as f:
                return f.read().strip()
        except Exception:
            return ""

    def _write_secret_file(self, secret: str) -> None:
        try:
            os.makedirs(os.path.dirname(self._secret_file), exist_ok=True)
            tmp = f"{self._secret_file}.tmp{os.getpid()}"
            with open(tmp, "w") as f:
                f.write(secret)
            os.replace(tmp, self._secret_file)
        except Exception as exc:
            print(f"[control] secret persist error: {exc}", flush=True)

    # --- Config fetch -----------------------------------------------------

    def fetch_config(self) -> tuple[dict, str] | None:
        """Return this sensor's (config, configHash), or None on error.

        Authenticated with the ingest token, not SENSOR_CONTROL_SECRET: the
        config endpoints predate the control plane and gate on X-Ingest-Token.
        """
        try:
            req = Request(
                f"{self._http_url}/sensors/{self._sensor_id}/config",
                headers={"X-Ingest-Token": self._ingest_token},
            )
            with urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read())
            return data.get("config", {}), data.get("configHash", "")
        except Exception as exc:
            print(f"[control] config fetch error: {exc}", flush=True)
            return None

    # --- WebSocket transport --------------------------------------------

    def _run_forever(self) -> None:
        attempt = 0
        while True:
            try:
                if not self._ensure_secret():
                    raise OSError("control secret unavailable (no env, file, or successful enroll)")
                if self._connect_once():
                    attempt = 0  # clean auth+session: don't punish the next attempt
            except (WebSocketException, OSError) as exc:
                self.stats["errors"] += 1
                print(f"[control] connection error: {exc}", flush=True)
            finally:
                self._ws_connected = False
            attempt += 1
            delay = min(MAX_BACKOFF_SECONDS, 2 ** min(attempt, 6)) + random.uniform(0, 1)
            time.sleep(delay)

    def _connect_once(self) -> bool:
        headers = {"X-Sensor-Id": self._sensor_id, "X-Sensor-Control-Secret": self._secret}
        with connect(self._ws_url, additional_headers=headers, open_timeout=10) as ws:
            self.stats["connects"] += 1
            send_fn = lambda message: ws.send(json.dumps(message))  # noqa: E731
            ws.send(json.dumps(_envelope(
                "hello",
                sensorId=self._sensor_id,
                agentVersion=self._agent_version,
                capabilities=list(self._handlers.keys()),
                configHash=None,
            )))
            authenticated = False
            for raw in ws:
                msg = json.loads(raw)
                if msg["type"] == "hello.rejected":
                    print(f"[control] hello rejected: {msg.get('error')}", flush=True)
                    return False
                if msg["type"] == "hello.accepted":
                    authenticated = True
                    self._ws_connected = True
                    print(f"[control] connected as {self._sensor_id}", flush=True)
                    continue
                if msg["type"] == "ping":
                    ws.send(json.dumps(_envelope("pong", pingMessageId=msg["messageId"])))
                    continue
                if msg["type"] == "command":
                    self._dispatch_command(msg, send_fn)
            return authenticated

    # --- HTTP fallback poll (Rebanada 6) ---------------------------------
    # Only does real work while the WS is down — see module docstring.

    def _poll_forever(self) -> None:
        attempt = 0
        while True:
            if self._ws_connected:
                time.sleep(POLL_IDLE_SECONDS)
                attempt = 0
                continue
            try:
                self._poll_once()
                attempt = 0
            except (URLError, OSError, ValueError) as exc:
                self.stats["errors"] += 1
                print(f"[control-http] poll error: {exc}", flush=True)
                attempt += 1
            delay = POLL_INTERVAL_SECONDS
            if attempt > 0:
                delay = min(POLL_MAX_BACKOFF_SECONDS, POLL_INTERVAL_SECONDS * 2 ** min(attempt, 4))
            time.sleep(delay + random.uniform(0, 1))

    def _poll_once(self) -> None:
        req = Request(
            f"{self._http_url}/sensors/control/poll",
            headers={"X-Sensor-Id": self._sensor_id, "X-Sensor-Control-Secret": self._secret},
        )
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        self.stats["http_polls"] += 1
        for msg in data.get("commands", []):
            self._dispatch_command(msg, self._http_send)

    def _http_send(self, message: dict) -> None:
        body = json.dumps(message).encode()
        req = Request(
            f"{self._http_url}/sensors/control/report",
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Sensor-Id": self._sensor_id,
                "X-Sensor-Control-Secret": self._secret,
            },
            method="POST",
        )
        try:
            urlopen(req, timeout=10)
        except Exception as exc:
            print(f"[control-http] report send failed: {exc}", flush=True)

    # --- Shared dispatch --------------------------------------------------
    # Transport-agnostic: send_fn just needs to accept a dict and deliver it
    # (over the socket, or as an HTTP POST). Same dedup set for both, so a
    # command that raced across transports is only ever processed once.

    def _dispatch_command(self, msg: dict, send_fn) -> None:
        command_id = msg["commandId"]
        action = msg["action"]

        now = time.monotonic()
        self._seen = {k: v for k, v in self._seen.items() if now - v < DEDUP_WINDOW_SECONDS}
        if command_id in self._seen:
            print(f"[control] duplicate command {command_id}, ignoring", flush=True)
            return
        self._seen[command_id] = now

        handler = self._handlers.get(action)
        if handler is None:
            send_fn(_envelope(
                "command.ack", commandId=command_id, sensorId=self._sensor_id, accepted=False,
                error={"code": "UNSUPPORTED_ACTION", "message": f"no handler for {action}", "retryable": False},
            ))
            return

        send_fn(_envelope("command.ack", commandId=command_id, sensorId=self._sensor_id, accepted=True))
        self.stats["commands"] += 1

        def report_running():
            send_fn(_envelope("command.running", commandId=command_id, sensorId=self._sensor_id))

        try:
            result = handler(report_running)
            if result is not None:
                send_fn(_envelope(
                    "command.result", commandId=command_id, sensorId=self._sensor_id,
                    status="succeeded", result=result,
                ))
        except Exception as exc:
            self.stats["errors"] += 1
            send_fn(_envelope(
                "command.result", commandId=command_id, sensorId=self._sensor_id,
                status="failed",
                error={"code": "HANDLER_ERROR", "message": str(exc)[:500], "retryable": True},
            ))
