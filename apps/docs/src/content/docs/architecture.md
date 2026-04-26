---
title: Arquitectura
description: Diagrama de componentes, topologias de despliegue, redes Docker y flujo de datos entre servicios.
---

## Topologias de despliegue

La plataforma soporta tres configuraciones. Elige segun tu presupuesto y necesidades de aislamiento.

### Desarrollo local

Un solo `docker compose up` levanta todo junto. El dashboard queda en `http://localhost:4000` y el servicio `seed` carga automaticamente ~30 dias de datos de prueba.

```
localhost
  :2222 → Cowrie (SSH honeypot)
  :8080 → web-honeypot (HTTP)
  :3000 → ingest-api
  :4000 → dashboard
  :5432 → postgres
```

### Single-host (un VPS)

Todo en el mismo servidor, con redes Docker separadas. El dashboard solo es accesible por SSH tunnel o VPN — no esta expuesto a internet.

```
VPS publico
  :22   → Cowrie
  :80   → web-honeypot
  :8022 → sshd admin
  127.0.0.1:4000 → dashboard (solo loopback)
  [interno] ingest-api, postgres
```

Ver [Single-Host](/deployment/single-host/).

### Two-host con VPN (recomendado para produccion)

Dos servidores conectados por VPN privada (Tailscale / WireGuard). El dashboard es publicamente accesible via HTTPS (Caddy). Ingest-api solo es alcanzable desde la VPN.

```
internet publico
  VPS honeypot                          Servidor app
  ──────────────────────────────        ──────────────────────────────
  :22   → Cowrie                        :443 → Caddy → dashboard :4000
  :80   → web-honeypot                  :443 → Caddy → ingest-api :3000
  :8022 → sshd admin                    postgres (solo red interna)
       │                                    ▲
       │  Vector sidecar (push via VPN)     │
       │  POST /ingest/cowrie/vector        │
       └────────────────────────────────────┘
       │
       │  web-honeypot
       │  POST /ingest/web/event
       └────────────────────────────────────┘
```

El VPS honeypot **empuja** logs activamente al servidor app via VPN. No se necesita SSH ni credenciales en el servidor app.

Ver [Two-Host](/deployment/two-host/).

---

## Flujo de datos detallado

```
Atacante SSH  ──▶ Cowrie (:22) ──▶ cowrie.json (volumen Docker)
                                           │
                                      Vector (sidecar)
                                      tail con offset persistente en disco
                                      buffer 256 MB en disco
                                      batch 100 eventos / 2s
                                      retry 360 intentos
                                           │
                               POST /ingest/cowrie/vector
                                           │
Atacante HTTP ──▶ web-honeypot (:80) ──▶  POST /ingest/web/event
                                           │
                                      ingest-api (:3000)
                                      risk-score engine
                                      bot-detector
                                      clasificacion de sesiones
                                           │
                                       PostgreSQL
                                           │
                                       dashboard (:4000)
                                       + Discord alerts
                                       + AI analysis (OpenAI)
```

---

## Redes Docker

### Single-host (`docker-compose.prod.single-host.yml`)

Cuatro redes bridge con acceso minimo:

| Red | Servicios | Proposito |
|-----|-----------|-----------|
| `edge` | cowrie, web-honeypot | Solo los servicios expuestos a internet |
| `honeypot_ingest` | web-honeypot, vector, ingest-api | Pipeline de ingesta |
| `app_api` | ingest-api, dashboard | Comunicacion interna app |
| `db_private` | postgres, ingest-api, dashboard | Acceso a base de datos |

**Cowrie no tiene ruta a postgres, ingest-api ni al dashboard.**

### VPS honeypot (`docker-compose.prod.honeypot.yml`)

Una sola red `edge` con los tres servicios de captura:

| Red | Servicios | Proposito |
|-----|-----------|-----------|
| `edge` | cowrie, web-honeypot, vector | Servicios expuestos a internet + pipeline de ingesta |

Vector alcanza ingest-api en el servidor app exclusivamente via VPN. No hay ruta directa entre edge y las redes internas del servidor app.

### Servidor app (`docker-compose.prod.app.yml`)

Tres redes en el servidor de analisis:

| Red | Servicios | Proposito |
|-----|-----------|-----------|
| `app_api` | ingest-api, dashboard | Comunicacion interna |
| `db_private` | postgres, ingest-api, dashboard | Acceso a base de datos |
| `caddy_net` | caddy, dashboard | Exposicion via HTTPS |

---

## Puertos expuestos

| Puerto | Servicio | Descripcion |
|--------|----------|-------------|
| `22` | Cowrie (prod) | SSH honeypot — los atacantes se conectan aqui |
| `80` | Caddy / web-honeypot | HTTP → HTTPS en two-host; honeypot en single-host |
| `443` | Caddy (two-host) | HTTPS dashboard e ingest-api |
| `8443` | web-honeypot (prod) | HTTPS alternativo para atrapar port scans |
| `8022` | sshd admin VPS | Acceso SSH real al servidor |
| `2222` | Cowrie (dev) | SSH honeypot en entorno local |
| `8080` | web-honeypot (dev) | HTTP honeypot en entorno local |
| `127.0.0.1:4000` | dashboard (single-host) | Solo loopback — requiere SSH tunnel o VPN |
| `3000` | ingest-api | Solo red interna / VPN. No publicado en prod. |
| `5432` | PostgreSQL | Solo red interna. Nunca publico. |

---

## Hardening de contenedores

Todos los servicios en produccion aplican:

```yaml
security_opt:
  - no-new-privileges:true  # impide escalar privilegios
cap_drop:
  - ALL                     # elimina todas las capabilities de Linux
pids_limit: 256             # protege contra fork bombs
```

Adicionalmente:
- `web-honeypot` usa `read_only: true`
- `web-honeypot` corre con usuario sin privilegios (`app`)
- `caddy` solo tiene `NET_BIND_SERVICE` para poder bindear en `:80` y `:443`
- `vector` corre con imagen Alpine minimal, sin shell de usuario

---

## Autorizacion entre servicios

El `web-honeypot` y `vector` autorizan sus peticiones a `ingest-api` via el header `X-Ingest-Token`, cuyo valor es `INGEST_SHARED_SECRET`. Si el secret no coincide, `ingest-api` rechaza la peticion con `401`.

Los endpoints GET de ingest-api no requieren autenticacion — estan protegidos por no ser alcanzables desde internet (solo via VPN o red Docker interna, segun la topologia).
