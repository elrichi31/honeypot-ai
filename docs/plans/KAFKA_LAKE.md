# KAFKA_LAKE — Rework de streaming: ingestión uniforme por API + Kafka como tee interno

## Estado (2026-07-17)

**Planificado, sin implementar.** Este plan reordena la topología de ingesta
para que funcione **idéntica en single-host y multi-host**, y deja Kafka como un
bus interno detrás del ingest-api del que después cuelga el data lake. Las Fases
1 y 2 (plomería del bus) están implementadas; la **Fase 3 (lake: ClickHouse + R2
+ split hot/cold)** está detallada abajo, planificada, sin implementar.

## Contexto — el problema que resuelve

Hoy la ingesta tiene **dos caminos** distintos (ver
[docs/project-notes/kafka-stream.md](../project-notes/kafka-stream.md)):

- **cowrie / suricata:** `sensor → Vector → Kafka → consumer ingest-api → Postgres`
  (Kafka en el borde, primer salto).
- **web / galah / port / mysql / ftp / smb:** `sensor → Vector → HTTPS → ingest-api → Postgres`
  (HTTP directo, sin Kafka).

El camino de Kafka **solo funciona en single-host**, donde Vector y Kafka
comparten la red Docker (`kafka:9092` resuelve). En **multi-host** (deploy remoto
de honeypot, o sensores instalados desde la ficha del cliente en el VPS del
cliente) el Vector del sensor **no puede alcanzar** el `kafka:9092` del host core,
y exponer el broker Kafka a internet por cada cliente es un no-va de seguridad.
Por eso los 5 sensores nuevos usan HTTP: el ingest-api ya está expuesto (tunnel
Cloudflare) y autenticado (`INGEST_SHARED_SECRET`).

Requisito del usuario: **la ingesta debe comportarse igual en los dos deploys.**
Eso descarta "Vector → Kafka en todos lados".

## Decisión de arquitectura — Kafka detrás del API

El único punto de producción a Kafka que funciona idéntico venga de donde venga
el sensor es **el propio ingest-api** (que vive con Kafka en el core). Kafka pasa
de estar **antes** del API a estar **después**, como una rama paralela (*tee*),
no en el camino de la BD:

```
CUALQUIER sensor (single-host o VPS de cliente)
    → Vector [buffer disco] → HTTPS → ingest-api
                                          ├─→ Postgres            (path caliente, síncrono, como hoy)
                                          └─→ Kafka → lake         (rama paralela, interna)
```

Propiedades:

- **Idéntico single/multi-host:** el sensor solo alcanza el HTTPS del API. El API
  y Kafka están en el mismo host → siempre se alcanzan.
- **Kafka nunca se expone a internet.**
- **La BD no depende de Kafka:** si Kafka se cae, el dashboard sigue andando; solo
  se pausa el feed del lake.
- **Una sola bus con las 7 fuentes**, con fan-out (varios consumidores) y replay
  (reprocesar historia) — lo que hace limpio al lake y a futuros consumidores.

## Alcance — qué cambia

| Pieza | Hoy | Después |
|---|---|---|
| web, galah, port, mysql, ftp, smb (Vector) | HTTP → ingest-api → Postgres | **igual** |
| cowrie, suricata (Vector) | Vector → **Kafka** | Vector → **HTTPS** → ingest-api (bloques de rollback ya comentados en `vector/conf.d/*.toml`; endpoints `/ingest/cowrie/vector` y `/ingest/suricata/alert` ya existen) |
| consumer Kafka→Postgres (`kafka-consumer.ts`) | escribe cowrie/suricata a Postgres | **se retira** (Postgres pasa a escribirse directo por el API) |
| ingest-api | — | gana un **producer** que tee-a cada evento a Kafka tras persistir en Postgres |
| consumer del lake | no existe | lee los topics de Kafka → lake (stub aquí; el lake real es plan aparte) |

## Fases

### Fase 1 — Reroute de cowrie/suricata a HTTP (ingesta uniforme, sin Kafka)

Objetivo: que las 7 fuentes escriban Postgres por el mismo camino (API), sin
dependencia de Kafka. De-riesga: al terminar esta fase la ingesta funciona
idéntica en single y multi-host, **antes** de tocar Kafka.

