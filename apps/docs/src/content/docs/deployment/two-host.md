---
title: Two-Host (topologia recomendada)
description: Como desplegar honeypots en un VPS publico y la app en un servidor separado, con HTTPS publico para el dashboard.
---

import { Aside, Steps } from '@astrojs/starlight/components';

La topologia de dos hosts es la arquitectura recomendada para produccion. Separa fisicamente el plano de captura del plano de analisis — si un atacante compromete el VPS honeypot, no tiene acceso a la base de datos ni al dashboard.

El canal entre los dos servidores es una **VPN privada** (Tailscale, WireGuard, etc.). Vector corre como sidecar en el VPS honeypot y **empuja** los logs a ingest-api via VPN. No se necesita SSH ni credenciales en el servidor app.

```
internet publico
  VPS honeypot (100.x.y.z via VPN)        Servidor app (100.a.b.c via VPN)
  ──────────────────────────────           ────────────────────────────────
  :22   → Cowrie (SSH honeypot)            :443 → Caddy → dashboard :4000
  :80   → web-honeypot (HTTP)             :3000 → ingest-api (solo VPN)
  :8022 → sshd admin                       postgres (solo red interna)
       │                                        ▲
       │  Vector (push via VPN)                 │
       │  POST /ingest/cowrie/vector ───────────┘
       │
       │  web-honeypot
       │  POST /ingest/web/event ──────────────┘
```

## Que hace cada archivo de compose

| Archivo | Donde corre |
|---------|-------------|
| `docker-compose.prod.honeypot.yml` | VPS honeypot (Cowrie + web-honeypot + Vector) |
| `docker-compose.prod.app.yml` | Servidor app (postgres + ingest-api + dashboard + Caddy) |
| `Caddyfile` | Servidor app (montado por el contenedor caddy) |

## Variables de entorno necesarias

### En el VPS honeypot (`.env`)

```bash
# URL VPN del servidor app (IP Tailscale o WireGuard)
INGEST_API_URL=http://100.a.b.c:3000

# Mismo secret que usaras en el servidor app
INGEST_SHARED_SECRET=<genera con openssl rand -base64 32>
```

### En el servidor app (`.env`)

```bash
# Secrets — genera cada uno con: openssl rand -base64 32
BETTER_AUTH_SECRET=
POSTGRES_PASSWORD=
INGEST_SHARED_SECRET=          # mismo valor que en el VPS honeypot

# Dominio publico del dashboard (debe apuntar a la IP del servidor app)
DASHBOARD_DOMAIN=dashboard.tudominio.com
API_DOMAIN=api.tudominio.com   # subdominio para ingest-api (browser calls)

# URL publica de ingest-api (usada por el navegador del admin)
NEXT_PUBLIC_API_URL=https://api.tudominio.com

# Opcional
HONEYPOT_IP=<ip-publica-del-vps>
DASHBOARD_TIMEZONE=UTC
DISCORD_WEBHOOK_URL=
```

## Paso 1 — VPS honeypot: mover SSH admin y levantar honeypots

<Steps>
1. Mueve SSH real a otro puerto antes de que Cowrie tome el `:22`:

   ```bash
   # En /etc/ssh/sshd_config del VPS:
   Port 8022
   sudo systemctl reload sshd
   # Verifica acceso por 8022 antes de cerrar la sesion actual
   ssh -p 8022 <usuario>@<ip-del-vps>
   ```

