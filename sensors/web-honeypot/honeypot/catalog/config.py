"""Config file / credential leak handlers."""

import json

from .shared import (
    _render, _payload, _parse_form, _canary_password, _check_canary,
    _load_payload, _CANARY_DB_PASSWORD,
)


def wp_config(_m, _q, _b) -> tuple[str, str, int]:
    from flask import request
    ip = request.remote_addr or "unknown"
    pwd = _canary_password(ip)
    base = _load_payload("config/wp_config.php")
    content = base.replace(_CANARY_DB_PASSWORD, pwd)
    return (content, "application/x-httpd-php", 200)


def env(_m, _q, _b) -> tuple[str, str, int]:
    from flask import request
    ip = request.remote_addr or "unknown"
    pwd = _canary_password(ip)
    base = _load_payload("config/env.txt")
    content = base.replace(_CANARY_DB_PASSWORD, pwd)
    return (content, "text/plain", 200)


def git_config(_m, _q, _b) -> tuple[str, str, int]:
    return _payload("config/git_config.txt", "text/plain")


def htaccess(_m, _q, _b) -> tuple[str, str, int]:
    return _payload("config/htaccess.txt", "text/plain")


def rails_db_config(_m, _q, _b) -> tuple[str, str, int]:
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


def docker_compose(_m, _q, _b) -> tuple[str, str, int]:
    yml = (
        "version: '3.8'\nservices:\n"
        "  app:\n    image: techcorp/app:latest\n    ports:\n      - '8080:8080'\n"
        "    environment:\n      - DB_HOST=db-primary.internal\n      - DB_PORT=3306\n"
        "  db:\n    image: mysql:8.0\n    volumes:\n      - db_data:/var/lib/mysql\n"
        "volumes:\n  db_data:\n"
    )
    return (yml, "text/plain", 200)


def web_config(_m, _q, _b) -> tuple[str, str, int]:
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


def package_json(_m, _q, _b) -> tuple[str, str, int]:
    pkg = {
        "name": "techcorp-app", "version": "2.4.1", "private": True,
        "scripts": {"start": "node server.js", "build": "webpack --mode production"},
        "dependencies": {"express": "^4.18.2", "mysql2": "^3.6.1", "jsonwebtoken": "^9.0.2"},
    }
    return (json.dumps(pkg, indent=2), "application/json", 200)
