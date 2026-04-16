---
title: Desarrollo local
description: Como levantar todo el stack en tu maquina local con Docker o sin el.
---

import { Tabs, TabItem, Steps } from '@astrojs/starlight/components';

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) con Docker Compose v2
- Node.js 20+
- `openssl` disponible en terminal (viene incluido en macOS y la mayoria de Linux; en Windows usa Git Bash o WSL)

## Opcion A — Todo con Docker (mas rapido)

La forma mas sencilla. Levanta todos los servicios con un solo comando.

<Steps>
1. Clona el repositorio e instala dependencias:

   ```bash
   git clone <repo-url>
   cd honeypot-ai
   ```

2. Crea el archivo de variables de entorno:

   ```bash
   cp .env.example .env
   ```

   Edita `.env` y completa al menos `BETTER_AUTH_SECRET`:

   ```bash
   openssl rand -base64 32
   # Pega el resultado en BETTER_AUTH_SECRET=...
   ```

3. Levanta todos los servicios:

   ```bash
   docker compose up --build -d
   docker compose ps
   ```
</Steps>

Servicios disponibles una vez que todo este `healthy`:

| URL | Servicio |
|-----|---------|
| `http://localhost:4000` | Dashboard |
| `http://localhost:3000/health` | Health check ingest-api |
| `ssh -p 2222 root@localhost` | SSH honeypot (acepta cualquier password) |
| `http://localhost:8080` | HTTP honeypot |

---

## Opcion B — Infra con Docker, codigo local

Util cuando quieres iterar rapido en `ingest-api` o `dashboard` sin rebuilds de imagen.

<Steps>
1. Levanta solo la infraestructura base:

   ```bash
   docker compose up postgres cowrie -d
   ```

2. Levanta `ingest-api` como proceso local:

   ```bash
   cp apps/ingest-api/.env.example apps/ingest-api/.env
   cd apps/ingest-api
   npm install
   npm run db:push
   npm run dev
   # -> http://localhost:3000
   ```

3. En otra terminal, levanta el `dashboard`:

   ```bash
   cp apps/dashboard/.env.example apps/dashboard/.env
   # Edita BETTER_AUTH_SECRET: openssl rand -base64 32

   cd apps/dashboard
   npm install
   npm run dev
   # -> http://localhost:4000
   ```
</Steps>

---

## Opcion C — Sin Docker en absoluto

Necesitas PostgreSQL disponible localmente (instalado o en contenedor suelto).

<Steps>
1. Levanta PostgreSQL en `localhost:5432` con:
   ```
   DB:   honeypot
   User: honeypot
   Pass: honeypot
   ```

2. Configura y levanta `ingest-api`:

   ```bash
   cp apps/ingest-api/.env.example apps/ingest-api/.env
   # DATABASE_URL=postgresql://honeypot:honeypot@localhost:5432/honeypot
   cd apps/ingest-api
   npm install && npm run db:push && npm run dev
   ```

3. Configura y levanta `dashboard`:

   ```bash
   cp apps/dashboard/.env.example apps/dashboard/.env
   # NEXT_PUBLIC_API_URL=http://localhost:3000
   # INTERNAL_API_URL=http://localhost:3000
   # DATABASE_URL=postgresql://honeypot:honeypot@localhost:5432/honeypot
   # BETTER_AUTH_URL=http://localhost:4000
   # BETTER_AUTH_SECRET=<genera con openssl rand -base64 32>

   cd apps/dashboard
   npm install && npm run dev
   ```

4. (Opcional) Levanta Cowrie como contenedor suelto:

   ```bash
   docker run -d \
     --name cowrie \
     -p 2222:2222 \
     -v cowrie_var:/cowrie/cowrie-git/var \
     cowrie/cowrie:latest
   ```

5. (Opcional) Corre el puller manualmente:

   ```bash
   API_URL=http://localhost:3000 bash scripts/pull-cowrie-logs.sh
   ```
</Steps>

---

## Probar los honeypots

### SSH honeypot

```bash
ssh -p 2222 root@localhost
# Acepta cualquier password. Prueba: whoami, ls, cat /etc/passwd, wget http://...
```

### Web honeypot

```bash
# Rutas con respuestas falsas realistas:
curl http://localhost:8080/wp-login.php
curl http://localhost:8080/.env
curl http://localhost:8080/.git/config
curl "http://localhost:8080/search?q=1' OR 1=1--"
curl "http://localhost:8080/page?file=../../../../etc/passwd"
curl "http://localhost:8080/cmd?exec=whoami"

# Cualquier ruta desconocida devuelve un 404 de Apache falso
curl http://localhost:8080/cualquier-ruta
```

---

## Seed de datos de prueba

Genera ~30 dias de sesiones SSH, comandos y web hits con distintos tipos de ataque:

```bash
cd apps/ingest-api
npx prisma db seed
```

---

## Comandos utiles

```bash
docker logs -f ingest-api
docker logs -f cowrie
docker logs -f web-honeypot
docker logs -f log-puller

docker compose down          # detiene y elimina contenedores
docker compose down -v       # tambien elimina los volumenes (borra datos)
```

---

## Tests

```bash
cd apps/ingest-api
npm test
```
