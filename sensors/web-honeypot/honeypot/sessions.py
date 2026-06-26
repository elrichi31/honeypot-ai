"""Per-IP session tracker — pure in-memory, no external deps."""

import threading
import time
from collections import deque

_SESSION_TTL_S     = 1800
_MAX_IPS           = 8_000
_MAX_PATHS_PER_IP  = 50
_SESSION_LOCK      = threading.Lock()
_IP_SESSIONS: dict[str, dict] = {}


def _session_get_or_create(ip: str) -> dict:
    now = time.monotonic()
    sess = _IP_SESSIONS.get(ip)
    if sess is None or (now - sess["last_seen"]) > _SESSION_TTL_S:
        sess = {
            "first_seen":   now,
            "last_seen":    now,
            "hits":         0,
            "paths":        deque(maxlen=_MAX_PATHS_PER_IP),
            "attack_types": set(),
            "canary_hits":  0,
        }
        if len(_IP_SESSIONS) >= _MAX_IPS:
            oldest = min(_IP_SESSIONS, key=lambda k: _IP_SESSIONS[k]["last_seen"])
            del _IP_SESSIONS[oldest]
        _IP_SESSIONS[ip] = sess
    return sess


def update_session(ip: str, path: str, attack_type: str, canary: bool) -> dict:
    with _SESSION_LOCK:
        sess = _session_get_or_create(ip)
        now  = time.monotonic()
        sess["hits"]        += 1
        sess["last_seen"]    = now
        sess["paths"].append(path)
        sess["attack_types"].add(attack_type)
        if canary:
            sess["canary_hits"] += 1

        elapsed = now - sess["first_seen"]
        return {
            "sessionHits":      sess["hits"],
            "sessionElapsedS":  round(elapsed, 1),
            "pathsVisited":     list(sess["paths"]),
            "attackTypes":      list(sess["attack_types"]),
            "canaryHitsTotal":  sess["canary_hits"],
            "isChainAttack":    (
                sess["hits"] > 1
                and attack_type not in ("recon", "scanner", "info_disclosure")
                and any(t in sess["attack_types"] - {attack_type}
                        for t in ("recon", "scanner", "info_disclosure"))
            ),
        }
