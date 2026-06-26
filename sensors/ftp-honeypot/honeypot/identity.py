import os
from datetime import datetime, timezone, timedelta

FTP_BANNER = os.getenv("FTP_BANNER", "220 (vsFTPd 3.0.5)\r\n")


def _rel_mtime(days_ago: int, hour: int = 8, minute: int = 30) -> str:
    """Return a LIST-format mtime relative to today, e.g. 'Jun 23 08:30'."""
    dt = datetime.now(timezone.utc) - timedelta(days=days_ago)
    return dt.strftime(f"%b %{'-' if dt.day < 10 else ''}d {hour:02d}:{minute:02d}").replace("  ", " ")


# Single source of truth: {filename: (size_bytes, mtime_str)}
DECOY_CATALOG: dict[str, tuple[int, str]] = {
    "backup_2024.tar.gz":  (4096,  _rel_mtime(15, 2, 0)),
    ".credentials":        (512,   _rel_mtime(9, 14, 0)),
    "database_dump.sql":   (8192,  _rel_mtime(11, 11, 0)),
}

FAKE_LISTING = (
    "drwxr-xr-x 3 root root 4096 " + _rel_mtime(30, 0, 0) + " .\r\n"
    "drwxr-xr-x 3 root root 4096 " + _rel_mtime(30, 0, 0) + " ..\r\n"
    + "".join(
        f"-rw-r--r-- 1 root root {size:5d} {mtime} {name}\r\n"
        for name, (size, mtime) in DECOY_CATALOG.items()
        if name != ".credentials"
    )
    + f"-rw------- 1 root root {DECOY_CATALOG['.credentials'][0]:5d} {DECOY_CATALOG['.credentials'][1]} .credentials\r\n"
    "drwxr-xr-x 2 root root 4096 " + _rel_mtime(20, 0, 0) + " uploads\r\n"
)

_DECOY_TEMPLATES: dict[str, str] = {
    ".credentials": (
        "# production service account\n"
        "ftp_user=svc_backup\nftp_pass=Bk!p_Pr0d_2024\n"
        "db_host=db-primary.{domain}\ndb_user={org}_app\ndb_pass={org}!db_Pr0d_2024\n"
    ),
    "database_dump.sql": (
        "-- MySQL dump 10.13  Distrib 5.7.44, for Linux (x86_64)\n"
        "-- Host: db-primary.{domain}    Database: {org}_prod\n"
        "INSERT INTO users VALUES (1,'admin','$2y$10$Hk3mP9vQ2xR7tY4wN8zL6uF1cB5dA0sE');\n"
    ),
}


def get_decoy_content(filename: str) -> str | None:
    tmpl = _DECOY_TEMPLATES.get(filename)
    if tmpl is None:
        return None
    domain = os.getenv("SENSOR_DOMAIN", "corp.internal")
    org = os.getenv("SENSOR_HOSTNAME", "web-prod-01").split("-")[0]
    return tmpl.format(domain=domain, org=org)
