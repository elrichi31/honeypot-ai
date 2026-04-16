---
title: Two-Host (topologia recomendada)
description: Como desplegar honeypots en un VPS publico y la app en un servidor separado, con HTTPS publico para el dashboard.
---

import { Aside, Steps } from '@astrojs/starlight/components';

La topologia de dos hosts es la arquitectura recomendada para produccion. Separa fisicamente el plano de captura del plano de analisis — si un atacante compromete el VPS honeypot, no tiene acceso a la base de datos ni al dashboard.

El canal entre los dos servidores es una **VPN privada** (Tailscale, WireGuard, etc.). No se abre ningun puerto sensible a internet publico.

```
internet publico
  VPS honeypot (100.x.y.z via VPN)        Servidor app (100.a.b.c via VPN)
  ──────────────────────────────           ────────────────────────────────
  :22   → Cowrie (SSH honeypot)            :443 → Caddy → dashboard :4000
  :80   → web-honeypot (HTTP)             :3000 → ingest-api (solo VPN)
  :8022 → sshd admin                       postgres (solo red interna)
       │                                        ▲         ▲
       │  HTTP por VPN: POST /ingest/web/event  │         │
       └────────────────────────────────────────┘         │
                                                          │
                                            log-puller (SSH pull via VPN)
                                            apunta a 100.x.y.z:8022
```

## Que hace cada archivo de compose

| Archivo | Donde corre |
|---------|-------------|
| `docker-compose.prod.honeypot.yml` | VPS honeypot |
| `docker-compose.prod.app.yml` | Servidor app |
| `Caddyfile` | Servidor app (montado por el contenedor caddy) |

## Variables de entorno necesarias

### En el servidor app (`.env`)

```bash
# Secrets — genera cada uno con: openssl rand -base64 32
BETTER_AUTH_SECRET=
POSTGRES_PASSWORD=
INGEST_SHARED_SECRET=

# Dominio publico del dashboard (debe apuntar a la IP del servidor app)
DASHBOARD_DOMAIN=dashboard.tudominio.com
API_DOMAIN=api.tudominio.com         # subdominio para ingest-api (browser calls)

# URL publica de ingest-api (usada por el navegador del admin)
NEXT_PUBLIC_API_URL=https://api.tudominio.com

# VPN: como llega el log-puller al VPS honeypot por SSH
HONEYPOT_VPN_IP=100.x.y.z           # IP Tailscale/WireGuard del VPS honeypot
HONEYPOT_SSH_PORT=8022
HONEYPOT_SSH_USER=root
SSH_KEY=~/.ssh/honeypot_vps         # clave privada en el servidor app

# Opcional
HONEYPOT_IP=<ip-publica-vps>        # pre-carga Settings en el dashboard
DASHBOARD_TIMEZONE=UTC
```

### En el VPS honeypot (`.env`)

```bash
# URL VPN del servidor app — el web-honeypot envia eventos aqui
INGEST_API_URL=http://100.a.b.c:3000   # IP VPN del servidor app

INGEST_SHARED_SECRET=<mismo-valor-que-en-servidor-app>
```

## Paso 1 — VPS honeypot: mover SSH admin y levantar honeypots

<Steps>
1. Mueve SSH real a otro puerto antes de que Cowrie tome el `:22`:

   ```bash
   # En /etc/ssh/sshd_config del VPS:
   Port 8022
   sudo systemctl reload sshd
   # Verifica acceso por 8022 antes de cerrar la sesion actual
   ```

2. Configura la VPN entre los dos servidores (ejemplo con Tailscale):

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   tailscale up
   # Anota la IP Tailscale: tailscale ip -4
   ```

3. Levanta los honeypots:

   ```bash
   git clone <repo-url>
   cd honeypot-ai

   # Crea .env con INGEST_API_URL=http://<ip-tailscale-servidor-app>:3000
   cp .env.example .env

   docker compose -f docker-compose.prod.honeypot.yml up -d
   docker compose -f docker-compose.prod.honeypot.yml ps
   ```
</Steps>

## Paso 2 — Servidor app: preparar SSH key para el puller

<Steps>
1. Instala Tailscale en el servidor app y conectalo a la misma red:

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   tailscale up
   ```

