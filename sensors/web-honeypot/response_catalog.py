"""
Response builders for the web honeypot.

Routing logic and small dynamic decisions live here; templates and static
payloads live on disk so the honeypot is easy to extend.
"""

import hashlib
import hmac
import json
import os
import secrets
from functools import lru_cache
from pathlib import Path
from typing import Callable
from urllib.parse import parse_qs

from flask import g, request, session
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup, escape

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
PAYLOADS_DIR = BASE_DIR / "payloads"

# ---------------------------------------------------------------------------
# Honeytoken system
#
# Each source IP gets a unique DB password derived via HMAC from the IP +
# a process-local secret. The token is deterministic (same IP → same token
# across requests) but unguessable without the secret, so when any login form
# receives a token we can identify exactly which IP's .env was read.
#
# The static canary (_CANARY_DB_USER / _CANARY_DB_PASSWORD) is kept as a
# fallback for requests where the IP is unavailable.
# ---------------------------------------------------------------------------

_CANARY_DB_USER = "techcorp_app"
_CANARY_DB_PASSWORD = "techcorp-db-password-example"  # static fallback

# Generated fresh at process start — never stored, never logged.
_HONEYTOKEN_SECRET = secrets.token_bytes(32)


def _ip_token(ip: str, length: int = 24) -> str:
    """Deterministic honeytoken for a given IP — HMAC-SHA256, hex-truncated."""
    mac = hmac.new(_HONEYTOKEN_SECRET, ip.encode(), hashlib.sha256)
    return mac.hexdigest()[:length]


def _get_src_ip() -> str:
    """Extract source IP from the current request context."""
    try:
        fwd = request.headers.get("X-Forwarded-For", "")
        return fwd.split(",")[0].strip() if fwd else (request.remote_addr or "unknown")
    except RuntimeError:
        return "unknown"


def _canary_password(ip: str) -> str:
    """Return the unique canary DB password for this IP."""
    tok = _ip_token(ip)
    # Prefix makes tokens recognisable in logs without exposing structure
    return f"tc-{tok}"


def _check_canary(user: str, password: str) -> None:
    """
    Flag the request on flask.g when leaked creds are reused.
    Checks both the static password (old tokens, direct fuzzing) and the
    IP-specific honeytoken (confirms the attacker read *their* .env).
    """
    ip = _get_src_ip()
    ip_pwd = _canary_password(ip)
    if user == _CANARY_DB_USER and password in (ip_pwd, _CANARY_DB_PASSWORD):
        g.canary_triggered = True
        g.canary_credential = _CANARY_DB_USER
        # Store which token was matched so app.py can log it
        g.canary_token_type = "ip_specific" if password == ip_pwd else "static"

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
        _check_canary(user, pwd)
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
    ip  = _get_src_ip()
    pwd = _canary_password(ip)
    # Inject the IP-specific honeytoken into the static template
    base = _load_payload("config/wp_config.php")
    content = base.replace(_CANARY_DB_PASSWORD, pwd)
    return (content, "application/x-httpd-php", 200)


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
    ip  = _get_src_ip()
    pwd = _canary_password(ip)
    base = _load_payload("config/env.txt")
    content = base.replace(_CANARY_DB_PASSWORD, pwd)
    return (content, "text/plain", 200)


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
        _check_canary(user, fd.get("password", ""))
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
    # Real phpMyAdmin rotates the anti-CSRF token every request; a static value is
    # an instant fingerprint, so mint a fresh one each time.
    csrf_token = secrets.token_hex(16)
    if method == "POST":
        _check_canary(user, fd.get("pma_password", ""))
        session["pma_last_user"] = user
        login = escape(user or "anonymous")
        notice = Markup(f'<div class="alert"><strong>Cannot log in to the MySQL server</strong><br>'
                        f"mysqli::real_connect(): (HY000/1045): Access denied for user "
                        f"&#39;{login}&#39;@&#39;localhost&#39; (using password: YES)</div>")
        return (_render("phpmyadmin/login.html", submitted_user=user, selected_server=server,
                        server_name=server_name, csrf_token=csrf_token, notice_html=notice), "text/html", 200)
    return (_render("phpmyadmin/login.html", submitted_user=user, selected_server=server,
                    server_name=server_name, csrf_token=csrf_token, notice_html=""), "text/html", 200)


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
# New handlers
# ---------------------------------------------------------------------------

