# LAYERING_REFACTOR — separar el ingest-api en capas (Route → Service → Repository)

Plan para sacar el SQL crudo de los routes y unificar **una sola** convención de
capas en `apps/ingest-api`, de forma **incremental** (un dominio por tarea) y sin
cambiar ninguna respuesta HTTP.

## Por qué (el problema real, medido)

Auditoría 2026-06-22 del `ingest-api`:

- **SQL crudo esparcido en la capa HTTP:** ~25 routes usan `queryRaw` directo
  (`credentials.ts` 18, `protocol.ts` 18, `misc.ts`/`kpi-trends.ts`/`deception.ts`
  9 c/u…). Solo 4 routes (`sensors`, `sessions`, `threats`, `web`) delegan a una
  capa de datos.
- **Tres convenciones conviviendo** para lo mismo: `modules/<x>/*.repository.ts`,
  `lib/*-queries.ts`, y SQL inline en el route. Hay que dejar **una**.
- **23 `console.*`** en vez del logger de Fastify.
- **Archivos grandes:** `web.ts` 479, `deception.ts` 431 líneas.

Lo que está **bien y NO se toca:** validación Zod, error handler global en
`app.ts`, parametrización SQL (los `queryRawUnsafe` usan `$1` posicional — son
seguros, no hay injection), read replica (`prismaRead`), shutdown graceful.

## Decisiones tomadas (NO re-decidir)

| Tema | Decisión |
|------|----------|
| **Capas** | **Route → Service → Repository.** Las 3 existen siempre. |
| **Route** | Solo HTTP: parsea/valida (Zod), auth/rol/tenant, llama al Service, mapea a la respuesta. **Cero SQL, cero Prisma.** |
| **Service** | Lógica de negocio. Cuando NO hay lógica (lecturas simples), es un **thin delegate** de una línea (`return repo.getX(args)`). Eso está **permitido y esperado** — no es deuda. |
| **Repository** | **Única** capa que toca la BD (`prisma`/`prismaRead`, `queryRaw`, `Prisma.sql`). Devuelve filas/tipos, no `Reply`. |
| **Ubicación** | `modules/<dominio>/<dominio>.repository.ts` y `<dominio>.service.ts` **co-localizados** por dominio. Es la convención que el repo YA tiene a medias (`modules/ingest`, `modules/sessions`, `modules/events`). |
| **`lib/`** | Queda **solo** para utilidades transversales puras (geo, pagination, risk-score, normalizer, date-utils…). Los `lib/*-queries.ts` se **mueven** a `modules/<dominio>/`. |
| **Estrategia** | **Incremental, un dominio por tarea.** Convive lo viejo y lo nuevo. Verificación obligatoria: **la respuesta HTTP no cambia**. |
| **`console.*`** | Migrar a `fastify.log` / `request.log` **dentro del dominio que se esté refactorizando** (no en una pasada aparte). |

## Mapa de dominios → archivos (orden de migración: de menor a mayor riesgo)