2. Genera una clave SSH dedicada para el log-puller:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/honeypot_vps -N ""
   ```

3. Copia la clave publica al VPS honeypot (via VPN):

   ```bash
   ssh-copy-id -p 8022 -i ~/.ssh/honeypot_vps.pub root@<ip-vpn-del-vps>
   # Verifica: ssh -p 8022 -i ~/.ssh/honeypot_vps root@<ip-vpn-del-vps> echo ok
   ```
</Steps>

## Paso 3 — Servidor app: DNS y levantar servicios

<Steps>
1. Apunta `dashboard.tudominio.com` y `api.tudominio.com` a la IP publica del servidor app.

2. Crea el `.env` con todos los valores:

   ```bash
   git clone <repo-url>
   cd honeypot-ai

   export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
   export POSTGRES_PASSWORD=$(openssl rand -base64 32)
   export INGEST_SHARED_SECRET=$(openssl rand -base64 32)
   # Completa el resto en .env (DASHBOARD_DOMAIN, API_DOMAIN, HONEYPOT_VPN_IP, etc.)
   ```

3. Levanta todos los servicios:

   ```bash
   docker compose -f docker-compose.prod.app.yml up --build -d
   docker compose -f docker-compose.prod.app.yml ps
   ```

   Caddy obtiene el certificado TLS automaticamente (requiere que el DNS ya apunte al servidor).

4. Verifica:

   ```bash
   curl https://dashboard.tudominio.com/api/health  # deberia devolver {"status":"ok"}
   docker compose -f docker-compose.prod.app.yml logs -f log-puller
   # Deberias ver: [pull] Mode: REMOTE (root@100.x.y.z:8022)
   ```
</Steps>

## Firewall recomendado en el servidor app

El servidor app tiene `ingest-api` en `:3000` — solo el VPS honeypot debe poder llegar ahi (via VPN). Bloquea el acceso publico:

```bash
# Con ufw (Ubuntu/Debian)
ufw allow 80/tcp    # Caddy HTTP (redireccion a HTTPS)
ufw allow 443/tcp   # Caddy HTTPS
ufw deny 3000/tcp   # ingest-api — solo accesible por VPN (la VPN usa su propia interfaz)
ufw deny 5432/tcp   # postgres — nunca publico
ufw enable
```

La VPN (Tailscale/WireGuard) usa su propia interfaz de red (`tailscale0` / `wg0`), asi que el trafico VPN no pasa por las reglas de `ufw` para interfaces publicas. El VPS honeypot puede llegar a `:3000` por VPN sin problemas.

## Acceder al dashboard

Con esta topologia el dashboard es accesible publicamente con HTTPS:

```
https://dashboard.tudominio.com
```

No necesitas tunnel SSH ni VPN para ver el dashboard. Solo necesitas tu usuario y contrasena de better-auth.

<Aside type="tip">
Aunque el dashboard es publico, la base de datos y ingest-api siguen siendo inaccesibles desde internet. El blast radius si comprometen el dashboard es solo la capa de aplicacion, no los datos crudos en postgres.
</Aside>

## Comparacion con single-host

| Aspecto | Single-host | Two-host |
|---------|-------------|----------|
| Costo | Un VPS | Dos servidores |
| Acceso al dashboard | SSH tunnel o VPN | HTTPS publico directo |
| Aislamiento honeypot / datos | Redes Docker | Hosts fisicamente separados |
| Blast radius si escapa contenedor | Todo el mismo host | Solo el VPS honeypot |
| Postgres expuesto | No | No |
| Complejidad operativa | Baja | Media |

## Comandos de mantenimiento

```bash
# Ver logs del puller
docker compose -f docker-compose.prod.app.yml logs -f log-puller

# Reiniciar dashboard tras cambio de env
docker compose -f docker-compose.prod.app.yml up -d --force-recreate dashboard

# Ver estado de certificados Caddy
docker compose -f docker-compose.prod.app.yml exec caddy caddy list-certificates
```