- `vector/conf.d/cowrie.toml` y `suricata.toml`: aplicar el procedimiento de
  rollback ya documentado (comentar el sink `kafka`, descomentar el sink `http`
  con `${INGEST_API_URL}`/`${INGEST_SHARED_SECRET}`). Los sensores **no se tocan**
  — ya escriben su log; solo cambia el sink de Vector.
- `kafka-consumer.ts`: retirar `handleCowrie`/`handleSuricata` y la suscripción a
  `honeypot.cowrie`/`honeypot.suricata`. Postgres queda cubierto por las escrituras
  directas del API (`IngestService`/`SuricataService`, los mismos servicios que ya
  llaman los endpoints HTTP). Kafka queda **ocioso** hasta la Fase 2 — sin
  productor ni consumidor, sin datos en riesgo (Postgres es la fuente de verdad).
- **Bonus real:** esto arregla la ingesta de cowrie/suricata en el deploy remoto
  de honeypot y en los sensores de cliente, que con el sink Kafka apuntando a un
  `kafka:9092` inexistente no funcionaba fuera de single-host.
- Durabilidad: no se pierde la garantía "consumer caído no pierde eventos" — el
  buffer en disco de Vector (`when_full = "block"`, `retry_attempts`) la cubre,
  igual que ya lo hace para los otros 5.

Criterio de salida: las 7 fuentes ingresan por HTTP → API → Postgres; el
dashboard funciona idéntico en los dos deploys; Kafka no participa de la ingesta.

**Progreso (2026-07-17): Fase 1 implementada y verificada estáticamente.**

- **4 archivos de Vector** flipeados a sink HTTP (kafka comentado): `vector/conf.d/
  cowrie.toml` + `suricata.toml` (usados por los prod composes) y `vector/cowrie.toml`
  + `vector/suricata.toml` (usados por `deploy/local` y bajados por curl desde
  `master` en el instalador de clientes). Se detectó que había **4** archivos, no 2.
- **Paridad de comportamiento confirmada** antes de tocar nada: el endpoint
  `/ingest/cowrie/vector` hace lo mismo que `handleCowrie` (mismo `processLine`,
  `emitSsh` para el mapa vivo, `scheduleThreatAlert`), y `/ingest/suricata/alert`
  lo mismo que `handleSuricata` (`persistAlerts`). El reroute no pierde side-effects.
- **`kafka-consumer.ts`** reducido a stub deshabilitado que solo conserva la
  decoración `kafkaConsumerStatus` (la usa `/health/kafka`); reporta `'disabled'`
  (sano por diseño). Los servicios de escritura a Postgres no cambian.
- **Métrica preservada:** `recordProcessLineLatency` (que alimenta
  `/health/ingest-metrics`, p50/p99 + events/s) solo se registraba en el handler
  Kafka. Se movió a `IngestService.processLine` (try/finally, transport-agnostic)
  para que sobreviva al cambio de transporte — es su lugar DRY correcto.
- **Bug real encontrado por `vector validate`** (binario real, Docker): Vector
  expande `${VAR}` **incluso en comentarios** (gotcha ya documentado en
  `kafka-stream.md`), y el header de ROLLBACK que escribí tenía `${KAFKA_BROKERS}`
  literal → Vector fallaba con "Missing environment variable" en un host **sin**
  `KAFKA_BROKERS` (exactamente el VPS de cliente). Corregido: el comentario ya no
  contiene `${...}`, y el bloque kafka comentado usa `KAFKA_BROKERS_PLACEHOLDER`.
  Re-validado sin `KAFKA_BROKERS` en el env → `Validated`.
- **No hizo falta tocar el instalador ni los composes:** todos los env de Vector ya
  tenían `INGEST_API_URL` + `INGEST_SHARED_SECRET`; el instalador baja los `.toml`
  desde `master` (los toma nuevos automáticamente). KAFKA_BROKERS se deja en el env
  de Vector de los prod (vestigial pero útil para rollback); Kafka/kafka-init siguen
  corriendo ociosos hasta la Fase 2.
- Verificación: `tsc --noEmit` limpio; 147 tests ingest-api en verde (sin regresión);
  `vector validate` OK en los 2 configs sin `KAFKA_BROKERS`; `docker compose config
  --quiet` exit 0 en los 2 prod.

