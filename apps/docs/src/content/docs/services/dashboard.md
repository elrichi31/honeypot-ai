---
title: Dashboard
description: Funcionalidades del dashboard Next.js — sesiones, web attacks, threat intelligence y mas.
---

El dashboard es una aplicacion Next.js 15 con App Router. Consulta datos a `ingest-api` desde el servidor (Server Components) y los presenta en vistas especializadas por tipo de ataque.

## Paginas disponibles

### Overview (`/`)

Vista de resumen global:

- Total de sesiones, eventos, IPs unicas, logins exitosos
- Activity timeline — SSH + web hits por dia (ultimos 30 dias)
- Mapa de ataque SSH por pais
- Widget resumen de Web Attacks con top IPs y distribucion de tipos

### Sesiones SSH (`/sessions`)

Divide el trafico en dos tabs:

**Sesiones** — conexiones autenticadas (`loginSuccess = true`)
- Timeline de eventos expandible
- Replay de comandos ejecutados
- Badge de riesgo con link al perfil de amenaza

**Escaneos** — conexiones fallidas agrupadas por IP
- Credenciales probadas (usuario + contrasena)
- Version del cliente SSH / herramienta detectada
- Numero de intentos y rango de tiempo

### Web Attacks (`/web-attacks`)

Cuatro sub-vistas:

| Sub-vista | Descripcion |
|-----------|-------------|
| **Attackers** | IPs agrupadas con total de hits, tipos de ataque, primera/ultima vez. Click para ver detalle completo. |
| **Timeline** | Grafica de barras apiladas por dia y tipo de ataque + pie chart de distribucion |
| **Paths** | Top 50 paths mas atacados con frecuencia y tipos detectados |
| **Geo** | Mapa mundial con intensidad por pais (escala logaritmica) + tabla de ranking |

### Threat Intelligence (`/threats`)

Correlacion cross-protocol y risk scoring por IP:

- **Ranking** — todas las IPs vistas en SSH y/o HTTP, ordenadas por risk score (0–100)
- **Detalle por IP** — score breakdown por categoria, comandos clasificados por tipo, timeline SSH

**Niveles de riesgo:**

| Nivel | Score | Criterio tipico |
|-------|-------|-----------------|
| CRITICAL | 80–100 | Login SSH + comandos de malware/persistencia |
| HIGH | 60–79 | Multiples vectores de ataque graves |
| MEDIUM | 40–59 | Ataques web severos (cmdi/sqli) o SSH con comandos |
| LOW | 20–39 | Reconocimiento basico |
| INFO | 0–19 | Escaneo puntual sin actividad relevante |

**Categorias de comandos clasificados:**

| Categoria | Ejemplos |
|-----------|----------|
| `malware_drop` | `wget`/`curl` + `chmod`, reverse shells |
| `persistence` | `crontab`, `authorized_keys`, `useradd`, `systemctl enable` |
| `lateral_movement` | `nmap`, `masscan`, `sshpass`, ping sweeps |
| `crypto_mining` | `xmrig`, `minerd`, conexiones a pools stratum |
| `data_exfil` | `cat /etc/shadow`, `tar /home`, `rm -rf /var/log` |
| `recon` | `id`, `whoami`, `uname -a`, `ps aux`, `netstat` |

### Otros modulos

| Pagina | Descripcion |
|--------|-------------|
| `/commands` | Busqueda y filtrado de todos los comandos ejecutados |
| `/credentials` | Diccionario de credenciales probadas con frecuencia |
| `/campaigns` | Agrupacion de sesiones por campana / herramienta detectada |
| `/settings` | Configuracion de infraestructura, zona horaria, AI analysis, notificaciones |

## Auth

El dashboard usa [better-auth](https://www.better-auth.com/) para autenticacion. Las sesiones se almacenan en PostgreSQL. `BETTER_AUTH_SECRET` firma los tokens de sesion y `BETTER_AUTH_URL` debe coincidir exactamente con el origen desde el que accede el navegador.

## Configuracion en el proyecto

```yaml
# docker-compose.prod.single-host.yml
dashboard:
  ports:
    - "127.0.0.1:4000:4000"   # solo loopback — no alcanzable desde internet
  environment:
    INTERNAL_API_URL: http://ingest-api:3000
    DATABASE_URL: postgresql://honeypot:${POSTGRES_PASSWORD}@postgres:5432/honeypot
    BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
    BETTER_AUTH_URL: ${BETTER_AUTH_URL:-http://localhost:4000}
  networks:
    - app_api
    - db_private
```

## Desarrollo local

```bash
cd apps/dashboard
npm install
npm run dev      # http://localhost:4000

npm run build    # build de produccion
npm run start    # sirve el build
```
