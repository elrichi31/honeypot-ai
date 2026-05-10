"""
Response builders for the web honeypot.

Routing logic and small dynamic decisions live here; templates and static
payloads live on disk so the honeypot is easy to extend.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Callable
from urllib.parse import parse_qs

from flask import session
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup, escape

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
PAYLOADS_DIR = BASE_DIR / "payloads"

_template_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(("html", "xml")),
    trim_blocks=True,
    lstrip_blocks=True,
)


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


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

def _homepage(_m, _q, _b) -> tuple[str, str, int]:
    return (_render("site/homepage.html"), "text/html", 200)


def _robots(_m, _q, _b) -> tuple[str, str, int]:
    return _payload("seo/robots.txt", "text/plain")


def _sitemap(_m, _q, _b) -> tuple[str, str, int]:
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        "  <url><loc>https://example.com/</loc><priority>1.0</priority></url>\n"
        "  <url><loc>https://example.com/about</loc></url>\n"
        "  <url><loc>https://example.com/contact</loc></url>\n"
        "  <url><loc>https://example.com/blog</loc></url>\n"
        "</urlset>"
    )
    return (xml, "application/xml", 200)


def _security_txt(_m, _q, _b) -> tuple[str, str, int]:
    txt = (
        "Contact: mailto:security@example.com\n"
        "Expires: 2026-01-01T00:00:00.000Z\n"
        "Preferred-Languages: en\n"
        "Canonical: https://example.com/.well-known/security.txt\n"
    )
    return (txt, "text/plain", 200)


def _xmlrpc(method: str, _q, _b) -> tuple[str, str, int]:
    if method == "POST":
        return _payload("api/xmlrpc_fault.xml", "text/xml")
    return ("<html><body><p>XML-RPC server accepts POST requests only.</p></body></html>", "text/html", 405)


def _wp_login(method: str, query: str, body: str) -> tuple[str, str, int]:
    qp = _parse_form(query)
    fd = _parse_form(body)

    if qp.get("action") == "lostpassword":
        notice: Markup | str = ""
        if method == "POST":
            notice = Markup(
                '<div class="message">If an account matches the supplied details, '
                "a password reset email has been sent to the address on file.</div>"
            )
        return (_render("wordpress/lost_password.html", submitted_user=fd.get("user_login", ""), notice_html=notice), "text/html", 200)

    if method == "POST":
        user = fd.get("log", "")
        pwd = fd.get("pwd", "")
        session["wp_last_user"] = user  # remember across requests
        if not user:
            msg = Markup("The username field is empty.")
        elif not pwd:
            msg = Markup("The password field is empty.")
        elif "@" in user:
            msg = Markup(f"The password you entered for the email address <strong>{escape(user)}</strong> is incorrect. "
                         '<a href="/wp-login.php?action=lostpassword">Lost your password?</a>')
        else:
            msg = Markup(f"The password you entered for the username <strong>{escape(user)}</strong> is incorrect. "
                         '<a href="/wp-login.php?action=lostpassword">Lost your password?</a>')
        notice = Markup(f'<div id="login_error"><strong>Error</strong>: {msg}</div>')
        return (_render("wordpress/login.html", submitted_user=user, notice_html=notice), "text/html", 200)

    last_user = session.get("wp_last_user", "")
    return (_render("wordpress/login.html", submitted_user=last_user, notice_html=""), "text/html", 200)


def _wp_config(_m, _q, _b) -> tuple[str, str, int]:
    return _payload("config/wp_config.php", "application/x-httpd-php")


def _wp_json_users(_m, _q, _b) -> tuple[str, str, int]:
    users = [{"id": 1, "name": "admin", "slug": "admin", "link": "https://example.com/author/admin/",
              "avatar_urls": {"24": "https://secure.gravatar.com/avatar/?d=mm&s=24"}}]
    return (json.dumps(users), "application/json", 200)


def _wp_json_posts(_m, _q, _b) -> tuple[str, str, int]:
    posts = [{"id": 1, "date": "2024-11-14T08:32:17", "slug": "hello-world", "status": "publish",
              "type": "post", "link": "https://example.com/hello-world/",
              "title": {"rendered": "Hello world!"}, "author": 1}]
    return (json.dumps(posts), "application/json", 200)


def _env(_m, _q, _b) -> tuple[str, str, int]:
    return _payload("config/env.txt", "text/plain")


def _git_config(_m, _q, _b) -> tuple[str, str, int]:
    return _payload("config/git_config.txt", "text/plain")


def _htaccess(_m, _q, _b) -> tuple[str, str, int]:
    return _payload("config/htaccess.txt", "text/plain")


def _phpinfo(_m, _q, _b) -> tuple[str, str, int]:
    return (_render("system/phpinfo.html"), "text/html", 200)


def _admin(method: str, _q, body: str) -> tuple[str, str, int]:
    fd = _parse_form(body)
    if method == "POST":
        user = fd.get("username", "") or fd.get("email", "")
        session["admin_last_user"] = user
        if user:
            notice = Markup(f'<div class="alert-error">Authentication failed for <strong>{escape(user)}</strong>. '
                            "Verify your credentials or contact the service desk.</div>")
        else:
            notice = Markup('<div class="alert-error">Authentication failed. Enter your username and password to continue.</div>')
        return (_render("admin/login.html", submitted_user=user, notice_html=notice), "text/html", 200)
    last_user = session.get("admin_last_user", "")
    return (_render("admin/login.html", submitted_user=last_user, notice_html=""), "text/html", 200)


def _phpmyadmin(method: str, _q, body: str) -> tuple[str, str, int]:
    fd = _parse_form(body)
    user = fd.get("pma_username", "") or session.get("pma_last_user", "")
    server = fd.get("server", "1")
    server_name = "db-replica.internal" if server == "2" else "db-primary.internal"
    if method == "POST":
        session["pma_last_user"] = user
        login = escape(user or "anonymous")
        notice = Markup(f'<div class="alert"><strong>Cannot log in to the MySQL server</strong><br>'
                        f"mysqli::real_connect(): (HY000/1045): Access denied for user "
                        f"&#39;{login}&#39;@&#39;localhost&#39; (using password: YES)</div>")
        return (_render("phpmyadmin/login.html", submitted_user=user, selected_server=server,
                        server_name=server_name, notice_html=notice), "text/html", 200)
    return (_render("phpmyadmin/login.html", submitted_user=user, selected_server=server,
                    server_name=server_name, notice_html=""), "text/html", 200)


def _server_status(_m, _q, _b) -> tuple[str, str, int]:
    return (_render("system/server_status.html"), "text/html", 200)


def _sql_dump(_m, _q, _b) -> tuple[str, str, int]:
    return _payload("dumps/sql_dump.sql", "text/plain")


def _api_auth_required(_m, _q, _b) -> tuple[str, str, int]:
    body = json.dumps({"error": "Unauthorized", "message": "Authentication credentials were not provided.", "status": 401})
    return (body, "application/json", 401)


def _forbidden(_m, _q, _b) -> tuple[str, str, int]:
    return (_render("errors/403.html"), "text/html", 403)


def _mysql_error(_m, _q, _b) -> tuple[str, str, int]:
    return (_render("errors/mysql_error.html"), "text/html", 500)


def _not_found(_m, _q, _b) -> tuple[str, str, int]:
    return (_render("errors/404.html"), "text/html", 404)


# ---------------------------------------------------------------------------
# Route table — first prefix match wins
# ---------------------------------------------------------------------------

ROUTE_TABLE: list[tuple[str, Callable[[str, str, str], tuple[str, str, int]]]] = [
    ("/", _homepage),
    ("/robots.txt", _robots),
    ("/sitemap.xml", _sitemap),
    ("/.well-known/security.txt", _security_txt),
    ("/xmlrpc.php", _xmlrpc),
    ("/wp-login.php", _wp_login),
    ("/wp-admin", _wp_login),
    ("/wordpress/wp-login", _wp_login),
    ("/wp-config.php", _wp_config),
    ("/wp-json/wp/v2/users", _wp_json_users),
    ("/wp-json/wp/v2/posts", _wp_json_posts),
    ("/wp-json/", _api_auth_required),
    ("/.env", _env),
    ("/.git/", _git_config),
    ("/.htaccess", _htaccess),
    ("/server-status", _server_status),
    ("/info.php", _phpinfo),
    ("/phpinfo.php", _phpinfo),
    ("/phpmyadmin", _phpmyadmin),
    ("/pma", _phpmyadmin),
    ("/myadmin", _phpmyadmin),
    ("/mysql", _phpmyadmin),
    ("/admin", _admin),
    ("/administrator", _admin),
    ("/panel", _admin),
    ("/dashboard", _admin),
    ("/login", _admin),
    ("/cpanel", _admin),
    ("/manage", _admin),
    ("/portal", _admin),
    ("/backup.sql", _sql_dump),
    ("/dump.sql", _sql_dump),
    ("/db.sql", _sql_dump),
    ("/database.sql", _sql_dump),
    ("/db_backup.sql", _sql_dump),
    ("/api/", _api_auth_required),
    # Known webshell paths — return 403 (not 404) to seem like they exist but are locked down
    ("/shell.php", _forbidden),
    ("/cmd.php", _forbidden),
    ("/c99.php", _forbidden),
    ("/r57.php", _forbidden),
    ("/b374k.php", _forbidden),
]


def get_response(path: str, method: str, query: str, body: str, attack_type: str) -> tuple[str, str, int]:
    """Return (body, content_type, status_code) for the given request."""
    if attack_type == "sqli":
        return _mysql_error(method, query, body)

    for prefix, handler in ROUTE_TABLE:
        if path == prefix or (prefix != "/" and path.lower().startswith(prefix.lower())):
            return handler(method, query, body)

    return _not_found(method, query, body)