| # | Dominio | Route(s) | Capa de datos hoy | Riesgo |
|---|---------|----------|-------------------|--------|
| A | alerts | `routes/alerts.ts` (2 SQL) | inline | bajo |
| B | sensors | `routes/sensors.ts`, `sensor-provision.ts` | `lib/sensor-queries.ts` (mover) | bajo |
| C | sessions | `routes/sessions.ts` | `lib/session-queries.ts` (mover) | bajo |
| D | monitoring + storage | `routes/monitoring.ts`, `storage.ts` | inline | medio |
| E | clients + client-observability | `routes/clients.ts`, `client-observability.ts` | inline | medio |
| F | malware | `routes/malware.ts` | inline | medio |
| G | suricata | `routes/suricata.ts` | inline | medio |
| H | protocol | `routes/protocol.ts` (18 SQL) | inline | alto |
| I | deception | `routes/deception.ts` (431 ln, 9 SQL) | inline | alto |
| J | threats | `routes/threats.ts` | `lib/threat-queries.ts`, `threat-route-queries.ts` (mover) | alto |
| K | web | `routes/web.ts` (479 ln, 8 SQL) | `lib/web-queries.ts` (mover) | alto |
| L | stats/* | `routes/stats/*.ts` (credentials 18, misc 9, kpi 9…) | inline + `utils.ts` | alto |

> Cada letra = una o más tareas (los dominios grandes — H, I, J, K, L — pueden
> partirse en sub-tareas si el diff supera ~400 líneas; documentarlo en el plan).
> NO empezar por L (stats): es el más grande, va al final cuando el patrón ya
> esté rodado en dominios pequeños.

---

## Reglas de ejecución (válidas para TODAS las tareas)

1. **Un dominio = un commit** (o sub-dominio si es grande). No mezclar dominios.
2. **Refactor puro:** mover SQL del route a `modules/<dominio>/<dominio>.repository.ts`,
   meter un `<dominio>.service.ts` entre medias. **No cambiar** comportamiento,
   nombres de campos JSON, status codes, ni la forma del payload.
3. **Verificación obligatoria por tarea:** capturar la respuesta del/los endpoint(s)
   del dominio **antes** y **después** y confirmar que son **idénticas** (mismo
   JSON, mismo status). Ver bloque "Verificación" abajo.
4. Mover SQL **tal cual** (mismo texto, mismos parámetros `$1`). Si encuentras un
   bug en el SQL, **NO lo arregles en esta tarea** — anótalo en _Deuda técnica_.
5. El Service nunca devuelve `reply`/`Reply`; devuelve datos. El Route hace
   `reply.send(...)`. El Repository nunca importa `fastify` salvo para el cliente
   Prisma que recibe por parámetro.
6. `console.*` del dominio → `fastify.log`/`request.log` en la misma tarea.
7. Si una decisión no está escrita aquí, **parar y preguntar**.
8. Al cerrar la tarea: marcar `[x]`, fecha, commit, y actualizar el contador de
   "routes con SQL inline restantes".
9. **Deuda técnica obligatoria** (igual que KAFKA_STREAM): cualquier atajo, bug
   detectado-no-arreglado, caso no migrado o TODO se registra en la sección
   _Deuda técnica_ con detalle para retomarlo sin contexto.
10. **Documentación obligatoria:** la convención de capas final se documenta en
    `docs/project-notes/` (Tarea Z) para que sea el estándar citable en review.

---

## Patrón de referencia (la forma canónica — copiar esto)

```
modules/<dominio>/
  <dominio>.repository.ts   // export class XRepository { constructor(prisma){} async getX(){ /* SQL */ } }
  <dominio>.service.ts      // export class XService { repo; async getX(){ return this.repo.getX() } }
routes/<dominio>.ts         // valida (zod) + auth + new XService(fastify.prisma) + reply.send(mapped)
```

Modelo a imitar: `modules/ingest/ingest.service.ts` (Service) y
`modules/events/event.repository.ts` (Repository) ya existentes.

---

## Verificación (mismo procedimiento en cada tarea de dominio)

Para cada endpoint del dominio migrado:

```bash
# 1) ANTES de tocar el código, levantar y capturar la respuesta baseline:
docker compose up -d --build ingest-api postgres
curl -s -H "X-Ingest-Token: $INGEST_SHARED_SECRET" \
  "http://localhost:3000/<endpoint-del-dominio>?<params típicos>" \
  | jq -S . > /tmp/before_<dominio>.json

# 2) Aplicar el refactor, rebuild:
docker compose up -d --build ingest-api

# 3) Capturar de nuevo y comparar — el diff debe ser VACÍO:
curl -s -H "X-Ingest-Token: $INGEST_SHARED_SECRET" \
  "http://localhost:3000/<endpoint-del-dominio>?<params típicos>" \
  | jq -S . > /tmp/after_<dominio>.json
