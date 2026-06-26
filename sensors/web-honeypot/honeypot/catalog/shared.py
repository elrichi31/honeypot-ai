"""Shared helpers used by all catalog modules."""

import hashlib
import hmac
import secrets
from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qs

from flask import g
from jinja2 import Environment, FileSystemLoader, select_autoescape

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # sensors/web-honeypot/
TEMPLATES_DIR = BASE_DIR / "templates"
PAYLOADS_DIR = BASE_DIR / "payloads"

_CANARY_DB_USER = "techcorp_app"
_CANARY_DB_PASSWORD = "Tc0rp!db_Pr0d_2024"

_HONEYTOKEN_SECRET = secrets.token_bytes(32)

_template_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(("html", "xml")),
    trim_blocks=True,
    lstrip_blocks=True,
)


def _ip_token(ip: str, length: int = 24) -> str:
    mac = hmac.new(_HONEYTOKEN_SECRET, ip.encode(), hashlib.sha256)
    return mac.hexdigest()[:length]


def _canary_password(ip: str) -> str:
    return f"tc-{_ip_token(ip)}"


def _check_canary(user: str, password: str) -> None:
    from flask import request
    ip = request.remote_addr or "unknown"
    ip_pwd = _canary_password(ip)
    if user == _CANARY_DB_USER and password in (ip_pwd, _CANARY_DB_PASSWORD):
        g.canary_triggered = True
        g.canary_credential = _CANARY_DB_USER
        g.canary_token_type = "ip_specific" if password == ip_pwd else "static"


def _parse_form(raw: str) -> dict[str, str]:
    parsed = parse_qs(raw or "", keep_blank_values=True)
    return {k: v[0] if v else "" for k, v in parsed.items()}


@lru_cache(maxsize=None)
def _load_payload(relative_path: str) -> str:
    return (PAYLOADS_DIR / relative_path).read_text(encoding="utf-8")


@lru_cache(maxsize=None)
def _get_template(name: str):
    return _template_env.get_template(name)


def _render(name: str, **ctx) -> str:
    return _get_template(name).render(**ctx)


def _payload(path: str, ctype: str, code: int = 200) -> tuple[str, str, int]:
    return (_load_payload(path), ctype, code)