def _actuator(_m, _q, _b) -> tuple[str, str, int]:
    """Spring Boot Actuator index."""
    return (json.dumps({
        "_links": {
            "self":    {"href": "/actuator",          "templated": False},
            "health":  {"href": "/actuator/health",   "templated": False},
            "metrics": {"href": "/actuator/metrics",  "templated": False},
            "env":     {"href": "/actuator/env",      "templated": False},
            "beans":   {"href": "/actuator/beans",    "templated": False},
            "loggers": {"href": "/actuator/loggers",  "templated": False},
            "info":    {"href": "/actuator/info",     "templated": False},
        }
    }), "application/vnd.spring-boot.actuator.v3+json", 200)


def _actuator_health(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "status": "UP",
        "components": {
            "db":        {"status": "UP", "details": {"database": "MySQL", "validationQuery": "isValid()"}},
            "diskSpace": {"status": "UP", "details": {"total": 107374182400, "free": 52341760000, "threshold": 10485760}},
            "ping":      {"status": "UP"},
        }
    }), "application/vnd.spring-boot.actuator.v3+json", 200)


def _actuator_env(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "activeProfiles": ["production"],
        "propertySources": [
            {"name": "systemEnvironment", "properties": {
                "JAVA_HOME":   {"value": "/usr/lib/jvm/java-17-openjdk-amd64"},
                "SERVER_PORT": {"value": "8080"},
                "SPRING_PROFILES_ACTIVE": {"value": "production"},
            }},
            {"name": "applicationConfig: [classpath:/application.properties]", "properties": {
                "spring.datasource.url":      {"value": "jdbc:mysql://db-primary.internal:3306/appdb"},
                "spring.datasource.username": {"value": "******"},
                "spring.datasource.password": {"value": "******"},
                "management.endpoints.web.exposure.include": {"value": "*"},
            }},
        ]
    }), "application/vnd.spring-boot.actuator.v3+json", 200)


def _actuator_metrics(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "names": [
            "jvm.memory.used", "jvm.memory.max", "jvm.gc.pause",
            "http.server.requests", "process.uptime", "process.cpu.usage",
            "system.cpu.count", "tomcat.sessions.active.current",
        ]
    }), "application/vnd.spring-boot.actuator.v3+json", 200)


def _aws_metadata(_m, _q, _b) -> tuple[str, str, int]:
    """Fake AWS EC2 IMDS endpoint — common SSRF target."""
    return (
        "ami-id\nami-launch-index\nami-manifest-path\nblock-device-mapping/\n"
        "hostname\niam/\ninstance-action\ninstance-id\ninstance-life-cycle\n"
        "instance-type\nlocal-hostname\nlocal-ipv4\nmac\nnetwork/\n"
        "placement/\nprofile\npublic-hostname\npublic-ipv4\npublic-keys/\n"
        "reservation-id\nsecurity-groups\nservices/",
        "text/plain",
        200,
    )


def _aws_metadata_iam(_m, _q, _b) -> tuple[str, str, int]:
    """Fake IAM role credentials — high-value SSRF data attackers look for."""
    return (json.dumps({
        "Code":            "Success",
        "LastUpdated":     "2024-11-18T08:32:17Z",
        "Type":            "AWS-HMAC",
        "AccessKeyId":     "ASIA" + secrets.token_hex(8).upper(),
        "SecretAccessKey": secrets.token_hex(20),
        "Token":           secrets.token_hex(64),
        "Expiration":      "2024-11-18T14:32:17Z",
    }), "application/json", 200)


