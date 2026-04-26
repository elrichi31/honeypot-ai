---
title: Introduccion
description: Que es Honeypot Platform, para que sirve y que tecnologias usa.
---

Honeypot Platform es una plataforma de investigacion de seguridad que captura trafico SSH y HTTP malicioso, normaliza los eventos en una API centralizada y los visualiza en un dashboard con analisis de amenazas, correlacion cross-protocol, risk scoring por IP, clasificacion automatica de sesiones con IA y alertas en Discord.

El objetivo es observar comportamiento real de atacantes: que credenciales prueban, que comandos ejecutan, que rutas web escanean, y con que herramientas operan — todo desde una sola interfaz.

## Stack

| Capa | Tecnologia | Por que |
|------|-----------|---------|
| Honeypot SSH | [Cowrie](https://github.com/cowrie/cowrie) | Honeypot SSH/Telnet de media interaccion. Simula un shell real, registra todo. |
| Honeypot HTTP | Flask + Gunicorn | Servidor web propio con rutas falsas que responden de forma realista a scanners. |
| Log shipper | [Vector](https://vector.dev) | Tail de logs con offset persistente en disco, buffer de 256 MB, retry automatico. Reemplaza el bash puller anterior. |
| API de ingesta | Fastify + TypeScript | Alta performance, schema validation, healthcheck nativo. |
| ORM / DB | Prisma + PostgreSQL | Migraciones declarativas, type-safety end-to-end. |
| Dashboard | Next.js 15 (App Router) | Server Components, fetch en el servidor, sin estado client-side innecesario. |
| Auth | better-auth | Sesiones seguras con soporte de multiples providers. |
| Graficas | recharts | Componentes React composables, buen soporte de time series. |
| Mapas | react-simple-maps + geoip-lite | Geolocalizacion offline sin API keys externas. |
| Contenedores | Docker Compose | Entorno reproducible, networks aisladas, hardening declarativo. |

## Funcionalidades principales

- **Dashboard en tiempo real** — sesiones, comandos, credenciales, campanas, web attacks, amenazas
- **Clasificacion de sesiones** — Bot, Bot Script, Scanner, Brute-Force, Interactive, Recon, Malware Dropper y mas
- **Risk scoring por IP** — score 0-100 basado en comandos ejecutados, protocolos usados y comportamiento
- **IP Enrichment** — integracion con AbuseIPDB (score, reportes, categorias) e ipinfo.io (ASN, geolocalizacion, privacy flags)
- **AI threat analysis** — resumen de sesiones con OpenAI, incluyendo TTPs y nivel de peligro
- **Alertas Discord** — notificacion instantanea en login exitoso y cuando una IP tiene score >= 80% en AbuseIPDB
- **Attack heatmap** — mapa de calor 7x24 mostrando cuando atacan mas (dia de semana x hora)
- **Multi-sensor** — arquitectura preparada para multiples VPS honeypots enviando a un master centralizado

## Flujo de datos

```
Atacante SSH  ──▶  Cowrie (:22)  ──▶  cowrie.json (volumen Docker)
                                              │
                                         Vector (sidecar)
                                         tail + parse + buffer en disco
                                              │
                                    POST /ingest/cowrie/vector
                                              │
Atacante HTTP ──▶  web-honeypot (:80) ──▶  POST /ingest/web/event
                                              │
                                        ingest-api (:3000)
                                        risk-score engine
                                        bot-detector
                                              │
                                        PostgreSQL (honeypot_prod)
                                              │
                                        dashboard (:4000)
                                        + Discord alerts
                                        + AI analysis
```

## Estructura del repositorio

```text
.
├── docker-compose.yml                     # Dev: todos los servicios juntos
├── docker-compose.prod.honeypot.yml       # Prod: VPS sensor (Cowrie + web-honeypot + Vector)
├── docker-compose.prod.app.yml            # Prod: servidor app (postgres + ingest-api + dashboard + Caddy)
├── docker-compose.prod.single-host.yml    # Prod: un solo VPS con redes separadas
├── vector/
│   └── cowrie.toml                        # Configuracion Vector: tail, parse, batch, retry
└── apps/
    ├── web-honeypot/                      # HTTP honeypot (Flask)
    │   ├── app.py                         # Catch-all route, envia hits a ingest-api
    │   ├── classifier.py                  # Clasificador de ataques HTTP por regex
    │   └── responses.py                   # Respuestas falsas realistas
    ├── ingest-api/                        # Fastify API (TypeScript)
    │   ├── src/
    │   │   ├── routes/
    │   │   │   ├── ingest.ts              # POST /ingest/cowrie/* y /ingest/web/event
    │   │   │   ├── sessions.ts            # GET /sessions
    │   │   │   ├── events.ts              # GET /events
    │   │   │   ├── threats.ts             # GET /threats
    │   │   │   ├── web.ts                 # GET /web-hits/*
    │   │   │   └── stats/                 # GET /stats/* (modulos separados)
    │   │   │       ├── timeline.ts        # /stats/overview
    │   │   │       ├── dashboard.ts       # /stats/dashboards
    │   │   │       ├── credentials.ts     # /stats/credentials
    │   │   │       └── misc.ts            # /stats/geo, heatmap, session-commands
    │   │   └── lib/
    │   │       ├── risk-score.ts          # Motor de scoring + clasificador de comandos
    │   │       ├── bot-detector.ts        # Deteccion de sesiones automatizadas
    │   │       └── discord.ts             # Alertas Discord
    │   └── prisma/
    │       ├── schema.prisma
    │       └── seed.ts
    ├── dashboard/                         # Next.js 15 App Router
    │   ├── app/
    │   │   ├── page.tsx                   # Overview + KPIs + heatmap
    │   │   ├── sessions/                  # Lista y detalle de sesiones SSH
    │   │   ├── web-attacks/               # Ataques HTTP, timeline, paths, geomap
    │   │   ├── threats/                   # Threat intelligence por IP
    │   │   ├── commands/                  # Comandos ejecutados
    │   │   ├── credentials/               # Credenciales probadas
    │   │   ├── campaigns/                 # Campanas de ataque detectadas
    │   │   └── settings/                  # Configuracion (API keys, Discord webhook)
    │   └── lib/
    │       ├── api/                       # Funciones fetch separadas por dominio
    │       ├── session-classify-v2.ts     # Clasificacion de sesiones (bot/human/interactive)
    │       ├── discord.ts                 # Alertas Discord desde el dashboard
    │       └── db.ts                      # Pool PostgreSQL compartido
    └── docs/                              # Esta documentacion (Astro Starlight)
```
