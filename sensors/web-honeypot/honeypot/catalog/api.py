"""API, cloud, and service-emulation handlers."""

import json
import secrets

from flask import session
from markupsafe import Markup, escape

from .shared import _render, _payload, _parse_form, _check_canary


# ── WordPress ──────────────────────────────────────────────────────────────────

def xmlrpc(method: str, _q, _b) -> tuple[str, str, int]:
    if method == "POST":
        return _payload("api/xmlrpc_fault.xml", "text/xml")
    return ("<html><body><p>XML-RPC server accepts POST requests only.</p></body></html>", "text/html", 405)


def wp_login(method: str, query: str, body: str) -> tuple[str, str, int]:
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
        session["wp_last_user"] = user
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


def wp_json_users(_m, _q, _b) -> tuple[str, str, int]:
    users = [{"id": 1, "name": "admin", "slug": "admin", "link": "https://techcorp-solutions.com/author/admin/",
              "avatar_urls": {"24": "https://secure.gravatar.com/avatar/?d=mm&s=24"}}]
    return (json.dumps(users), "application/json", 200)


def wp_json_posts(_m, _q, _b) -> tuple[str, str, int]:
    posts = [{"id": 1, "date": "2024-11-14T08:32:17", "slug": "hello-world", "status": "publish",
              "type": "post", "link": "https://techcorp-solutions.com/hello-world/",
              "title": {"rendered": "Hello world!"}, "author": 1}]
    return (json.dumps(posts), "application/json", 200)


# ── CMS login panels ──────────────────────────────────────────────────────────

def admin(method: str, _q, body: str) -> tuple[str, str, int]:
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


def phpmyadmin(method: str, _q, body: str) -> tuple[str, str, int]:
    fd = _parse_form(body)
    user = fd.get("pma_username", "") or session.get("pma_last_user", "")
    server = fd.get("server", "1")
    server_name = "db-replica.internal" if server == "2" else "db-primary.internal"
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


def joomla_login(_m, _q, body: str) -> tuple[str, str, int]:
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


def drupal_login(_m, _q, body: str) -> tuple[str, str, int]:
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


# ── System info ───────────────────────────────────────────────────────────────

def server_status(_m, _q, _b) -> tuple[str, str, int]:
    return (_render("system/server_status.html"), "text/html", 200)


def phpinfo(_m, _q, _b) -> tuple[str, str, int]:
    return (_render("system/phpinfo.html"), "text/html", 200)


# ── Spring Boot Actuator ──────────────────────────────────────────────────────

def actuator(_m, _q, _b) -> tuple[str, str, int]:
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


def actuator_health(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "status": "UP",
        "components": {
            "db":        {"status": "UP", "details": {"database": "MySQL", "validationQuery": "isValid()"}},
            "diskSpace": {"status": "UP", "details": {"total": 107374182400, "free": 52341760000, "threshold": 10485760}},
            "ping":      {"status": "UP"},
        }
    }), "application/vnd.spring-boot.actuator.v3+json", 200)


def actuator_env(_m, _q, _b) -> tuple[str, str, int]:
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


def actuator_metrics(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "names": [
            "jvm.memory.used", "jvm.memory.max", "jvm.gc.pause",
            "http.server.requests", "process.uptime", "process.cpu.usage",
            "system.cpu.count", "tomcat.sessions.active.current",
        ]
    }), "application/vnd.spring-boot.actuator.v3+json", 200)


# ── AWS / Cloud SSRF ─────────────────────────────────────────────────────────

def aws_metadata(_m, _q, _b) -> tuple[str, str, int]:
    return (
        "ami-id\nami-launch-index\nami-manifest-path\nblock-device-mapping/\n"
        "hostname\niam/\ninstance-action\ninstance-id\ninstance-life-cycle\n"
        "instance-type\nlocal-hostname\nlocal-ipv4\nmac\nnetwork/\n"
        "placement/\nprofile\npublic-hostname\npublic-ipv4\npublic-keys/\n"
        "reservation-id\nsecurity-groups\nservices/",
        "text/plain",
        200,
    )


def aws_metadata_iam(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "Code":            "Success",
        "LastUpdated":     "2024-11-18T08:32:17Z",
        "Type":            "AWS-HMAC",
        "AccessKeyId":     "ASIA" + secrets.token_hex(8).upper(),
        "SecretAccessKey": secrets.token_hex(20),
        "Token":           secrets.token_hex(64),
        "Expiration":      "2024-11-18T14:32:17Z",
    }), "application/json", 200)


# ── GraphQL / Swagger ─────────────────────────────────────────────────────────

def graphql(method: str, _q, body: str) -> tuple[str, str, int]:
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