def _graphql(method: str, _q, body: str) -> tuple[str, str, int]:
    """GraphQL endpoint — responds to introspection and generic queries."""
    if method == "GET":
        return (json.dumps({
            "errors": [{"message": "Must provide query string.", "locations": [], "path": []}]
        }), "application/json", 400)

    if "__schema" in body or "__type" in body or "IntrospectionQuery" in body:
        schema_stub = {
            "data": {
                "__schema": {
                    "queryType":    {"name": "Query"},
                    "mutationType": {"name": "Mutation"},
                    "types": [
                        {"kind": "OBJECT", "name": "Query", "fields": [
                            {"name": "user",     "type": {"name": "User"}},
                            {"name": "posts",    "type": {"name": "Post"}},
                            {"name": "settings", "type": {"name": "Settings"}},
                        ]},
                        {"kind": "OBJECT", "name": "User", "fields": [
                            {"name": "id",    "type": {"name": "ID"}},
                            {"name": "email", "type": {"name": "String"}},
                            {"name": "role",  "type": {"name": "String"}},
                        ]},
                        {"kind": "OBJECT", "name": "Post", "fields": [
                            {"name": "id",    "type": {"name": "ID"}},
                            {"name": "title", "type": {"name": "String"}},
                        ]},
                        {"kind": "SCALAR", "name": "String", "fields": None},
                        {"kind": "SCALAR", "name": "ID",     "fields": None},
                    ],
                }
            }
        }
        return (json.dumps(schema_stub), "application/json", 200)

    return (json.dumps({
        "errors": [{"message": "Cannot query field on type 'Query'.", "locations": [{"line": 1, "column": 3}]}]
    }), "application/json", 200)


def _swagger(_m, _q, _b) -> tuple[str, str, int]:
    """OpenAPI/Swagger stub — realistic API gateway spec."""
    spec = {
        "openapi": "3.0.1",
        "info":    {"title": "TechCorp API", "version": "1.0.0", "description": "Internal REST API"},
        "servers": [{"url": "/api/v1"}],
        "paths": {
            "/users":        {"get":  {"summary": "List users",    "security": [{"bearerAuth": []}]}},
            "/users/{id}":   {"get":  {"summary": "Get user",      "security": [{"bearerAuth": []}]}},
            "/auth/login":   {"post": {"summary": "Authenticate"}},
            "/auth/refresh": {"post": {"summary": "Refresh token", "security": [{"bearerAuth": []}]}},
            "/settings":     {"get":  {"summary": "App settings",  "security": [{"bearerAuth": []}]}},
        },
        "components": {"securitySchemes": {"bearerAuth": {"type": "http", "scheme": "bearer"}}},
    }
    return (json.dumps(spec), "application/json", 200)


def _k8s_api(_m, _q, _b) -> tuple[str, str, int]:
    """Kubernetes API server root — common cloud-env SSRF / exposed k8s target."""
    return (json.dumps({
        "kind": "APIVersions",
        "versions": ["v1"],
        "serverAddressByClientCIDRs": [{"clientCIDR": "0.0.0.0/0", "serverAddress": "k8s-api.internal:6443"}],
    }), "application/json", 200)


def _k8s_pods(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "apiVersion": "v1", "kind": "PodList",
        "items": [
            {"metadata": {"name": "app-7d4f9b6c8-xk2pn", "namespace": "production",
                          "labels": {"app": "techcorp-app", "env": "production"}},
             "status": {"phase": "Running", "podIP": "10.0.1.15",
                        "containerStatuses": [{"name": "app", "ready": True, "image": "techcorp/app:2.4.1"}]}},
            {"metadata": {"name": "postgres-0", "namespace": "production",
                          "labels": {"app": "postgres"}},
             "status": {"phase": "Running", "podIP": "10.0.1.20",
                        "containerStatuses": [{"name": "postgres", "ready": True, "image": "postgres:16"}]}},
        ]
    }), "application/json", 200)