> **⚠️ PASO OBLIGATORIO DEL DEPLOY: recrear Vector.** Vector solo lee su config
> al arrancar (no hay `--watch-config`), así que un `git pull` que actualiza el
> `.toml` **NO** cambia nada hasta recrear el proceso, y un `docker restart` puede
> no recrearlo. Hay que:
> `docker compose -f docker-compose.prod.single-host.yml up -d --force-recreate vector`.
> Si se retira el consumer (ingest-api) **antes** de recrear Vector, cowrie/suricata
> siguen yendo al topic Kafka que ya nadie drena → desaparecen de Postgres sin
> error visible. Ocurrió en el deploy real (2026-07-17→20): Vector quedó "Up 9 days"
> con el sink Kafka viejo, cowrie dejó de entrar 3 días hasta el `--force-recreate`.
> Verificar con `docker logs vector | grep cowrie_ingest_api` (debe existir) y que
> `MAX(started_at)` de sessions avance.

Pendiente de despliegue (no code): al subir, cualquier evento **ya buffereado en el
sink kafka de Vector** al momento del cutover queda huérfano (Vector 0.40 keyea el
buffer por sink id) — pérdida acotada de la cola en vuelo, aceptable para honeypot.
Conviene drenar el consumer de Kafka antes de retirarlo en prod. Instalaciones de
cliente existentes necesitan re-bajar `cowrie.toml`/`suricata.toml` y recrear Vector.

### Fase 2 — Tee del API a Kafka + consumidor del lake

Objetivo: reintroducir Kafka como bus interno de fan-out, alimentado por el API.

- **Producer en el ingest-api:** tras persistir un evento en Postgres, producirlo
  a Kafka. **Decisión de implementación (elegir el chokepoint, preferir DRY):**
  identificar el punto de convergencia único — el `eventBus` que ya existe, o un
  helper `produceToLake(event)` llamado desde cada servicio de ingesta
  (`IngestService`, `SuricataService`, `processProtocolEvent`, web handler) — para
  no duplicar el `produce` en 4 lugares.
- **Topics:** producir por fuente a `honeypot.cowrie`, `honeypot.suricata`,
  `honeypot.web`, `honeypot.protocol` (crear los dos nuevos en el `kafka-init`;
  `KAFKA_AUTO_CREATE_TOPICS_ENABLE` está en `false`). Se produce el **evento
  validado crudo por fuente**; la normalización la hace el consumidor del lake
  (no construir capa de normalización ahora — YAGNI).
- **Consumidor del lake:** stub en esta fase. El destino real (ClickHouse + R2) y
  el split hot/cold del dashboard están detallados en la Fase 3, abajo.

Criterio de salida: cada evento que entra por el API aparece en Kafka en su topic
por fuente; un consumidor de prueba puede leerlo; el path de Postgres/dashboard no
cambió de latencia ni de forma.

**Progreso (2026-07-17): Fase 2 implementada y verificada (incluye e2e real contra Kafka).**

- **`LakeProducer`** (`lib/lake-producer.ts`): singleton con `connect`/`tee`/
  `disconnect`, un producer kafkajs (`allowAutoTopicCreation:false`). `tee()` es
  **fire-and-forget** — nunca lanza ni bloquea el hot path; un fallo se loguea y se
  descarta. `plugins/lake-producer.ts` conecta en `setImmediate` (no bloquea el
  arranque; `tee` es no-op hasta conectar), gateado por `KAFKA_BROKERS` igual que el
  ex-consumer. Registrado en `app.ts`.
- **Chokepoints (5 sitios, junto al `forwardClientEventBySensorId` existente):**
  cowrie en `IngestService._processLine` (produce `raw`, key = `session:eventid`);
  web en las 2 ramas de `web.controller` (single + batch, produce `d`, key
  `d.eventId`); protocol en `processProtocolEvent` (produce `d`, key `d.eventId`);
  suricata en `SuricataService.persistAlerts` (produce cada alerta persistida, sin
  key — no hay id estable). Se produce el **evento validado crudo** que cada sitio
  ya tiene; el topic codifica la fuente. Constantes en `LAKE_TOPICS` para no tipear
  nombres a mano.
