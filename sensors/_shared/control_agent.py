#!/usr/bin/env python3
"""Shared sensor control-plane agent — canonical copy (see ingest.py.template
for the copy-don't-import convention this follows).

Connects to ingest-api's /sensors/control/ws, completes the v1 hello
handshake, answers server pings, and dispatches incoming `command` messages
to handlers registered via `agent.action("name", fn)`. Reports
ack -> succeeded/failed for each command. Runs its own reconnect loop with
backoff+jitter in a daemon thread — call `.start()` once and forget it.

No-ops entirely when SENSOR_CONTROL_SECRET is unset, so a sensor that hasn't
been issued a control credential yet (or one that doesn't want remote
control) is unaffected — same opt-in shape as the rest of the beacon.

Deliberately synchronous (websockets.sync.client), matching the thread-based
style already used by heartbeat.py's config-poll loop — no asyncio elsewhere
in these sensors.
"""
import json
import os
import random
import threading
import time
import uuid
from datetime import datetime, timezone

from websockets.sync.client import connect
from websockets.exceptions import WebSocketException

PROTOCOL_VERSION = 1
MAX_BACKOFF_SECONDS = 60
# Commands carry a 60s server-side TTL; a duplicate delivered after that has
# already expired server-side, so dedup entries older than this are inert
# and safe to drop.
DEDUP_WINDOW_SECONDS = 120


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
    def __init__(self, *, ingest_url: str, sensor_id: str, secret: str, agent_version: str):
        self._ws_url = ingest_url.replace("http", "ws", 1) + "/sensors/control/ws"
        self._sensor_id = sensor_id
        self._secret = secret
        self._agent_version = agent_version
        self._handlers: dict[str, callable] = {}
        self._seen: dict[str, float] = {}
        self.stats = {"connects": 0, "commands": 0, "errors": 0}

    def action(self, name: str):
        """Decorator: register a zero-arg handler that returns a result dict
        (or raises, which is reported as command.result status=failed)."""
        def register(fn):
            self._handlers[name] = fn
            return fn
        return register

    def start(self) -> None:
        if not self._secret:
            print("[control] SENSOR_CONTROL_SECRET not set, control plane disabled", flush=True)
            return
        threading.Thread(target=self._run_forever, daemon=True).start()

    def _run_forever(self) -> None:
        attempt = 0
        while True:
            try:
                if self._connect_once():
                    attempt = 0  # clean auth+session: don't punish the next attempt
            except (WebSocketException, OSError) as exc:
                self.stats["errors"] += 1
                print(f"[control] connection error: {exc}", flush=True)
            attempt += 1
            delay = min(MAX_BACKOFF_SECONDS, 2 ** min(attempt, 6)) + random.uniform(0, 1)
            time.sleep(delay)

    def _connect_once(self) -> bool:
        headers = {"X-Sensor-Id": self._sensor_id, "X-Sensor-Control-Secret": self._secret}
        with connect(self._ws_url, additional_headers=headers, open_timeout=10) as ws:
            self.stats["connects"] += 1
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
                    print(f"[control] connected as {self._sensor_id}", flush=True)
                    continue
                if msg["type"] == "ping":
                    ws.send(json.dumps(_envelope("pong", pingMessageId=msg["messageId"])))
                    continue
                if msg["type"] == "command":
                    self._handle_command(ws, msg)
            return authenticated

    def _handle_command(self, ws, msg: dict) -> None:
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
            ws.send(json.dumps(_envelope(
                "command.ack", commandId=command_id, sensorId=self._sensor_id, accepted=False,
                error={"code": "UNSUPPORTED_ACTION", "message": f"no handler for {action}", "retryable": False},
            )))
            return

        ws.send(json.dumps(_envelope(
            "command.ack", commandId=command_id, sensorId=self._sensor_id, accepted=True,
        )))
        self.stats["commands"] += 1
        try:
            result = handler()
            ws.send(json.dumps(_envelope(
                "command.result", commandId=command_id, sensorId=self._sensor_id,
                status="succeeded", result=result,
            )))
        except Exception as exc:
            self.stats["errors"] += 1
            ws.send(json.dumps(_envelope(
                "command.result", commandId=command_id, sensorId=self._sensor_id,
                status="failed",
                error={"code": "HANDLER_ERROR", "message": str(exc)[:500], "retryable": True},
            )))
