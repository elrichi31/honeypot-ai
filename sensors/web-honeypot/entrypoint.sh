#!/bin/sh
# Runs as root, fixes volume mount permissions, then drops to app user.
mkdir -p /var/log/web-honeypot
chown app:app /var/log/web-honeypot
exec gosu app gunicorn --config gunicorn.conf.py app:app