- **Topics:** `honeypot.web` + `honeypot.protocol` agregados al `kafka-init` de los
  **3** composes con Kafka (`single-host`, `platform`, `docker-compose.yml` dev).
  Verificado real: `kafka-init` creó los 4 topics (`Created topic honeypot.web`/
  `honeypot.protocol` en logs), confirmado con `kafka-topics.sh --list`.
- **E2E real contra Kafka** (no mock): levanté el Kafka del compose dev, conecté el
  `LakeProducer` real a `localhost:9094`, `tee`-é un evento cowrie, y un consumer
  kafkajs lo leyó de vuelta — 1 mensaje, key `s1:cowrie.login.success` y value
  intacto (`password` incluido). `RESULT: PASS`. Los 5 sitios de wiring son
  one-liners que llaman al mismo `tee()` ya probado.
- Verificación: `tsc --noEmit` limpio; 147 tests ingest-api en verde (sin
  regresión); `docker compose config` exit 0 en los 3 composes; e2e real del
  producer PASS. **No probado full-stack** (POST al API real → topic): el mecanismo
  del tee está probado en vivo y los sitios son triviales; la confirmación
  full-stack natural es el smoke test de deploy.

Ceilings anotados: tee best-effort (un blip de Kafka puede perder 1 evento del
lake — outbox transaccional si molesta); si `connect()` falla tras el arranque no
reintenta (queda deshabilitado hasta reiniciar el API — aceptable, Postgres sigue).

### Fase 3 — Lake: ClickHouse + R2 y split hot/cold del dashboard

**Estado: planificado, sin implementar (detallado 2026-07-20).** Las Fases 1 y 2
ya dejan el bus listo: el ingest-api tee-a **cada evento validado crudo** a Kafka
en 4 topics por fuente (`honeypot.cowrie`, `honeypot.suricata`, `honeypot.web`,
`honeypot.protocol`), fire-and-forget, sin tocar el path caliente. Falta el
**consumidor del lake y su destino**. Esta fase lo define entero.

#### Decisiones ya tomadas (con el usuario, 2026-07-20)

- **Motor: ClickHouse** (no DuckDB). Servidor column-store corriendo 24/7 en el
  host core. Se eligió por escalar mejor a analítica concurrente y evitar una
  migración futura desde DuckDB; el usuario asume el costo de un servicio
  permanente. DuckDB+R2 on-demand se consideró y descartó explícitamente.
- **Object storage: Cloudflare R2** (compatible S3, sin cargo de egress).
- **Infra: subir la VPS a 6 cores / 12GB antes de instalar ClickHouse.** El uso
  real del stack hoy es ~3.5GB / ~35% de 4 cores (tras arreglar el crash-loop de
  suricata y el throttling de Kafka del incidente 2026-07-20). ClickHouse en el
  volumen actual (~1M protocol_hits, ~464k events, ~427k credential_attempts)
  pesa cientos de MB de RAM, no gigas; 12GB da colchón cómodo. Resize sin migrar
  cuando crezca.

#### Arquitectura — qué rol cumple cada pieza

Este es el punto que más confunde: **ClickHouse y R2 no son lo mismo ni
redundantes**, son dos capas del lake.

```
Kafka (bus interno, ya existe)
  → consumidor → ClickHouse (MergeTree en NVMe local)   ← store analítico CALIENTE
                     │                                     (query SQL sub-segundo, working set)
                     └→ export Parquet → R2               ← archivo DURABLE OFF-HOST
                                                            (registro de toda la historia; DR)
```

- **ClickHouse (NVMe local):** base de datos SQL column-store. Tiene los datos
  cargados e indexados; sirve las queries de analítica del dashboard. Es lo que
  reemplaza/descarga las agregaciones pesadas que hoy viven en Postgres+matviews.
- **R2 (Parquet):** placard durable fuera del host. Es el **registro de verdad de
  toda la historia** (encaja con la jerarquía de recuperación ya escrita en
  "Confiabilidad": Postgres reciente ← replay Kafka; historia completa ← lake
  off-host). ClickHouse single-node RF=1 en el mismo host NO es HA; si el host
  muere, la copia en R2 es la que sobrevive.

Empezar con **export a Parquet en R2** como archivo durable (simple, KISS). El
**tiered storage nativo de ClickHouse** (S3 disk: particiones viejas TTL-movidas
a R2, queries transparentes cross-tier) queda como upgrade **solo si el NVMe
local se llena** — no montarlo de entrada (YAGNI).

