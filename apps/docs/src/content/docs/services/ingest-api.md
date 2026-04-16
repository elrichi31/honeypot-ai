---
title: Ingest API
description: API Fastify que recibe, normaliza y persiste los eventos de los honeypots.
---

La ingest-api es el nucleo de procesamiento de la plataforma. Es una API Fastify + TypeScript que recibe eventos de Cowrie y del web honeypot, los normaliza, calcula el risk score por IP y los persiste en PostgreSQL via Prisma.

## Responsabilidades

1. **Recibir** eventos del log-puller (SSH) y del web-honeypot (HTTP)
2. **Validar** autorizacion via `X-Ingest-Token` si `INGEST_SHARED_SECRET` esta definido
3. **Normalizar** el formato de los eventos de Cowrie a la estructura interna
4. **Persistir** sesiones, eventos y web hits en PostgreSQL
5. **Calcular** risk scores y servir los datos al dashboard

## Estructura

```
apps/ingest-api/src/
├── main.ts                     # Arranque de Fastify
├── routes/
│   ├── health.ts               # GET /health
│   ├── ingest/                 # POST /ingest/cowrie/* y /ingest/web/event
│   ├── sessions.ts             # GET /sessions, /sessions/:id
│   ├── events.ts               # GET /events
│   ├── web.ts                  # GET /web-hits/*
│   ├── threats.ts              # GET /threats, /threats/:ip
│   └── stats.ts                # GET /stats/*
├── lib/
│   ├── normalizer.ts           # Convierte eventos Cowrie al formato interno
│   ├── parser.ts               # Parseo del archivo cowrie.json linea a linea
│   └── risk-score.ts           # Motor de scoring y clasificador de comandos
└── prisma/
    ├── schema.prisma
    ├── seed.ts
    └── migrations/
```

## Schema de base de datos

Las entidades principales son:

- **Session** — una conexion SSH completa (IP, duracion, login exitoso o no, cliente SSH)
- **Event** — un evento individual dentro de una sesion (comando, login attempt, file download)
- **WebHit** — un request HTTP capturado por el web honeypot

## Autorizacion

Si la variable `INGEST_SHARED_SECRET` esta definida, todos los endpoints `POST /ingest/*` exigen el header:

```
X-Ingest-Token: <valor-del-secret>
```

Las peticiones sin ese header o con token incorrecto reciben `401 Unauthorized`.

Los endpoints `GET` (consulta de datos para el dashboard) no requieren autenticacion a nivel de API — estan protegidos por el hecho de que `ingest-api` no es accesible desde internet en produccion.

## Risk score engine

`lib/risk-score.ts` calcula un score de 0 a 100 por IP combinando:

| Factor | Peso |
|--------|------|
| Login SSH exitoso | Alto |
| Comandos de tipo `malware_drop` o `persistence` | Muy alto |
| Ataques web graves (cmdi, sqli) | Alto |
| Correlacion cross-protocol (misma IP en SSH y HTTP) | Bonus |
| Multiples vectores de ataque | Acumulativo |

## Healthcheck

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"...","lastEvent":"..."}
```

El healthcheck es el criterio que Docker Compose usa para marcar el servicio como `healthy` antes de arrancar servicios dependientes.

## Comandos de desarrollo

```bash
cd apps/ingest-api

npm run dev          # modo watch con tsx
npm run build        # compila TypeScript
npm run db:push      # aplica el schema sin migraciones (dev)
npm run db:migrate   # crea y aplica migraciones (prod)
npx prisma studio    # GUI de base de datos
npx prisma db seed   # genera datos de prueba
npm test             # corre los tests con vitest
```
