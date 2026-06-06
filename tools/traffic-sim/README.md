# Honeypot Traffic Simulator

Generates attacker-style traffic against **your own** honeypot sensors so they
have realistic activity to capture: HTTP recon/injection, SSH brute-force +
post-login commands, FTP logins, and port-scanner probes.

> ⚠️ **Authorized lab use only.** Only run this against honeypots you own or are
> explicitly authorized to test. It performs brute-force logins and sends
> injection payloads — exactly the kind of traffic you must never aim at systems
> you don't control.

## Requirements

```bash
pip install paramiko requests
```

(`web` needs `requests`; `ssh` needs `paramiko`. `ports` and `ftp` use only the
standard library. Missing libs are skipped with a warning, not a crash.)

## Usage

Run everything against your honeypot:

```bash
python honeypot_traffic.py --host 192.168.72.130
```

Run only specific sensors:

```bash
python honeypot_traffic.py --host 192.168.72.130 --only ssh,web
```

Repeat the whole run several times (more volume, more sessions):

```bash
python honeypot_traffic.py --host 192.168.72.130 --rounds 3
```

### Options

| Flag | Default | Meaning |
|------|---------|---------|
| `--host` | _(required)_ | Honeypot IP or hostname |
| `--only` | `web,ssh,ports,ftp` | Which simulations to run (comma-separated) |
| `--http-port` | `80` | Web honeypot port |
| `--ssh-port` | `22` | **Cowrie** port — *not* the real sshd (the installer moves the real sshd to `8022`) |
| `--rounds` | `1` | Repeat the full run N times |

## What it sends

- **web** — recon paths (`/.env`, `/.git/config`, phpunit RCE…), SQLi/XSS/command-injection
  query params, and login brute-force POSTs, all with scanner User-Agents (sqlmap, Nikto, zgrab…).
- **ssh** — failed brute-force attempts plus successful logins using the bundled
  Cowrie `userdb.txt` credentials, then attacker commands (recon, malware drop,
  cron/`authorized_keys` persistence, log wiping) inside the shell.
- **ports** — TCP connects with a representative payload to the port-honeypot
  services (Redis, MSSQL, RDP, MongoDB, Elasticsearch, alt-HTTP).
- **ftp** — anonymous and common-credential logins followed by `SYST` / `LIST`.

## Where to see the results

After running, check the dashboard:

- **Web Attacks** — the HTTP recon/injection/login traffic
- **Sessions / Commands / Credentials** — SSH logins and post-login commands
- **Network Honeypots → FTP** and **→ Port Scan**
- **Threats** — the source IP should surface with a high/critical score once the
  evaluation worker runs (every ~30s); the threats screen cache refreshes every 3 min.

## Notes

- SSH successful logins rely on the passwords in `sensors/cowrie/userdb.txt`. If
  you changed that whitelist, update `SSH_VALID` at the top of the script.
- All traffic targets the host you pass in; nothing leaves for the public internet.