#### Sub-fase 3a — ClickHouse arriba + schema

- **Servicio `clickhouse`** en los composes que hospedan el core
  (`docker-compose.prod.single-host.yml` y `docker-compose.prod.platform.yml`;
  NO en los honeypot-only ni app-only). Imagen `clickhouse/clickhouse-server`.
  Requisitos concretos:
  - Redes: `honeypot_ingest` (para alcanzar `kafka:9092`) + `app_api` o
    `db_private` (para que el ingest-api lo alcance). Ver el bloque `networks:` al
    final del compose (`edge`, `honeypot_ingest`, `app_api`, `db_private`,
    `deception_net`).
  - Volumen persistente para `/var/lib/clickhouse`.
  - `ulimits: nofile` alto (ClickHouse abre muchos files); healthcheck contra
    `/ping`.
  - **Límites de recursos DESDE EL PRIMER DÍA** (lección directa del incidente
    2026-07-20, ver [[replica-cpu-matview-refresh]] y el commit de Kafka
    `cpus 0.5→2.0`): fijar `deploy.resources.limits.cpus`/`mem`, y dentro de
    ClickHouse fijar `max_server_memory_usage` y bajar los pools de merge en
    background (`background_pool_size`) para que los merges de MergeTree (ráfagas
    de CPU) no ahoguen a Postgres/Kafka/Suricata. Arrancar con algo como 2 CPU /
    4GB y medir; NO dejar defaults que asumen una máquina dedicada.
- **Schema: una tabla MergeTree por fuente** (`cowrie_events`, `web_events`,
  `protocol_events`, `suricata_alerts`), reflejando el **evento crudo** que cada
  topic ya trae (ver Fase 2, sitios de `tee`). No construir una capa de
  normalización unificada ahora (YAGNI); si se quiere una vista cross-fuente,
  agregarla después como `VIEW`.
  - `PARTITION BY toYYYYMM(timestamp)`, `ORDER BY (timestamp, src_ip)` (el patrón
    de acceso típico de la analítica: rango temporal + agrupar por IP).
  - **Dedup por `eventId`:** el consumo de Kafka es at-least-once → usar
    `ReplacingMergeTree` keyeado por `eventId` (cowrie usa `session:eventid`, web
    y protocol usan `d.eventId`). **Ojo suricata: NO tiene id estable** (se tee-a
    sin key). Decidir: derivar un id determinístico (hash de campos de la alerta)
    o aceptar duplicados en esa tabla. Documentar la elección.

#### Sub-fase 3b — Consumidor Kafka → ClickHouse

Dos opciones; **preferir la (A) por KISS**:

- **(A) Kafka table engine nativo de ClickHouse (recomendado).** ClickHouse
  consume los topics directo: una tabla con engine `Kafka` por topic + una
  `MATERIALIZED VIEW` que mueve las filas a la tabla MergeTree. **Cero servicio
  nuevo** que correr/monitorear; ClickHouse maneja offsets y batching.
  - Caveat: acopla ClickHouse al DNS del broker (`kafka:9092`) — ambos en el
    mismo host, OK. El manejo de errores del engine es grueso: un mensaje
    malformado puede frenar el consumo → setear `kafka_skip_broken_messages`.
  - Offset inicial: decidir `earliest` (backfillea lo que quede en la retención
    de Kafka, días) vs `latest` (solo hacia adelante). Para historia completa, el
    backfill real es la sub-fase 3c, no la retención de Kafka.
- **(B) Consumidor standalone** (Node/kafkajs, se puede reusar el scaffold del
  `kafka-consumer.ts` retirado en Fase 1) que batchea e inserta a ClickHouse por
  HTTP. Más control sobre errores/transformación, pero es otro proceso a operar.
  Elegir esto solo si el engine nativo se queda corto.

#### Sub-fase 3c — Backfill de la historia existente (one-time)

Los topics solo retienen días (retención de Kafka). Para sembrar ClickHouse con
**toda la historia que ya está en Postgres** (~1M protocol_hits, etc.), un paso
único y aparte: exportar las tablas de Postgres e insertarlas en ClickHouse
(vía Parquet intermedio en R2, o `INSERT ... SELECT` con la función de tabla
`postgresql()` de ClickHouse). Correr una vez tras montar el schema, antes de
flipear el dashboard. Verificar counts por ventana temporal contra Postgres.

