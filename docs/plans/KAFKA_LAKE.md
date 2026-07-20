# KAFKA_LAKE — Rework de streaming: ingestión uniforme por API + Kafka como tee interno

## Estado (2026-07-17)

**Planificado, sin implementar.** Este plan reordena la topología de ingesta
para que funcione **idéntica en single-host y multi-host**, y deja Kafka como un
bus interno detrás del ingest-api del que después cuelga el data lake. No incluye
el lake en sí (ClickHouse/Parquet + módulo de analítica) — eso es un plan aparte;
este es el prerequisito de plomería.

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
- **Consumidor del lake:** stub en este plan. El destino real (ClickHouse/Parquet
  en object storage) y el módulo de analítica van en el plan del lake.

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

### Fase 3 — Lake (fuera de este plan)

Placeholder. Object storage (S3/R2/B2) + ClickHouse, consumidor del lake, split
hot/cold del dashboard (vivo → API/Postgres; analítica → lake). Plan propio.

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
- **Lake (futuro):** este plan es su prerequisito — deja el bus Kafka detrás del
  API con las 7 fuentes, listo para colgar el consumidor del lake.