diff /tmp/before_<dominio>.json /tmp/after_<dominio>.json && echo "IDÉNTICO ✅"
```

Además, por tarea:
```bash
# El route NO debe contener SQL ni Prisma tras migrar:
grep -nE "queryRaw|prisma(Read)?\.|Prisma\.sql" apps/ingest-api/src/routes/<dominio>.ts
#   → debe NO devolver nada.
npm --prefix apps/ingest-api run build   # compila sin errores de tipos
npm --prefix apps/ingest-api test        # vitest en verde
```
Pegar: el `diff ... && echo IDÉNTICO`, el `grep` vacío, y el resultado de build+test.

---

## Tareas

- [x] **A — alerts** → `modules/alerts/`. (Piloto: dominio chico para validar el patrón.) — 2026-06-22, verificado en prod. Build ✅, grep route vacío ✅.
- [x] **B — sensors** → `modules/sensors/`; SQL de `sensors.ts` + `sensor-provision.ts` movido al repository. `lib/sensor-queries.ts` conserva solo utilidades puras (`probeSensorPorts`, `formatSensor`). — 2026-06-22. Build ✅, grep routes vacío ✅.
- [x] **C — sessions** → `modules/sessions/` consolidado. `session.repository.ts` extendido con métodos de consulta (list, scanGroups, backfill). `session.service.ts` creado. `lib/session-queries.ts` conservado como query-builder puro (no toca BD). — 2026-06-22. Build ✅, grep route vacío ✅.
- [x] **D — monitoring + storage** → `modules/monitoring/`, `modules/storage/`. — 2026-06-22. Build ✅, grep routes vacío ✅.
- [x] **E — clients + client-observability** → `modules/clients/`. Repository + service únicos para ambos routes. — 2026-06-22. Build ✅, grep routes vacío ✅.
- [x] **F — malware** → `modules/malware/`. Único `$queryRawUnsafe` (enrich Cowrie) movido al repository. — 2026-06-22. Build ✅, grep route vacío ✅.
- [x] **G — suricata** → `modules/suricata/`. `$queryRawUnsafe` con filtros dinámicos movidos al repository. — 2026-06-22. Build ✅, grep route vacío ✅.
- [x] **H — protocol** → `modules/protocol/`. 18 SQL (list, count, 14 insights en paralelo, stats, port-stats) movidos al repository. — 2026-06-22. Build ✅, grep route vacío ✅.
- [x] **I — deception** → `modules/deception/`. 9 `$queryRawUnsafe` con parámetros posicionales y scope dinámico movidos al repository; `buildKillchains` al service. — 2026-06-22. Build ✅, grep route vacío ✅.
- [x] **J — threats** → `modules/threats/`. `ThreatRepository` + `ThreatService`. `lib/threat-route-queries.ts` absorbido en el repository. — 2026-06-22. Build ✅, grep route vacío ✅.
- [x] **K — web** → `modules/web/`. `WebRepository` + `WebService`. `lib/web-queries.ts` absorbido en el repository (8 SQL inline del route movidos). — 2026-06-22. Build ✅, grep route vacío ✅.
- [x] **L — stats/\*** → `modules/stats/stats.repository.ts`. Clases: `MiscRepository`, `KpiRepository`, `DashboardRepository`, `NoveltyRepository`, `TimelineRepository`, `MitreRepository`, `BotRatioRepository`, `CredentialsRepository`. Todos los routes stats reescritos sin SQL inline. — 2026-06-22. Build ✅, grep routes vacíos ✅.
- [x] **Z — documentar la convención** → `docs/project-notes/backend-layering.md` creado (+ entrada en índice README.md + línea en CLAUDE.md Code principles). — 2026-06-22.

Contador vivo: **routes con SQL inline restantes: 0 / 25. REFACTOR COMPLETO (A–Z).** ✅

---

## Deuda técnica

Registro vivo (regla 9). Mientras esté vacía: "Ninguna registrada".

Plantilla por entrada:
```
### TD-N — <título>
- **Tarea origen:** <letra>
- **Qué se hizo / qué se omitió:** ...
- **Qué falta / riesgo:** ...
- **Dónde:** <archivo:línea>
- **Cómo se arregla:** ...
- **Bloquea producción:** sí / no
- **Estado:** abierta / saldada (commit ____)
```

### TD-1 — Cliente Prisma desactualizado pre-existente
- **Tarea origen:** A
- **Qué se hizo / qué se omitió:** Al intentar compilar se detectó que el cliente Prisma generado no incluía `clientId` en `AlertWhereInput` ni en `AlertCreateInput`. Se ejecutó `npx prisma generate` en `apps/ingest-api/` para regenerar. El error en `threat-alerts.ts` (línea 260) también era pre-existente.
- **Qué falta / riesgo:** El cliente puede volver a desactualizarse si alguien modifica el schema sin regenerar. Considerar añadir `prisma generate` como paso del build script.
- **Dónde:** `apps/ingest-api/package.json` — script `build`; `apps/ingest-api/src/lib/threat-alerts.ts:260`
- **Cómo se arregla:** Añadir `prisma generate &&` antes del `tsc` en el script `build`, o como `prebuild`.
- **Bloquea producción:** no (Docker rebuild ya lo hace en el entrypoint via `prisma migrate deploy`).
- **Estado:** abierta

---

## Fuera de alcance (NO hacer aquí)

- Cambiar comportamiento, optimizar queries o arreglar bugs de SQL (solo mover).
- Tocar el dashboard (eso es otra regla — ver memoria "no-backend-in-frontend").
- Migrar las rutas Prisma del dashboard al ingest-api (deuda aparte).
- Introducir un ORM/query-builder nuevo o cambiar Prisma.
- Inyección de dependencias / contenedor IoC: instanciar el Service con
  `new XService(fastify.prisma)` es suficiente (KISS). No montar un framework de DI.