#### Sub-fase 3d — Lecturas del dashboard: split hot/cold

**Regla del split:**

- **CALIENTE (vivo/reciente, sub-segundo, NO cambia):** API → Postgres (+ read
  replica `prismaRead`). Sesiones, mapa vivo, eventos recientes, amenazas
  actuales. Todo el path caliente descrito en PERF_AUDIT sigue igual.
- **FRÍO (histórico/agregado, segundos OK):** API → ClickHouse. Campañas de
  credenciales de rango largo, tendencias históricas, top-N sobre meses.
- **SQL solo en repositorios** (regla de `docs/project-notes/backend-layering.md`):
  crear un cliente ClickHouse (`apps/ingest-api/src/lib/clickhouse.ts`) y
  repositorios nuevos que lo usen (`*.repository.ts`), separados de Prisma. Las
  rutas siguen HTTP-only. Reusar `withCache` (stale-while-revalidate) por encima,
  igual que hoy.
- **Gating por env:** todo el path de lectura del lake detrás de la presencia de
  `CLICKHOUSE_URL`, igual que `KAFKA_BROKERS` gatea el producer. Un single-host
  sin ClickHouse debe seguir andando (cae a las queries Postgres actuales).

#### Sub-fase 3e — Retirar los matviews que ClickHouse vuelve innecesarios

Candidato #1: **`credential_attempts`** (matview de ~1.6M filas). Hoy su
`REFRESH` cada 30 min es justo lo que saturó la réplica en el incidente
2026-07-06 (ver [[replica-cpu-matview-refresh]]); una agregación column-store de
1.6M filas es trivial en ClickHouse. Migrar esa query a ClickHouse **elimina el
REFRESH entero** — el mayor premio de rendimiento de toda la fase. Igual evaluar
`threat_ip_summary`. Retirar el `matview-refresh.ts` plugin (o el tick
correspondiente) recién cuando el endpoint equivalente lea de ClickHouse y esté
verificado. Este paso va **último**, después de que las lecturas frías estén
probadas.

#### Superficie de configuración (env nuevas)

- ClickHouse: `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`,
  `CLICKHOUSE_DATABASE`.
- R2: `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET`.
- Agregar a `apps/ingest-api/.env.example` y a los composes core. Retención:
  `CLICKHOUSE_HOT_TTL_DAYS` (ventana caliente en NVMe) y cadencia de export a R2.

#### Retención — alinear las tres capas

- **Kafka:** días (buffer/replay, NO es backup — ya anotado en "Confiabilidad").
- **ClickHouse (NVMe):** `TTL` de la ventana caliente (p.ej. 90 días) → luego
  DROP local (o move a R2 si más adelante se monta tiered storage).
- **R2 (Parquet):** permanente — el registro durable de toda la historia.
- Definir los números como decisión al implementar; no hardcodear sin medir el
  crecimiento real (el honeypot genera ~1.6M intentos de auth cada 30 días).

#### Deploy / rollout (aditivo, de-riesgado)

1. Subir la VPS (6c/12GB). 2. Levantar `clickhouse` vacío con límites de recursos.
3. Crear schema + engine Kafka (3a/3b) → verificar que llegan filas. 4. Backfill
one-time desde Postgres (3c). 5. Construir repositorios de lectura y flipear los
endpoints de analítica **uno por uno** detrás de `CLICKHOUSE_URL` (3d). 6. Retirar
el/los matview refresh **al final** (3e). En cualquier punto, si algo falla, el
path Postgres sigue sirviendo (el gating por env cae a lo actual).

#### Verificación

- Counts de filas coinciden entre Postgres y ClickHouse para una ventana.
- Una query de analítica conocida (p.ej. campañas de credenciales) devuelve lo
  mismo desde Postgres y desde ClickHouse.
- Los endpoints fríos del dashboard devuelven datos correctos; el path caliente
  no cambió de latencia ni de forma.
- ClickHouse se mantiene dentro de sus límites de CPU/RAM bajo carga real
  (chequear `cpu.stat` throttling y `docker stats`, igual que en el incidente de
  Kafka) — que el lake NO se vuelva el próximo cuello de CPU.

#### Ceilings / caveats anotados

