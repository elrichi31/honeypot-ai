"""
Fake responses — inspired by TANNER's emulation layer.
Each function returns (body, content_type, status_code).
The goal is to be convincing enough that scanners keep probing.
"""

import re
from typing import Callable

# --- Fake page templates ---

WORDPRESS_LOGIN = """<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="UTF-8">
<title>Log In &lsaquo; My Site &#8212; WordPress</title>
<link rel="stylesheet" href="/wp-includes/css/buttons.min.css" type="text/css"/>
<link rel="stylesheet" href="/wp-admin/css/login.min.css" type="text/css"/>
</head>
<body class="login">
<div id="login">
  <h1><a href="https://wordpress.org/">My Site</a></h1>
  <form name="loginform" id="loginform" action="/wp-login.php" method="post">
    <p><label for="user_login">Username or Email Address<br>
      <input type="text" name="log" id="user_login" class="input" size="20"/></label></p>
    <p><label for="user_pass">Password<br>
      <input type="password" name="pwd" id="user_pass" class="input" size="20"/></label></p>
    <p class="submit">
      <input type="submit" name="wp-submit" id="wp-submit" class="button button-primary button-large" value="Log In"/>
      <input type="hidden" name="redirect_to" value="/wp-admin/"/>
      <input type="hidden" name="testcookie" value="1"/>
    </p>
  </form>
  <p id="nav"><a href="/wp-login.php?action=lostpassword">Lost your password?</a></p>
</div>
</body>
</html>"""

FAKE_ENV = """APP_ENV=production
APP_KEY=base64:kXc3E7VFjGsZqBrYdPmNwHuIeA4LoT9R2Cv8Oj6Zy0=
APP_DEBUG=false
APP_URL=http://localhost

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=app_production
DB_USERNAME=root
DB_PASSWORD=Sup3rS3cur3P@ssw0rd!

REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379

MAIL_MAILER=smtp
MAIL_HOST=smtp.mailgun.org
MAIL_PORT=587
MAIL_USERNAME=postmaster@mg.mysite.com
MAIL_PASSWORD=key-3ax6xnjp29jd6fds4gc373

AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=mysite-production-assets

STRIPE_KEY=STRIPE_KEY_PLACEHOLDER
STRIPE_SECRET=STRIPE_SECRET_PLACEHOLDER"""

FAKE_GIT_CONFIG = """[core]
\trepositoryformatversion = 0
\tfilemode = true
\tbare = false
\tlogallrefupdates = true
[remote "origin"]
\turl = git@github.com:mycompany/mysite-production.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
\tremote = origin
\tmerge = refs/heads/main
[user]
\tname = Deploy Bot
\temail = deploy@mysite.com
"""

ADMIN_LOGIN = """<!DOCTYPE html>
<html>
<head><title>Admin Panel - Login</title>
<style>
  body { font-family: Arial; background: #1a1a2e; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
  .box { background: white; padding: 40px; border-radius: 8px; width: 320px; }
  h2 { text-align: center; color: #333; }
  input { width: 100%; padding: 10px; margin: 8px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
  button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
</style>
</head>
<body>
<div class="box">
  <h2>Admin Login</h2>
  <form method="POST" action="/admin/login">
    <input type="text" name="username" placeholder="Username" required/>
    <input type="password" name="password" placeholder="Password" required/>
    <button type="submit">Login</button>
  </form>
</div>
</body>
</html>"""

PHPMYADMIN_LOGIN = """<!DOCTYPE html>
<html>
<head><title>phpMyAdmin</title>
<link rel="shortcut icon" href="favicon.ico" type="image/x-icon"/>
</head>
<body>
<div id="pma_navigation"></div>
<div id="page_content">
  <h1>phpMyAdmin 5.2.1</h1>
  <form method="post" action="index.php">
    <table>
      <tr><td>Server:</td><td><input type="text" name="pma_servername" value="127.0.0.1"/></td></tr>
      <tr><td>Username:</td><td><input type="text" name="pma_username"/></td></tr>
      <tr><td>Password:</td><td><input type="password" name="pma_password"/></td></tr>
      <tr><td colspan="2"><input type="submit" value="Go" /></td></tr>
    </table>
  </form>
</div>
</body>
</html>"""

