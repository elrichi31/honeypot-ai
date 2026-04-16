---
title: Introduccion
description: Que es Honeypot Platform, para que sirve y que tecnologias usa.
---

Honeypot Platform es una plataforma de investigacion de seguridad que captura trafico SSH y HTTP malicioso, normaliza los eventos en una API centralizada y los visualiza en un dashboard con analisis de amenazas, correlacion cross-protocol y risk scoring por IP.

El objetivo es observar comportamiento real de atacantes: que credenciales prueban, que comandos ejecutan, que rutas web escanean, y con que herramientas operan.

## Stack

| Capa | Tecnologia | Por que |
|------|-----------|---------|
| Honeypot SSH | [Cowrie](https://github.com/cowrie/cowrie) | Honeypot SSH/Telnet de media interaccion. Simula un shell real, registra todo. |
| Honeypot HTTP | Flask + Gunicorn | Servidor web propio con rutas falsas que responden de forma realista a scanners. |
| API de ingesta | Fastify + TypeScript | Alta performance, schema validation, healthcheck nativo. |
| ORM / DB | Prisma + PostgreSQL | Migraciones declarativas, type-safety end-to-end. |
| Dashboard | Next.js 15 (App Router) | Server Components, fetch en el servidor, sin estado client-side innecesario. |
| Auth | better-auth | Sesiones seguras con soporte de multiples providers. |
| Graficas | recharts | Componentes React composables, buen soporte de time series. |
| Mapas | react-simple-maps + geoip-lite | Geolocalización offline sin API keys externas. |
| Contenedores | Docker Compose | Entorno reproducible, networks aisladas, hardening declarativo. |

## Flujo de datos

```
Atacante SSH  ──▶  Cowrie (:22)  ──▶  cowrie.json (volumen)
                                            │
                                       log-puller
                                            │
                                     POST /ingest/cowrie/batch
                                            │
Atacante HTTP ──▶  web-honeypot (:80) ──▶  POST /ingest/web/event
                                            │
                                       ingest-api (:3000)
                                            │
                                       PostgreSQL
                                            │
                                       dashboard (:4000)
```

## Estructura del repositorio

```text
.
├── docker-compose.yml                   # Dev: todos los servicios juntos
├── docker-compose.prod.honeypot.yml     # Prod: VPS publico (Cowrie + web-honeypot)
├── docker-compose.prod.app.yml          # Prod: servidor app (postgres + ingest-api + dashboard)
├── docker-compose.prod.single-host.yml  # Prod: un solo VPS con redes separadas
├── scripts/
│   ├── pull-cowrie-logs.sh              # Puller de logs via SSH o volumen directo
│   └── Dockerfile.puller
└── apps/
    ├── web-honeypot/                    # HTTP honeypot (Flask)
    │   ├── app.py                       # Catch-all route, envia hits a ingest-api
    │   ├── classifier.py                # Clasificador de ataques HTTP por regex
    │   └── responses.py                 # Respuestas falsas realistas
    ├── ingest-api/                      # Fastify API
    │   ├── src/
    │   │   ├── routes/                  # ingest, web, threats, sessions, events, stats
    │   │   └── lib/risk-score.ts        # Motor de scoring + clasificador de comandos
    │   └── prisma/
    │       ├── schema.prisma
    │       └── seed.ts
    ├── dashboard/                       # Next.js App Router
    │   └── app/
    │       ├── page.tsx                 # Overview
    │       ├── sessions/
    │       ├── web-attacks/
    │       ├── threats/
    │       ├── commands/
    │       ├── credentials/
    │       └── campaigns/
    └── docs/                            # Esta documentacion (Starlight)
```
