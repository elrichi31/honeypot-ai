"""
Response builders for the web honeypot.

Handlers live in honeypot/catalog/ split by category:
  api.py     — WordPress, CMS, actuator, AWS, GraphQL, k8s, Docker, ES, Jenkins
  config.py  — config file / credential leaks
  dumps.py   — SQL dumps, SSH keys
  seo.py     — SEO, robots, sitemap

This module now only contains the ROUTE_TABLE and get_response() entry point.
"""

from typing import Callable

from honeypot.catalog.api import (
    xmlrpc, wp_login, wp_json_users, wp_json_posts,
    admin, phpmyadmin, joomla_login, drupal_login,
    server_status, phpinfo,
    actuator, actuator_health, actuator_env, actuator_metrics,
    aws_metadata, aws_metadata_iam,
    graphql, swagger,
    k8s_api, k8s_pods, k8s_secrets,
    docker_registry, docker_registry_catalog, docker_registry_tags,
    elasticsearch, elasticsearch_cluster, elasticsearch_search,
    jenkins, jenkins_api,
    file_upload, api_auth_required, api_versioned,
    forbidden, mysql_error, not_found,
)
from honeypot.catalog.config import (
    wp_config, env, git_config, htaccess,
    rails_db_config, docker_compose, web_config, package_json,
)
from honeypot.catalog.dumps import sql_dump, ssh_private_key
from honeypot.catalog.seo import homepage, robots, sitemap, security_txt

ROUTE_TABLE: list[tuple[str, Callable[[str, str, str], tuple[str, str, int]]]] = [
    ("/", homepage),
    ("/robots.txt", robots),
    ("/sitemap.xml", sitemap),
    ("/.well-known/security.txt", security_txt),
    ("/xmlrpc.php", xmlrpc),
    # WordPress
    ("/wp-login.php", wp_login),
    ("/wp-admin", wp_login),
    ("/wordpress/wp-login", wp_login),
    ("/wp-config.php", wp_config),
    ("/wp-json/wp/v2/users", wp_json_users),
    ("/wp-json/wp/v2/posts", wp_json_posts),
    ("/wp-json/", api_auth_required),
    # Leaked config files
    ("/.env", env),
    ("/.git/", git_config),
    ("/.htaccess", htaccess),
    # System info
    ("/server-status", server_status),
    ("/info.php", phpinfo),
    ("/phpinfo.php", phpinfo),
    # Database management
    ("/phpmyadmin", phpmyadmin),
    ("/pma", phpmyadmin),
    ("/myadmin", phpmyadmin),
    ("/mysql", phpmyadmin),
    # Admin panels
    ("/admin", admin),
    ("/administrator", joomla_login),
    ("/panel", admin),
    ("/dashboard", admin),
    ("/login", admin),
    ("/cpanel", admin),
    ("/manage", admin),
    ("/portal", admin),
    # Joomla / Drupal
    ("/joomla", joomla_login),
    ("/user/login", drupal_login),
    ("/user/register", drupal_login),
    ("/sites/default/settings.php", env),
    # SQL dumps
    ("/backup.sql", sql_dump),
    ("/dump.sql", sql_dump),
    ("/db.sql", sql_dump),
    ("/database.sql", sql_dump),
    ("/db_backup.sql", sql_dump),
    # Spring Boot Actuator
    ("/actuator/health",   actuator_health),
    ("/actuator/env",      actuator_env),
    ("/actuator/metrics",  actuator_metrics),
    ("/actuator/beans",    actuator_metrics),
    ("/actuator/loggers",  actuator_metrics),
    ("/actuator/info",     actuator_health),
    ("/actuator",          actuator),
    ("/manage/health",     actuator_health),
    ("/management/health", actuator_health),
    ("/health",            actuator_health),
    # AWS EC2 metadata (SSRF target)
    ("/latest/meta-data/iam/security-credentials/", aws_metadata_iam),
    ("/latest/meta-data/", aws_metadata),
    ("/latest/", aws_metadata),
    # GraphQL
    ("/graphql", graphql),
    ("/api/graphql", graphql),
    ("/graphiql", graphql),
    # Swagger / API docs
    ("/swagger",       swagger),
    ("/swagger-ui",    swagger),
    ("/api-docs",      swagger),
    ("/openapi",       swagger),
    ("/openapi.json",  swagger),
    ("/openapi.yaml",  swagger),
    ("/redoc",         swagger),
    ("/docs",          swagger),
    # Versioned API endpoints
    ("/api/v1/", api_versioned),
    ("/api/v2/", api_versioned),
    ("/api/v3/", api_versioned),
    ("/api/",    api_auth_required),
    # Kubernetes API
    ("/api/v1/namespaces/production/secrets", k8s_secrets),
    ("/api/v1/namespaces/default/secrets",    k8s_secrets),
    ("/api/v1/secrets",                       k8s_secrets),
    ("/api/v1/pods",                          k8s_pods),
    ("/api/v1/namespaces",                    k8s_pods),
    ("/api/v1",                               k8s_api),
    # Docker registry v2
    ("/v2/_catalog",   docker_registry_catalog),
    ("/v2/tags/list",  docker_registry_tags),
    ("/v2/",           docker_registry),
    # Elasticsearch
    ("/_search",          elasticsearch_search),
    ("/_all/_search",     elasticsearch_search),
    ("/_cluster/health",  elasticsearch_cluster),
    ("/_cluster/state",   elasticsearch_cluster),
    ("/_nodes",           elasticsearch_cluster),
    ("/_cat/indices",     elasticsearch_cluster),
    # Jenkins
    ("/jenkins/api/json", jenkins_api),
    ("/jenkins",          jenkins),
    ("/jenkins/",         jenkins),
    # SSH private keys
    ("/.ssh/id_rsa",              ssh_private_key),
    ("/.ssh/id_ed25519",          ssh_private_key),
    ("/id_rsa",                   ssh_private_key),
    ("/home/ubuntu/.ssh/id_rsa",  ssh_private_key),
    ("/root/.ssh/id_rsa",         ssh_private_key),
    # IIS / .NET
    ("/web.config", web_config),
    # Rails
    ("/config/database.yml", rails_db_config),
    ("/config/secrets.yml",  rails_db_config),
    # Docker / Node artifacts
    ("/docker-compose.yml",  docker_compose),
    ("/docker-compose.yaml", docker_compose),
    ("/package.json",        package_json),
    # File upload honeypot
    ("/upload",      file_upload),
    ("/uploads",     file_upload),
    ("/file-upload", file_upload),
    ("/fileupload",  file_upload),
    # Known webshell paths
    ("/shell.php",    forbidden),
    ("/cmd.php",      forbidden),
    ("/c99.php",      forbidden),
    ("/r57.php",      forbidden),
    ("/b374k.php",    forbidden),
    ("/webshell.php", forbidden),
    ("/backdoor.php", forbidden),
    ("/eval.php",     forbidden),
]


def get_response(path: str, method: str, query: str, body: str, attack_type: str) -> tuple[str, str, int]:
    """Return (body, content_type, status_code) for the given request."""
    if attack_type == "sqli":
        return mysql_error(method, query, body)

    for prefix, handler in ROUTE_TABLE:
        if path == prefix or (prefix != "/" and path.lower().startswith(prefix.lower())):
            return handler(method, query, body)

    return not_found(method, query, body)