- **At-least-once → dedup obligatorio** (ReplacingMergeTree por `eventId`;
  suricata necesita un id derivado o acepta duplicados).
- **Single-node ClickHouse, RF=1, mismo host que todo lo demás** → sin HA; la
  copia DR es el Parquet en R2.
- **Disciplina de recursos** (repetir hasta que quede): límites de cgroup +
  `max_server_memory_usage` + pools de merge acotados desde el día 1. El
  incidente 2026-07-20 fue exactamente esto (un servicio hambriento sin cuota
  sana ahogando al resto en 4 vCPU); no repetirlo al sumar un motor pesado nuevo.
- **`tee` best-effort** (heredado de Fase 2): un blip de Kafka puede perder 1
  evento del lake; Postgres es la fuente de verdad y el backfill lo reconcilia.
  Upgrade a outbox transaccional solo si la pérdida llega a molestar.

## Confiabilidad y caveats (anotados, no resueltos aquí)

- **Dual-write best-effort:** el API escribe Postgres y produce a Kafka, no
  atómicamente. `// ponytail: un blip de Kafka puede perder 1 evento del lake.
  Modo inverso (Kafka ok, Postgres falla) lo cubre el retry de Vector + dedup por
  eventId. Upgrade: outbox transaccional (evento + fila outbox en la misma tx,
  publisher aparte) si la pérdida llega a molestar.` Para un lake de analítica de
  honeypot, arrancar best-effort es lo sensato.
- **Kafka NO es backup:** retención limitada (días) y RF=1 single-broker → si se
  cae el host entero, Kafka muere con él. El registro durable de toda la historia
  es el **lake en object storage (off-host)**. Jerarquía de recuperación:
  Postgres reciente ← replay de Kafka; Postgres viejo o host caído ← lake off-host.
- **Multi-broker / RF≥3:** diferido a cuando el core sea multi-host real.

## Deploy / rollout

- **Aditivo y de-riesgado por fases.** Fase 1 no toca Kafka; si algo sale mal, la
  ingesta HTTP queda estable. Fase 2 agrega el tee encima.
- **Orden Fase 1:** desplegar la config de Vector (reroute) — en single-host es un
  `up -d vector`; en deploys remotos/cliente, la nueva config de Vector viaja con
  el compose/instalador. Retirar la suscripción del consumer en el mismo release
  del ingest-api.
- **Instalador remoto de clientes** (`sensor-compose-blocks.ts`): confirmar que el
  bloque de Vector de cowrie/suricata use sink HTTP (no Kafka) en los templates —
  hoy dependen del anchor `<<: *ingest` que ya trae `INGEST_API_URL` e
  `INGEST_SHARED_SECRET`.
- Backward-compat: un sensor con la config de Vector vieja (sink Kafka) sigue
  produciendo a `honeypot.cowrie` hasta que se le actualice; mientras el consumer
  viejo no se retire, ambos conviven. Retirar el consumer solo cuando todos los
  Vector estén en HTTP.

## Verificación

- Fase 1: end-to-end contra ingest-api + Postgres reales — un evento de cowrie y
  uno de suricata entran por HTTP y aparecen en Postgres; confirmar que **no** hay
  tráfico en `honeypot.cowrie`/`honeypot.suricata` (Vector ya no produce).
  `docker compose config --quiet` en los dos prod. `tsc --noEmit` + tests
  ingest-api. Verificar en el compose remoto de honeypot que cowrie/suricata
  ingresan (antes fallaban).
- Fase 2: un evento por cada una de las 4 fuentes-topic aparece en Kafka
  (`kafka-console-consumer`); el path Postgres no cambió. Test del producer/tee.

## Relación con otros planes

- **SENSOR_REMOTE_CONTROL** ([SENSOR_REMOTE_CONTROL.md](SENSOR_REMOTE_CONTROL.md)):
  el control plane no se toca; usa su propio canal (WS/poll), no la ingesta.
- **PERF_AUDIT / DASHBOARD_FIRST_LOAD:** el path caliente del dashboard
  (API → Postgres, con réplica de lectura) no cambia con este rework.
- **Lake (Fase 3, abajo):** las Fases 1-2 son su prerequisito — dejan el bus
  Kafka detrás del API con las 7 fuentes, listo para colgar el consumidor
  ClickHouse + el archivo R2.