def swagger(_m, _q, _b) -> tuple[str, str, int]:
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


# ── Kubernetes ────────────────────────────────────────────────────────────────

def k8s_api(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "kind": "APIVersions",
        "versions": ["v1"],
        "serverAddressByClientCIDRs": [{"clientCIDR": "0.0.0.0/0", "serverAddress": "k8s-api.internal:6443"}],
    }), "application/json", 200)


def k8s_pods(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "apiVersion": "v1", "kind": "PodList",
        "items": [
            {"metadata": {"name": "app-7d4f9b6c8-xk2pn", "namespace": "production",
                          "labels": {"app": "techcorp-app", "env": "production"}},
             "status": {"phase": "Running", "podIP": "10.0.1.15",
                        "containerStatuses": [{"name": "app", "ready": True, "image": "techcorp/app:2.4.1"}]}},
            {"metadata": {"name": "postgres-0", "namespace": "production", "labels": {"app": "postgres"}},
             "status": {"phase": "Running", "podIP": "10.0.1.20",
                        "containerStatuses": [{"name": "postgres", "ready": True, "image": "postgres:16"}]}},
        ]
    }), "application/json", 200)


def k8s_secrets(_m, _q, _b) -> tuple[str, str, int]:
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


# ── Docker registry ───────────────────────────────────────────────────────────

def docker_registry(_m, _q, _b) -> tuple[str, str, int]:
    return ("{}", "application/json", 200)


def docker_registry_catalog(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "repositories": ["techcorp/app", "techcorp/worker", "techcorp/nginx", "postgres", "redis"]
    }), "application/json", 200)


def docker_registry_tags(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({"name": "techcorp/app", "tags": ["latest", "2.4.1", "2.4.0", "2.3.9"]}),
            "application/json", 200)


# ── Elasticsearch ─────────────────────────────────────────────────────────────

def elasticsearch(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "name": "es-node-01",
        "cluster_name": "techcorp-production",
        "version": {"number": "8.11.1", "lucene_version": "9.8.0"},
        "tagline": "You Know, for Search",
    }), "application/json", 200)


def elasticsearch_cluster(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "cluster_name": "techcorp-production",
        "status": "green",
        "number_of_nodes": 3,
        "number_of_data_nodes": 3,
        "active_primary_shards": 12,
        "active_shards": 24,
        "indices": {"users": {"status": "open"}, "logs": {"status": "open"}, "orders": {"status": "open"}},
    }), "application/json", 200)


def elasticsearch_search(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "hits": {
            "total": {"value": 1042, "relation": "eq"},
            "hits": [
                {"_index": "users", "_id": "1", "_score": 1.0,
                 "_source": {"email": "admin@techcorp.internal", "role": "superadmin", "created": "2024-01-15"}},
            ]
        }
    }), "application/json", 200)


# ── Jenkins ───────────────────────────────────────────────────────────────────

def jenkins(_m, _q, _b) -> tuple[str, str, int]:
    html = (
        "<!DOCTYPE html><html><head><title>Dashboard [Jenkins]</title></head><body>"
        "<h1>Jenkins</h1><p>Version 2.426.3</p><ul>"
        "<li><a href='/job/deploy-production/'>deploy-production</a></li>"
        "<li><a href='/job/build-app/'>build-app</a></li>"
        "<li><a href='/job/run-tests/'>run-tests</a></li>"
        "</ul></body></html>"
    )
    return (html, "text/html", 200)


def jenkins_api(_m, _q, _b) -> tuple[str, str, int]:
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


# ── Upload / misc ─────────────────────────────────────────────────────────────

def file_upload(method: str, _q, body: str) -> tuple[str, str, int]:
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


def api_auth_required(_m, _q, _b) -> tuple[str, str, int]:
    body = json.dumps({"error": "Unauthorized", "message": "Authentication credentials were not provided.", "status": 401})
    return (body, "application/json", 401)


def api_versioned(_m, _q, _b) -> tuple[str, str, int]:
    return (json.dumps({
        "error":   "Unauthorized",
        "message": "Missing or invalid Authorization header.",
        "status":  401,
        "docs":    "/swagger",
    }), "application/json", 401)


# ── Error pages ───────────────────────────────────────────────────────────────

def forbidden(_m, _q, _b) -> tuple[str, str, int]:
    return (_render("errors/403.html"), "text/html", 403)


def mysql_error(_m, _q, _b) -> tuple[str, str, int]:
    return (_render("errors/mysql_error.html"), "text/html", 500)


def not_found(_m, _q, _b) -> tuple[str, str, int]:
    return (_render("errors/404.html"), "text/html", 404)