MYSQL_ERROR = """<br>
<b>Warning</b>: mysqli_connect(): (HY000/1045): Access denied for user 'root'@'localhost' (using password: YES) in <b>/var/www/html/db.php</b> on line <b>8</b><br>
<b>Fatal error</b>: Uncaught mysqli_sql_exception: Access denied for user 'root'@'localhost' (using password: YES) in /var/www/html/db.php:8
Stack trace:
#0 /var/www/html/db.php(8): mysqli_connect()
#1 {main}
  thrown in <b>/var/www/html/db.php</b> on line <b>8</b><br>"""

GENERIC_404 = """<!DOCTYPE html>
<html><head><title>404 Not Found</title></head>
<body>
<h1>Not Found</h1>
<p>The requested URL was not found on this server.</p>
<hr><address>Apache/2.4.57 (Ubuntu) Server at localhost Port 80</address>
</body></html>"""

GENERIC_200 = """<!DOCTYPE html>
<html><head><title>Welcome</title></head>
<body>
<h1>It works!</h1>
<p>This is the default web page for this server.</p>
<p>The web server software is running but no content has been added, yet.</p>
<hr><address>Apache/2.4.57 (Ubuntu) Server at localhost Port 80</address>
</body></html>"""


# --- Route table ---
# Maps path patterns to response generators

def _wp_login(method: str, body: str) -> tuple[str, str, int]:
    if method == "POST":
        # Fake a failed login to keep the attacker trying
        return (
            WORDPRESS_LOGIN.replace("</form>", '<p class="message">ERROR: The password you entered is incorrect.</p></form>'),
            "text/html",
            200,
        )
    return (WORDPRESS_LOGIN, "text/html", 200)


def _env(_method: str, _body: str) -> tuple[str, str, int]:
    return (FAKE_ENV, "text/plain", 200)


def _git_config(_method: str, _body: str) -> tuple[str, str, int]:
    return (FAKE_GIT_CONFIG, "text/plain", 200)


def _admin(method: str, body: str) -> tuple[str, str, int]:
    if method == "POST":
        return (
            ADMIN_LOGIN.replace("</form>", '<p style="color:red;text-align:center">Invalid credentials.</p></form>'),
            "text/html",
            200,
        )
    return (ADMIN_LOGIN, "text/html", 200)


def _phpmyadmin(_method: str, _body: str) -> tuple[str, str, int]:
    return (PHPMYADMIN_LOGIN, "text/html", 200)


def _mysql_error(_method: str, _body: str) -> tuple[str, str, int]:
    return (MYSQL_ERROR, "text/html", 500)


def _not_found(_method: str, _body: str) -> tuple[str, str, int]:
    return (GENERIC_404, "text/html", 404)


def _default(_method: str, _body: str) -> tuple[str, str, int]:
    return (GENERIC_200, "text/html", 200)


# Path prefix → handler (checked in order)
ROUTE_TABLE: list[tuple[str, Callable]] = [
    ("/wp-login.php",        _wp_login),
    ("/wp-admin",            _wp_login),
    ("/wordpress/wp-login",  _wp_login),
    ("/.env",                _env),
    ("/.env.",               _env),   # .env.local, .env.production, etc.
    ("/.git/config",         _git_config),
    ("/.git/",               _git_config),
    ("/phpmyadmin",          _phpmyadmin),
    ("/pma",                 _phpmyadmin),
    ("/myadmin",             _phpmyadmin),
    ("/admin",               _admin),
    ("/administrator",       _admin),
    ("/panel",               _admin),
    ("/dashboard",           _admin),
    ("/login",               _admin),
    ("/cpanel",              _admin),
]

# Paths that look like SQL injection probes → respond with MySQL error
SQLI_PATHS = re.compile(r"(\bUNION\b|\bSELECT\b|%27|'|\bOR\b\s+\d)", re.I)


def get_response(path: str, method: str, body: str, attack_type: str) -> tuple[str, str, int]:
    """Return (body, content_type, status_code) for the given request."""
    # SQL injection → fake MySQL error (very convincing)
    if attack_type == "sqli":
        return _mysql_error(method, body)

    # Match route table by prefix
    for prefix, handler in ROUTE_TABLE:
        if path.lower().startswith(prefix.lower()):
            return handler(method, body)

    # Everything else gets a generic Apache 404 (not 200, avoids indexing issues)
    return _not_found(method, body)
