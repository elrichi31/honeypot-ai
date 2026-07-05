#!/usr/bin/env python3
"""
Local stress/load test for the honeypot stack (SSH, HTTP, FTP, MySQL, port
scans). Hits ONLY 127.0.0.1 — never point this at a remote host.

Traffic all originates from this machine's IP (no spoofing: web-honeypot
deliberately ignores X-Forwarded-For, see sensors/web-honeypot/app.py).
Variety comes from randomized credentials, paths, user-agents, and payloads
per request instead, so the dashboard sees realistic-looking noise rather
than identical repeated events.

Usage:
    python scripts/stress-test.py --duration 60 --concurrency 20
    python scripts/stress-test.py --duration 30 --concurrency 10 --protocols http,ftp
"""
from __future__ import annotations

import argparse
import asyncio
import random
import shutil
import socket
import ssl
import string
import subprocess
import sys
import time
from dataclasses import dataclass, field

TARGET_HOST = "127.0.0.1"

SSH_PORT = 22
HTTP_PORT = 8080
FTP_PORT = 2121
MYSQL_PORT = 3307
PORT_HONEYPOT_PORTS = [8888, 9090, 6379, 27017]

USERNAMES = ["root", "admin", "user", "test", "ubuntu", "oracle", "postgres", "deploy", "www-data", "guest"]
PASSWORDS = ["123456", "password", "admin123", "root1234", "Passw0rd!", "qwerty12", "letmein12", "P@ssword1"]

USER_AGENTS = [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    "curl/8.4.0",
    "python-requests/2.31.0",
    "Go-http-client/1.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/119.0",
    "Nmap Scripting Engine",
    "Wget/1.21.3",
    "Zgrab/0.x",
    "Mozilla/5.0 (compatible; Nuclei - Open-source project)",
]

HTTP_PATHS = [
    "/", "/wp-login.php", "/admin", "/.env", "/phpmyadmin", "/actuator/health",
    "/api/v1/users", "/../../etc/passwd", "/index.php?id=1' OR '1'='1",
    "/console", "/.git/config", "/shell.php", "/xmlrpc.php", "/robots.txt",
    "/api/login", "/wp-content/uploads/shell.php", "/cgi-bin/test.cgi",
    "/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php",
]

FTP_COMMANDS = ["USER anonymous", "PASS guest@", "LIST", "PWD", "SYST", "QUIT"]


@dataclass
class Stats:
    attempts: int = 0
    successes: int = 0
    errors: int = 0
    by_protocol: dict[str, int] = field(default_factory=dict)

    def record(self, protocol: str, ok: bool) -> None:
        self.attempts += 1
        self.successes += int(ok)
        self.errors += int(not ok)
        self.by_protocol[protocol] = self.by_protocol.get(protocol, 0) + 1


def rand_str(n: int) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


async def hit_http(stats: Stats) -> None:
    """Send one HTTP request with a random path/method/user-agent/body."""
    path = random.choice(HTTP_PATHS)
    method = random.choice(["GET", "GET", "GET", "POST"])
    ua = random.choice(USER_AGENTS)
    body = ""
    if method == "POST":
        body = f"username={rand_str(6)}&password={rand_str(8)}"
    req = (
        f"{method} {path} HTTP/1.1\r\n"
        f"Host: {TARGET_HOST}\r\n"
        f"User-Agent: {ua}\r\n"
        f"Accept: */*\r\n"
        f"Content-Length: {len(body)}\r\n"
        f"Connection: close\r\n"
        f"\r\n{body}"
    )
    try:
        reader, writer = await asyncio.open_connection(TARGET_HOST, HTTP_PORT)
        writer.write(req.encode())
        await writer.drain()
        await asyncio.wait_for(reader.read(2048), timeout=5)
        writer.close()
        await writer.wait_closed()
        stats.record("http", True)
    except Exception:
        stats.record("http", False)


async def hit_ftp(stats: Stats) -> None:
    """Connect to the FTP honeypot and run a few plausible commands."""
    try:
        reader, writer = await asyncio.open_connection(TARGET_HOST, FTP_PORT)
        await asyncio.wait_for(reader.read(512), timeout=5)  # banner
        for cmd in FTP_COMMANDS:
            writer.write((cmd + "\r\n").encode())
            await writer.drain()
            await asyncio.wait_for(reader.read(512), timeout=5)
        writer.close()
        await writer.wait_closed()
        stats.record("ftp", True)
    except Exception:
        stats.record("ftp", False)


async def hit_mysql(stats: Stats) -> None:
    """Just complete the initial handshake read + send garbage auth bytes.

    Not a real MySQL client (no protocol lib available) — this only exercises
    the honeypot's connection/greeting handling, which is what the sensor
    logs as a connect+auth-attempt event either way.
    """
    try:
        reader, writer = await asyncio.open_connection(TARGET_HOST, MYSQL_PORT)
        await asyncio.wait_for(reader.read(256), timeout=5)  # server greeting
        writer.write(bytes(random.randint(20, 60)) + rand_str(8).encode())
        await writer.drain()
        await asyncio.wait_for(reader.read(256), timeout=5)
        writer.close()
        await writer.wait_closed()
        stats.record("mysql", True)
    except Exception:
        stats.record("mysql", False)