2. Configura la VPN entre los dos servidores (ejemplo con Tailscale):

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   tailscale up
   # Anota la IP Tailscale del VPS honeypot: tailscale ip -4
   # Anota tambien la IP Tailscale del servidor app
   ```

3. Clona el repositorio y crea el `.env`:

   ```bash
   git clone <repo-url>
   cd honeypot-ai

   # Crea el .env con la IP Tailscale del servidor app
   cp .env.example .env
   # Edita:
   #   INGEST_API_URL=http://<ip-tailscale-servidor-app>:3000
   #   INGEST_SHARED_SECRET=<genera con openssl rand -base64 32>
   ```

4. Levanta los honeypots y Vector:

   ```bash
   docker compose -f docker-compose.prod.honeypot.yml up --build -d
   docker compose -f docker-compose.prod.honeypot.yml ps
   ```

   Servicios que deben estar `running`: `cowrie`, `web-honeypot`, `vector`.
</Steps>

## Paso 2 — Servidor app: DNS y levantar servicios

<Steps>
1. Instala Tailscale en el servidor app y conectalo a la misma red:

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   tailscale up
   ```

2. Apunta `dashboard.tudominio.com` y `api.tudominio.com` a la IP publica del servidor app.

3. Clona el repositorio y crea el `.env`:

   ```bash
   git clone <repo-url>
   cd honeypot-ai

   export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
   export POSTGRES_PASSWORD=$(openssl rand -base64 32)
   export INGEST_SHARED_SECRET=$(openssl rand -base64 32)
   # Completa el resto en .env (DASHBOARD_DOMAIN, API_DOMAIN, HONEYPOT_IP, etc.)
   ```

4. Levanta todos los servicios:

   ```bash
   docker compose -f docker-compose.prod.app.yml up --build -d
   docker compose -f docker-compose.prod.app.yml ps
   ```

   Caddy obtiene el certificado TLS automaticamente (requiere que el DNS ya apunte al servidor).

5. Verifica que la comunicacion funciona:

   ```bash
   # Health check del servidor app
   curl https://api.tudominio.com/health

   # Ver que Vector esta enviando eventos desde el VPS
   # (en el VPS honeypot)
   docker logs -f vector
   # Deberias ver lineas como:
   # INFO vector::sinks::http: Request finished. status=200 body_size=...
   ```
</Steps>

## Paso 3 — Verificar el flujo completo

```bash
# Desde cualquier maquina, simula un ataque SSH al VPS:
ssh root@<ip-publica-del-vps>

# En el servidor app, comprueba que el evento llego:
curl https://api.tudominio.com/sessions | head -c 500
```

En el dashboard (`https://dashboard.tudominio.com`) deberias ver la sesion aparecer en segundos.

## Firewall recomendado en el servidor app

El servidor app tiene `ingest-api` en `:3000` — solo el VPS honeypot debe poder llegar ahi (via VPN). Bloquea el acceso publico:

```bash
# Con ufw (Ubuntu/Debian)
ufw allow 80/tcp    # Caddy HTTP (redireccion a HTTPS)
ufw allow 443/tcp   # Caddy HTTPS
ufw deny 3000/tcp   # ingest-api — solo accesible por VPN
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
| SSH key en servidor app | No | No (Vector push) |
| Complejidad operativa | Baja | Media |

## Comandos de mantenimiento

```bash
# --- En el VPS honeypot ---

# Ver logs de Vector (envio de eventos)
docker compose -f docker-compose.prod.honeypot.yml logs -f vector

# Ver logs de Cowrie (conexiones SSH)
docker compose -f docker-compose.prod.honeypot.yml logs -f cowrie

# Reiniciar Vector tras un cambio de config
docker compose -f docker-compose.prod.honeypot.yml restart vector

# Estado de todos los servicios del VPS
docker compose -f docker-compose.prod.honeypot.yml ps


# --- En el servidor app ---

# Ver logs de ingest-api
docker compose -f docker-compose.prod.app.yml logs -f ingest-api

# Reiniciar dashboard tras cambio de env
docker compose -f docker-compose.prod.app.yml up -d --force-recreate dashboard

# Ver estado de certificados Caddy
docker compose -f docker-compose.prod.app.yml exec caddy caddy list-certificates

# Estado de todos los servicios del servidor app
docker compose -f docker-compose.prod.app.yml ps
```
