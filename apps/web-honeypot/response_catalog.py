"""
Response builders for the web honeypot.

The module keeps routing logic and small dynamic decisions in Python while
storing page templates and static payloads on disk so the honeypot stays easy
to extend and maintain.
"""

from functools import lru_cache
from pathlib import Path
from typing import Callable
from urllib.parse import parse_qs

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


def _parse_encoded_pairs(raw: str) -> dict[str, str]:
    parsed = parse_qs(raw or "", keep_blank_values=True)
    return {key: values[0] if values else "" for key, values in parsed.items()}


@lru_cache(maxsize=None)
def _load_payload(relative_path: str) -> str:
    return (PAYLOADS_DIR / relative_path).read_text(encoding="utf-8")


@lru_cache(maxsize=None)
def _get_template(template_name: str):
    return _template_env.get_template(template_name)


def _render_template(template_name: str, **context: object) -> str:
    return _get_template(template_name).render(**context)


def _respond_with_payload(relative_path: str, content_type: str, status_code: int = 200) -> tuple[str, str, int]:
    return (_load_payload(relative_path), content_type, status_code)


def _render_wordpress_login(submitted_user: str = "", notice_html: Markup | str = "") -> str:
    return _render_template(
        "wordpress/login.html",
        submitted_user=submitted_user,
        notice_html=notice_html,
    )


def _render_wordpress_lost_password(submitted_user: str = "", notice_html: Markup | str = "") -> str:
    return _render_template(
        "wordpress/lost_password.html",
        submitted_user=submitted_user,
        notice_html=notice_html,
    )


def _render_phpmyadmin_login(
    submitted_user: str = "",
    selected_server: str = "1",
    notice_html: Markup | str = "",
) -> str:
    server_name = "db-replica.internal" if selected_server == "2" else "db-primary.internal"
    return _render_template(
        "phpmyadmin/login.html",
        submitted_user=submitted_user,
        selected_server=selected_server,
        server_name=server_name,
        notice_html=notice_html,
    )


def _render_admin_login(submitted_user: str = "", notice_html: Markup | str = "") -> str:
    return _render_template(
        "admin/login.html",
        submitted_user=submitted_user,
        notice_html=notice_html,
    )


def _homepage(_method: str, _query: str, _body: str) -> tuple[str, str, int]:
    return (_render_template("site/homepage.html"), "text/html", 200)


def _wp_login(method: str, query: str, body: str) -> tuple[str, str, int]:
    query_params = _parse_encoded_pairs(query)
    form_data = _parse_encoded_pairs(body)

    if query_params.get("action") == "lostpassword":
        submitted_user = form_data.get("user_login", "")
        notice_html: Markup | str = ""
        if method == "POST":
            notice_html = Markup(
                '<div class="message">If an account matches the supplied details, '
                "a password reset email has been sent to the address on file.</div>"
            )
        return (_render_wordpress_lost_password(submitted_user, notice_html), "text/html", 200)

    if method == "POST":
        submitted_user = form_data.get("log", "")
        submitted_password = form_data.get("pwd", "")

        if not submitted_user:
            message_html = "The username field is empty."
        elif not submitted_password:
            message_html = "The password field is empty."
        elif "@" in submitted_user:
            message_html = Markup(
                "The password you entered for the email address "
                f"<strong>{escape(submitted_user)}</strong> is incorrect. "
                '<a href="/wp-login.php?action=lostpassword">Lost your password?</a>'
            )
        else:
            message_html = Markup(
                "The password you entered for the username "
                f"<strong>{escape(submitted_user)}</strong> is incorrect. "
                '<a href="/wp-login.php?action=lostpassword">Lost your password?</a>'
            )

        notice_html = Markup(f'<div id="login_error"><strong>Error</strong>: {message_html}</div>')
        return (_render_wordpress_login(submitted_user, notice_html), "text/html", 200)

    return (_render_wordpress_login(), "text/html", 200)


def _wp_config(_method: str, _query: str, _body: str) -> tuple[str, str, int]:
    return _respond_with_payload("config/wp_config.php", "application/x-httpd-php")


