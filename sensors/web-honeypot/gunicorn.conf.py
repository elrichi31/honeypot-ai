"""Gunicorn config for the web honeypot.

Gunicorn stamps "Server: gunicorn" at the WSGI layer, overriding whatever the
Flask app set, producing the impossible "Server: gunicorn" + "X-Powered-By: PHP"
combination that instantly outs the honeypot.

In gunicorn 23 the value comes from gunicorn.http.wsgi.Response.version, which is
assigned `SERVER` — and wsgi.py does `from gunicorn import SERVER` *by value* at
import time. So setting the SERVER_SOFTWARE env var or reassigning gunicorn.SERVER
does nothing: wsgi.py already holds its own copy. Patch that module's SERVER
symbol directly so every response advertises the Apache facade instead.
"""

import gunicorn.http.wsgi as _wsgi

_FACADE_SERVER = "Apache/2.4.57 (Ubuntu)"


def _patch_server_token():
    _wsgi.SERVER = _FACADE_SERVER
    _wsgi.SERVER_SOFTWARE = _FACADE_SERVER


# Patch at config load (covers preload/fork) and again per worker (covers spawn),
# so no worker can ever fall back to the gunicorn token.
_patch_server_token()


def post_fork(server, worker):
    _patch_server_token()


# Concurrency tuning (moved here from the CMD so it lives with the server config).
bind = "0.0.0.0:8080"
workers = 4
worker_class = "gthread"
threads = 32
backlog = 2048
timeout = 30
worker_tmp_dir = "/tmp"