def _k8s_secrets(_m, _q, _b) -> tuple[str, str, int]:
    """Kubernetes secrets list — high-value target for credential theft."""
    import base64
    return (json.dumps({
        "apiVersion": "v1", "kind": "SecretList",
        "items": [
            {"metadata": {"name": "db-credentials", "namespace": "production"},
             "type": "Opaque",
             "data": {
                 "username": base64.b64encode(b"appuser").decode(),
                 "password": base64.b64encode(b"REDACTED").decode(),
             }},
            {"metadata": {"name": "tls-cert", "namespace": "production"},
             "type": "kubernetes.io/tls",
             "data": {"tls.crt": "LS0tLS1CRUdJTi...", "tls.key": "LS0tLS1CRUdJTi..."}},
        ]
    }), "application/json", 200)


def _docker_registry(_m, _q, _b) -> tuple[str, str, int]:
    """Docker registry v2 API root — probe for exposed private registries."""
    return ("{}", "application/json", 200)


def _docker_registry_catalog(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "repositories": ["techcorp/app", "techcorp/worker", "techcorp/nginx", "postgres", "redis"]
    }), "application/json", 200)


def _docker_registry_tags(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({"name": "techcorp/app", "tags": ["latest", "2.4.1", "2.4.0", "2.3.9"]}),
            "application/json", 200)


def _elasticsearch(_m, _q, _b) -> tuple[str, str, int]:
    """Elasticsearch root — exposes version and cluster name."""
    return (json.dumps({
        "name": "es-node-01",
        "cluster_name": "techcorp-production",
        "version": {"number": "8.11.1", "lucene_version": "9.8.0"},
        "tagline": "You Know, for Search",
    }), "application/json", 200)


def _elasticsearch_cluster(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "cluster_name": "techcorp-production",
        "status": "green",
        "number_of_nodes": 3,
        "number_of_data_nodes": 3,
        "active_primary_shards": 12,
        "active_shards": 24,
        "indices": {"users": {"status": "open"}, "logs": {"status": "open"}, "orders": {"status": "open"}},
    }), "application/json", 200)


def _elasticsearch_search(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "hits": {
            "total": {"value": 1042, "relation": "eq"},
            "hits": [
                {"_index": "users", "_id": "1", "_score": 1.0,
                 "_source": {"email": "admin@techcorp.internal", "role": "superadmin", "created": "2024-01-15"}},
            ]
        }
    }), "application/json", 200)


def _jenkins(_m, _q, _b) -> tuple[str, str, int]:
    """Jenkins main page — exposes version header and job list."""
    html = (
        "<!DOCTYPE html><html><head><title>Dashboard [Jenkins]</title></head><body>"
        "<h1>Jenkins</h1>"
        "<p>Version 2.426.3</p>"
        "<ul>"
        "<li><a href='/job/deploy-production/'>deploy-production</a></li>"
        "<li><a href='/job/build-app/'>build-app</a></li>"
        "<li><a href='/job/run-tests/'>run-tests</a></li>"
        "</ul>"
        "</body></html>"
    )
    return (html, "text/html", 200)


def _jenkins_api(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "jobs": [
            {"name": "deploy-production", "url": "/job/deploy-production/", "color": "blue"},
            {"name": "build-app",         "url": "/job/build-app/",         "color": "blue"},
            {"name": "run-tests",         "url": "/job/run-tests/",         "color": "red"},
        ],
        "nodeDescription": "the master Jenkins node",
        "numExecutors": 4,
        "mode": "NORMAL",
    }), "application/json", 200)