async def hit_port_honeypot(stats: Stats) -> None:
    """Open+probe a random port on the generic port-honeypot service."""
    port = random.choice(PORT_HONEYPOT_PORTS)
    try:
        reader, writer = await asyncio.open_connection(TARGET_HOST, port)
        writer.write(rand_str(random.randint(4, 32)).encode() + b"\r\n")
        await writer.drain()
        await asyncio.wait_for(reader.read(256), timeout=5)
        writer.close()
        await writer.wait_closed()
        stats.record("port-honeypot", True)
    except Exception:
        stats.record("port-honeypot", False)


def ssh_login_blocking() -> bool:
    """Run a single real SSH login attempt against Cowrie via the system
    ssh client (subprocess) — Cowrie speaks real SSH, easiest to drive with
    the actual binary rather than reimplementing the protocol by hand.
    """
    user = random.choice(USERNAMES)
    password = random.choice(PASSWORDS)
    cmd = [
        "sshpass", "-p", password,
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "ConnectTimeout=5",
        "-o", "LogLevel=ERROR",
        "-p", str(SSH_PORT),
        f"{user}@{TARGET_HOST}",
        "whoami; id; uname -a; exit",
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=10)
        return True
    except Exception:
        return False


async def hit_ssh(stats: Stats, executor) -> None:
    loop = asyncio.get_event_loop()
    ok = await loop.run_in_executor(executor, ssh_login_blocking)
    stats.record("ssh", ok)


PROTOCOL_HANDLERS = {
    "http": hit_http,
    "ftp": hit_ftp,
    "mysql": hit_mysql,
    "port": hit_port_honeypot,
}


async def worker(protocols: list[str], stats: Stats, stop_at: float, executor) -> None:
    while time.monotonic() < stop_at:
        protocol = random.choice(protocols)
        if protocol == "ssh":
            await hit_ssh(stats, executor)
        else:
            await PROTOCOL_HANDLERS[protocol](stats)
        await asyncio.sleep(random.uniform(0.05, 0.3))


async def print_progress(stats: Stats, stop_at: float) -> None:
    while time.monotonic() < stop_at:
        await asyncio.sleep(2)
        remaining = max(0, int(stop_at - time.monotonic()))
        print(
            f"[{remaining:>3}s left] attempts={stats.attempts} ok={stats.successes} "
            f"err={stats.errors} by_protocol={stats.by_protocol}",
            flush=True,
        )


def check_ssh_prereqs(protocols: list[str]) -> list[str]:
    """Drop 'ssh' from the protocol list with a warning if sshpass is missing
    (non-interactive password auth needs it; plain ssh would hang on a prompt)."""
    if "ssh" in protocols and not shutil.which("sshpass"):
        print(
            "[warn] 'sshpass' not found — skipping SSH/Cowrie load "
            "(install it, e.g. via WSL/Git Bash package manager, to include SSH)",
            file=sys.stderr,
        )
        return [p for p in protocols if p != "ssh"]
    return protocols


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--duration", type=int, default=60, help="Seconds to run (default: 60)")
    parser.add_argument("--concurrency", type=int, default=10, help="Concurrent workers (default: 10)")
    parser.add_argument(
        "--protocols", type=str, default="http,ftp,mysql,port,ssh",
        help="Comma-separated subset of: http,ftp,mysql,port,ssh (default: all)",
    )
    args = parser.parse_args()

    protocols = [p.strip() for p in args.protocols.split(",") if p.strip()]
    unknown = set(protocols) - {"http", "ftp", "mysql", "port", "ssh"}
    if unknown:
        parser.error(f"unknown protocol(s): {', '.join(unknown)}")
    protocols = check_ssh_prereqs(protocols)
    if not protocols:
        parser.error("no protocols left to run")

    print(f"[stress-test] target={TARGET_HOST} duration={args.duration}s concurrency={args.concurrency} protocols={protocols}")
    print("[stress-test] this only hits localhost — safe for the local honeypot stack.\n")

    stats = Stats()
    stop_at = time.monotonic() + args.duration

    import concurrent.futures
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=max(4, args.concurrency))

    workers = [asyncio.create_task(worker(protocols, stats, stop_at, executor)) for _ in range(args.concurrency)]
    progress = asyncio.create_task(print_progress(stats, stop_at))

    await asyncio.gather(*workers)
    progress.cancel()
    executor.shutdown(wait=False)

    print("\n[stress-test] done.")
    print(f"  total attempts : {stats.attempts}")
    print(f"  ok             : {stats.successes}")
    print(f"  errors         : {stats.errors}")
    print(f"  by protocol    : {stats.by_protocol}")


if __name__ == "__main__":
    if TARGET_HOST not in ("127.0.0.1", "localhost", "::1"):
        print("Refusing to run: this script is hardcoded to localhost only.", file=sys.stderr)
        sys.exit(1)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[stress-test] interrupted.")
