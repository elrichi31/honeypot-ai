---
title: Single-Host (un solo VPS)
description: Como desplegar toda la plataforma en un unico VPS con redes Docker separadas.
---

import { Aside, Steps } from '@astrojs/starlight/components';

El modo single-host corre todos los servicios en el mismo servidor usando `docker-compose.prod.single-host.yml`. Es la opcion mas economica y funciona bien para investigacion personal o laboratorios.

<Aside type="caution">
En single-host, si un atacante logra escapar un contenedor a nivel de kernel, tiene acceso al mismo host donde viven los datos. Para mayor aislamiento, usa la [topologia dos hosts](/deployment/two-host/).
</Aside>

## Que hace este compose

- Publica solo los puertos del honeypot: `22` (Cowrie), `80` y `8443` (web-honeypot)
- Deja el `dashboard` en `127.0.0.1:4000` — no alcanzable desde internet
- No publica `ingest-api` ni `postgres`
- Corre **Vector** como sidecar de Cowrie para enviar logs a ingest-api via red interna
- Separa la red `edge` (honeypot) de las redes `app_api` y `db_private`
- Aplica `no-new-privileges`, `cap_drop: ALL` y `pids_limit` a todos los servicios

## Redes Docker en single-host

```
edge          → cowrie, web-honeypot
honeypot_ingest → web-honeypot, vector, ingest-api
app_api       → ingest-api, dashboard
db_private    → postgres, ingest-api, dashboard
```

Cowrie solo esta en `edge` — no tiene ninguna ruta a postgres ni al dashboard.

## Requisitos previos

- VPS con Docker y Docker Compose v2 instalados
- Puerto `22` libre (mueve tu SSH admin a otro puerto antes de levantar Cowrie)

## Paso 1 — Mover el SSH admin

Antes de publicar Cowrie en el puerto `22`, mueve el SSH real del servidor:

```bash
# En el VPS, edita /etc/ssh/sshd_config:
Port 8022

# Recarga sshd
sudo systemctl reload sshd

# Verifica que puedes entrar por el nuevo puerto ANTES de cerrar la sesion actual
ssh -p 8022 <usuario>@<ip-del-vps>
```

<Aside type="danger">
No cierres la sesion SSH actual hasta confirmar que puedes abrir una nueva por el puerto `8022`. Si cierras antes de verificar, puedes quedarte sin acceso al servidor.
</Aside>

## Paso 2 — Levantar los servicios

```bash
git clone <repo-url>
cd honeypot-ai

export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
export POSTGRES_PASSWORD=$(openssl rand -base64 32)
export INGEST_SHARED_SECRET=$(openssl rand -base64 32)

docker compose -f docker-compose.prod.single-host.yml up --build -d
docker compose -f docker-compose.prod.single-host.yml ps
```

Espera a que todos los servicios esten `healthy` antes de continuar. El orden de arranque es:

1. `postgres` — espera healthcheck `pg_isready`
2. `ingest-api` — espera healthcheck HTTP `/health`
3. `cowrie`, `web-honeypot`, `dashboard`, `vector` — arrancan cuando ingest-api esta sano

## Paso 3 — Acceder al dashboard

El dashboard no esta expuesto publicamente. Usa un tunnel SSH para acceder:

```bash
ssh -L 4000:127.0.0.1:4000 -p 8022 <usuario>@<ip-del-vps>
# Abre http://localhost:4000 en tu navegador local
```

Si el puerto `4000` local esta ocupado, usa otro:

```bash
ssh -L 4400:127.0.0.1:4000 -p 8022 <usuario>@<ip-del-vps>
# Abre http://localhost:4400
```

En ese caso, actualiza `BETTER_AUTH_URL` para que coincida con el puerto que usas localmente:

```bash
# En el VPS
sed -i 's|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL=http://localhost:4400|' .env
docker compose -f docker-compose.prod.single-host.yml up -d --force-recreate dashboard
```

### Acceso por Tailscale o WireGuard

Si usas una VPN como Tailscale, el patron es el mismo — sigue tunelando hacia `127.0.0.1:4000` para no exponer el dashboard publicamente:

```bash
ssh -L 4400:127.0.0.1:4000 -p 8022 <usuario>@100.x.y.z
```

## Paso 4 — Probar los honeypots desde fuera

Para que los ataques aparezcan con la IP real en el dashboard, usa la IP publica del VPS desde otra maquina:

```bash
# SSH honeypot
ssh root@<ip-publica> -p 22

# Web honeypot
curl http://<ip-publica>/wp-login.php
curl http://<ip-publica>/.env
curl "http://<ip-publica>/search?q=1' OR 1=1--"
curl "http://<ip-publica>/page?file=../../../../etc/passwd"
```

<Aside>
No hagas pruebas contra `localhost` ni desde el mismo VPS — la IP que registra el honeypot sera `127.0.0.1` o la IP interna de Docker, no la IP real del atacante.
</Aside>

## Verificar que Vector esta funcionando

```bash
docker compose -f docker-compose.prod.single-host.yml logs -f vector
# Deberias ver:
# INFO vector::sources::file: Tailing file. path=/cowrie/cowrie-git/var/log/cowrie/cowrie.json
# INFO vector::sinks::http: Request finished. status=200 ...
```

Si Vector reporta errores de conexion a ingest-api, espera a que ingest-api este `healthy` y Vector reintentara automaticamente.

## Comandos de mantenimiento

```bash
# Ver logs en tiempo real
docker compose -f docker-compose.prod.single-host.yml logs -f
docker compose -f docker-compose.prod.single-host.yml logs -f vector
docker compose -f docker-compose.prod.single-host.yml logs -f cowrie

# Reiniciar un servicio especifico
docker compose -f docker-compose.prod.single-host.yml restart dashboard

# Estado de todos los servicios
docker compose -f docker-compose.prod.single-host.yml ps

# Detener sin borrar datos
docker compose -f docker-compose.prod.single-host.yml down

# Detener y borrar datos (volumenes — incluye Postgres y offsets de Vector)
docker compose -f docker-compose.prod.single-host.yml down -v
```

## Recomendaciones de seguridad

- No expongas los puertos `4000`, `3000` ni `5432` publicamente
- Si quieres acceso remoto comodo al dashboard, usa Tailscale, WireGuard o Cloudflare Tunnel antes de abrir `:4000`
- Rota `POSTGRES_PASSWORD`, `INGEST_SHARED_SECRET` y `BETTER_AUTH_SECRET` periodicamente