def _ssh_private_key(_m, _q, _b) -> tuple[str, str, int]:
    """Fake RSA private key — frequently targeted by credential harvesters."""
    fake_key = (
        "-----BEGIN OPENSSH PRIVATE KEY-----\n"
        "b3BlbnNzaC1rZXktdjEAAAAA" + "A" * 40 + "AAAAA\n"
        "AAABAQC2randomfakekeydata" + "B" * 40 + "randomdata\n"
        "notarealkey" + "C" * 40 + "fakefakefake\n"
        "-----END OPENSSH PRIVATE KEY-----\n"
    )
    return (fake_key, "text/plain", 200)


def _web_config(_m, _q, _b) -> tuple[str, str, int]:
    """IIS web.config — fake ASP.NET configuration (no real secrets)."""
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<configuration>\n"
        "  <system.web>\n"
        '    <compilation debug="false" targetFramework="4.8" />\n'
        '    <httpRuntime targetFramework="4.8" maxRequestLength="4096" />\n'
        '    <authentication mode="Forms">\n'
        '      <forms loginUrl="~/Account/Login" timeout="30" />\n'
        "    </authentication>\n"
        '    <customErrors mode="RemoteOnly" defaultRedirect="~/Error" />\n'
        '    <sessionState mode="InProc" cookieless="false" timeout="20" />\n'
        "  </system.web>\n"
        "  <connectionStrings>\n"
        '    <add name="DefaultConnection"\n'
        '         connectionString="Data Source=db-primary.internal;Initial Catalog=appdb;'
        'User ID=appuser;Password=*****"\n'
        '         providerName="System.Data.SqlClient" />\n'
        "  </connectionStrings>\n"
        "  <appSettings>\n"
        '    <add key="Environment" value="Production" />\n'
        '    <add key="ApiBaseUrl"  value="https://api.techcorp.internal/v1" />\n'
        "  </appSettings>\n"
        "</configuration>"
    )
    return (xml, "application/xml", 200)


def _joomla_login(_m, _q, body: str) -> tuple[str, str, int]:
    """Joomla administrator login page (reuses admin template)."""
    fd = _parse_form(body)
    user = fd.get("username", "")
    if user:
        _check_canary(user, fd.get("passwd", ""))
        notice = Markup(
            '<div class="alert alert-error"><strong>Username and password do not match</strong> '
            "or you do not have an account yet.</div>"
        )
    else:
        notice = Markup("")
    return (_render("admin/login.html", submitted_user=user, notice_html=notice), "text/html", 200)


def _drupal_login(_m, _q, body: str) -> tuple[str, str, int]:
    """Drupal /user/login page."""
    fd = _parse_form(body)
    user = fd.get("name", "")
    if user:
        _check_canary(user, fd.get("pass", ""))
        notice = Markup(
            '<div class="messages messages--error" role="alert">'
            'Unrecognized username or password. '
            '<a href="/user/password">Have you forgotten your password?</a>'
            "</div>"
        )
    else:
        notice = Markup("")
    return (_render("admin/login.html", submitted_user=user, notice_html=notice), "text/html", 200)


def _file_upload(method: str, _q, body: str) -> tuple[str, str, int]:
    """Fake file-upload endpoint — captures webshell upload attempts."""
    if method == "POST":
        return (json.dumps({
            "success": True,
            "file":    {"name": "upload.jpg", "size": len(body), "url": "/uploads/upload.jpg"},
            "message": "File uploaded successfully.",
        }), "application/json", 200)
    html = (
        "<!DOCTYPE html><html><body>"
        '<form method="POST" enctype="multipart/form-data">'
        '<input type="file" name="file"><input type="submit" value="Upload">'
        "</form></body></html>"
    )
    return (html, "text/html", 200)


def _api_versioned(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "error":   "Unauthorized",
        "message": "Missing or invalid Authorization header.",
        "status":  401,
        "docs":    "/swagger",
    }), "application/json", 401)