def _env(_method: str, _query: str, _body: str) -> tuple[str, str, int]:
    return _respond_with_payload("config/env.txt", "text/plain")


def _git_config(_method: str, _query: str, _body: str) -> tuple[str, str, int]:
    return _respond_with_payload("config/git_config.txt", "text/plain")


def _htaccess(_method: str, _query: str, _body: str) -> tuple[str, str, int]:
    return _respond_with_payload("config/htaccess.txt", "text/plain")


def _robots(_method: str, _query: str, _body: str) -> tuple[str, str, int]:
    return _respond_with_payload("seo/robots.txt", "text/plain")


def _xmlrpc(method: str, _query: str, _body: str) -> tuple[str, str, int]:
    if method == "POST":
        return _respond_with_payload("api/xmlrpc_fault.xml", "text/xml")
    return ("<html><body><p>XML-RPC server accepts POST requests only.</p></body></html>", "text/html", 405)


def _admin(method: str, _query: str, body: str) -> tuple[str, str, int]:
    if method == "POST":
        form_data = _parse_encoded_pairs(body)
        submitted_user = form_data.get("username", "") or form_data.get("email", "")
        if submitted_user:
            notice_html = Markup(
                '<div class="alert-error">Authentication failed for '
                f"<strong>{escape(submitted_user)}</strong>. "
                "Verify your credentials or contact the service desk.</div>"
            )
        else:
            notice_html = Markup(
                '<div class="alert-error">Authentication failed. Enter your username '
                "and password to continue.</div>"
            )
        return (_render_admin_login(submitted_user, notice_html), "text/html", 200)
    return (_render_admin_login(), "text/html", 200)


def _phpmyadmin(method: str, _query: str, body: str) -> tuple[str, str, int]:
    form_data = _parse_encoded_pairs(body)
    submitted_user = form_data.get("pma_username", "")
    selected_server = form_data.get("server", "1")

    if method == "POST":
        login_name = escape(submitted_user or "anonymous")
        notice_html = Markup(
            '<div class="alert"><strong>Cannot log in to the MySQL server</strong><br>'
            "mysqli::real_connect(): (HY000/1045): Access denied for user "
            f"&#39;{login_name}&#39;@&#39;localhost&#39; (using password: YES)</div>"
        )
        return (_render_phpmyadmin_login(submitted_user, selected_server, notice_html), "text/html", 200)

    return (_render_phpmyadmin_login(selected_server=selected_server), "text/html", 200)


def _server_status(_method: str, _query: str, _body: str) -> tuple[str, str, int]:
    return (_render_template("system/server_status.html"), "text/html", 200)


def _sql_dump(_method: str, _query: str, _body: str) -> tuple[str, str, int]:
    return _respond_with_payload("dumps/sql_dump.sql", "text/plain")


def _mysql_error(_method: str, _query: str, _body: str) -> tuple[str, str, int]:
    return (_render_template("errors/mysql_error.html"), "text/html", 500)


def _not_found(_method: str, _query: str, _body: str) -> tuple[str, str, int]:
    return (_render_template("errors/404.html"), "text/html", 404)


ROUTE_TABLE: list[tuple[str, Callable[[str, str, str], tuple[str, str, int]]]] = [
    ("/", _homepage),
    ("/robots.txt", _robots),
    ("/xmlrpc.php", _xmlrpc),
    ("/wp-login.php", _wp_login),
    ("/wp-admin", _wp_login),
    ("/wordpress/wp-login", _wp_login),
    ("/wp-config.php", _wp_config),
    ("/.env", _env),
    ("/.env.", _env),
    ("/.git/config", _git_config),
    ("/.git/", _git_config),
    ("/.htaccess", _htaccess),
    ("/server-status", _server_status),
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
]


def get_response(path: str, method: str, query: str, body: str, attack_type: str) -> tuple[str, str, int]:
    """Return (body, content_type, status_code) for the given request."""
    if attack_type == "sqli":
        return _mysql_error(method, query, body)

    for prefix, handler in ROUTE_TABLE:
        if path == prefix or (prefix != "/" and path.lower().startswith(prefix.lower())):
            return handler(method, query, body)

    return _not_found(method, query, body)
