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
  ──────────────                        ──────────────────────────────
  :22   → Cowrie                        :443 → Caddy → dashboard :4000
  :80   → web-honeypot                  :443 → Caddy → ingest-api :3000
  :8022 → sshd admin                    postgres (solo red interna)
       │                                    ▲
       │  POST via VPN (100.x.y.z:3000)    │
       └────────────────────────────────────┤
                                            │
                               log-puller (SSH pull via VPN)
```

Ver [Two-Host](/deployment/two-host/).

---

## Flujo de datos detallado

```
Atacante SSH  ──▶ Cowrie (:22) ──▶ cowrie.json (volumen)
                                         │
                                    log-puller
                                    (DIRECT_FILE en single-host)
                                    (SSH via VPN en two-host)
                                         │
                               POST /ingest/cowrie/batch
                                         │
Atacante HTTP ──▶ web-honeypot (:80) ──▶ POST /ingest/web/event
                                         │
                                    ingest-api (:3000)
                                    + risk-score engine
                                         │
                                     postgres
                                         │
                                     dashboard (:4000)
```

---

## Redes Docker

### Single-host (`docker-compose.prod.single-host.yml`)

Cuatro redes bridge con acceso minimo:

| Red | Servicios | Proposito |
|-----|-----------|-----------|
| `edge` | cowrie, web-honeypot | Solo los servicios expuestos a internet |
| `honeypot_ingest` | web-honeypot, log-puller, ingest-api | Pipeline de ingesta |
| `app_api` | ingest-api, dashboard | Comunicacion interna app |
| `db_private` | postgres, ingest-api, dashboard | Acceso a base de datos |

**Cowrie no tiene ruta a postgres, ingest-api ni al dashboard.**

### Two-host (`docker-compose.prod.app.yml`)

El servidor app tiene tres redes:

| Red | Servicios | Proposito |
|-----|-----------|-----------|
| `app_api` | ingest-api, log-puller, dashboard | Comunicacion interna |
| `db_private` | postgres, ingest-api, dashboard | Acceso a base de datos |
| `caddy_net` | caddy, dashboard, ingest-api | Exposicion via HTTPS |

El VPS honeypot tiene su propia red `edge` (cowrie, web-honeypot) y se comunica con el servidor app exclusivamente por VPN.

---

## Puertos expuestos

| Puerto | Servicio | Descripcion |
|--------|----------|-------------|
| `22` | Cowrie (prod) | SSH honeypot — los atacantes se conectan aqui |
| `80` | Caddy / web-honeypot | HTTP → HTTPS en two-host; honeypot en single-host |
| `443` | Caddy (two-host) | HTTPS dashboard e ingest-api |
| `8443` | web-honeypot (prod) | HTTPS alternativo para atrapar port scans |
| `8022` | sshd admin VPS | Acceso SSH real al servidor (admin + log-puller) |
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
- `web-honeypot` y `log-puller` usan `read_only: true`
- `web-honeypot` corre con usuario sin privilegios (`app`)
- `caddy` solo tiene `NET_BIND_SERVICE` para poder bindear en `:80` y `:443`

---

## Autorizacion entre servicios

El `web-honeypot` y el `log-puller` autorizan sus peticiones a `ingest-api` via el header `X-Ingest-Token`, cuyo valor es `INGEST_SHARED_SECRET`. Si el secret no coincide, `ingest-api` rechaza la peticion con `401`.

Los endpoints GET de ingest-api no requieren autenticacion — estan protegidos por no ser alcanzables desde internet (solo via VPN o red Docker interna, segun la topologia).