def _rails_db_config(_m, _q, _b) -> tuple[str, str, int]:
    yml = (
        "production:\n"
        "  adapter: postgresql\n"
        "  encoding: unicode\n"
        "  database: appdb_production\n"
        "  pool: <%= ENV.fetch('RAILS_MAX_THREADS') { 5 } %>\n"
        "  host: db-primary.internal\n"
        "  username: appuser\n"
        "  password: <%= ENV['DATABASE_PASSWORD'] %>\n"
    )
    return (yml, "text/plain", 200)


def _docker_compose(_m, _q, _b) -> tuple[str, str, int]:
    yml = (
        "version: '3.8'\nservices:\n"
        "  app:\n    image: techcorp/app:latest\n    ports:\n      - '8080:8080'\n"
        "    environment:\n      - DB_HOST=db-primary.internal\n      - DB_PORT=3306\n"
        "  db:\n    image: mysql:8.0\n    volumes:\n      - db_data:/var/lib/mysql\n"
        "volumes:\n  db_data:\n"
    )
    return (yml, "text/plain", 200)


def _package_json(_m, _q, _b) -> tuple[str, str, int]:
    pkg = {
        "name": "techcorp-app", "version": "2.4.1", "private": True,
        "scripts": {"start": "node server.js", "build": "webpack --mode production"},
        "dependencies": {"express": "^4.18.2", "mysql2": "^3.6.1", "jsonwebtoken": "^9.0.2"},
    }
    return (json.dumps(pkg, indent=2), "application/json", 200)


# ---------------------------------------------------------------------------
# Route table — first prefix match wins
# ---------------------------------------------------------------------------

ROUTE_TABLE: list[tuple[str, Callable[[str, str, str], tuple[str, str, int]]]] = [
    ("/", _homepage),
    ("/robots.txt", _robots),
    ("/sitemap.xml", _sitemap),
    ("/.well-known/security.txt", _security_txt),
    ("/xmlrpc.php", _xmlrpc),
    # WordPress
    ("/wp-login.php", _wp_login),
    ("/wp-admin", _wp_login),
    ("/wordpress/wp-login", _wp_login),
    ("/wp-config.php", _wp_config),
    ("/wp-json/wp/v2/users", _wp_json_users),
    ("/wp-json/wp/v2/posts", _wp_json_posts),
    ("/wp-json/", _api_auth_required),
    # Leaked config files
    ("/.env", _env),
    ("/.git/", _git_config),
    ("/.htaccess", _htaccess),
    # System info
    ("/server-status", _server_status),
    ("/info.php", _phpinfo),
    ("/phpinfo.php", _phpinfo),
    # Database management
    ("/phpmyadmin", _phpmyadmin),
    ("/pma", _phpmyadmin),
    ("/myadmin", _phpmyadmin),
    ("/mysql", _phpmyadmin),
    # Admin panels
    ("/admin", _admin),
    ("/administrator", _joomla_login),
    ("/panel", _admin),
    ("/dashboard", _admin),
    ("/login", _admin),
    ("/cpanel", _admin),
    ("/manage", _admin),
    ("/portal", _admin),
    # Joomla / Drupal
    ("/joomla", _joomla_login),
    ("/user/login", _drupal_login),
    ("/user/register", _drupal_login),
    ("/sites/default/settings.php", _env),
    # SQL dumps
    ("/backup.sql", _sql_dump),
    ("/dump.sql", _sql_dump),
    ("/db.sql", _sql_dump),
    ("/database.sql", _sql_dump),
    ("/db_backup.sql", _sql_dump),
    # Spring Boot Actuator
    ("/actuator/health",   _actuator_health),
    ("/actuator/env",      _actuator_env),
    ("/actuator/metrics",  _actuator_metrics),
    ("/actuator/beans",    _actuator_metrics),  # stub — same structure
    ("/actuator/loggers",  _actuator_metrics),
    ("/actuator/info",     _actuator_health),
    ("/actuator",          _actuator),
    ("/manage/health",     _actuator_health),
    ("/management/health", _actuator_health),
    ("/health",            _actuator_health),
    # AWS EC2 metadata (SSRF target)
    ("/latest/meta-data/iam/security-credentials/", _aws_metadata_iam),
    ("/latest/meta-data/", _aws_metadata),
    ("/latest/", _aws_metadata),
    # GraphQL
    ("/graphql", _graphql),
    ("/api/graphql", _graphql),
    ("/graphiql", _graphql),
    # Swagger / API docs
    ("/swagger",       _swagger),
    ("/swagger-ui",    _swagger),
    ("/api-docs",      _swagger),
    ("/openapi",       _swagger),
    ("/openapi.json",  _swagger),
    ("/openapi.yaml",  _swagger),
    ("/redoc",         _swagger),
    ("/docs",          _swagger),
    # Versioned API endpoints
    ("/api/v1/", _api_versioned),
    ("/api/v2/", _api_versioned),
    ("/api/v3/", _api_versioned),
    ("/api/",    _api_auth_required),
    # Kubernetes API (exposed k8s / SSRF target)
    ("/api/v1/namespaces/production/secrets", _k8s_secrets),
    ("/api/v1/namespaces/default/secrets",    _k8s_secrets),
    ("/api/v1/secrets",                       _k8s_secrets),
    ("/api/v1/pods",                          _k8s_pods),
    ("/api/v1/namespaces",                    _k8s_pods),
    ("/api/v1",                               _k8s_api),
    # Docker registry v2
    ("/v2/_catalog",   _docker_registry_catalog),
    ("/v2/tags/list",  _docker_registry_tags),
    ("/v2/",           _docker_registry),
    # Elasticsearch
    ("/_search",          _elasticsearch_search),
    ("/_all/_search",     _elasticsearch_search),
    ("/_cluster/health",  _elasticsearch_cluster),
    ("/_cluster/state",   _elasticsearch_cluster),
    ("/_nodes",           _elasticsearch_cluster),
    ("/_cat/indices",     _elasticsearch_cluster),
    # Jenkins
    ("/jenkins/api/json", _jenkins_api),
    ("/jenkins",          _jenkins),
    ("/jenkins/",         _jenkins),
    # SSH private keys
    ("/.ssh/id_rsa",         _ssh_private_key),
    ("/.ssh/id_ed25519",     _ssh_private_key),
    ("/id_rsa",              _ssh_private_key),
    ("/home/ubuntu/.ssh/id_rsa", _ssh_private_key),
    ("/root/.ssh/id_rsa",    _ssh_private_key),
    # IIS / .NET
    ("/web.config", _web_config),
    # Rails
    ("/config/database.yml", _rails_db_config),
    ("/config/secrets.yml",  _rails_db_config),
    # Docker / Node artifacts
    ("/docker-compose.yml", _docker_compose),
    ("/docker-compose.yaml", _docker_compose),
    ("/package.json", _package_json),
    # File upload honeypot
    ("/upload",      _file_upload),
    ("/uploads",     _file_upload),
    ("/file-upload", _file_upload),
    ("/fileupload",  _file_upload),
    # Known webshell paths — return 403 so they look locked down, not absent
    ("/shell.php",  _forbidden),
    ("/cmd.php",    _forbidden),
    ("/c99.php",    _forbidden),
    ("/r57.php",    _forbidden),
    ("/b374k.php",  _forbidden),
    ("/webshell.php", _forbidden),
    ("/backdoor.php", _forbidden),
    ("/eval.php",   _forbidden),
]


def get_response(path: str, method: str, query: str, body: str, attack_type: str) -> tuple[str, str, int]:
    """Return (body, content_type, status_code) for the given request."""
    if attack_type == "sqli":
        return _mysql_error(method, query, body)

    for prefix, handler in ROUTE_TABLE:
        if path == prefix or (prefix != "/" and path.lower().startswith(prefix.lower())):
            return handler(method, query, body)

    return _not_found(method, query, body)
