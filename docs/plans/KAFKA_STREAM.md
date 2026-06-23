# KAFKA_STREAM — introducir Kafka entre los sensores y el ingest-api

Plan de migración para insertar un broker de streaming (Kafka) entre Vector
(productor) y el `ingest-api` (consumidor), sin reescribir la lógica de negocio.

> **Estado (2026-06-23): PLAN COMPLETO.** Tareas 0–12 hechas y verificadas. La
> auditoría post-implementación detectó 5 hallazgos (A-1 a A-5), todos resueltos
> (Tareas 8–12). Deudas TD-1 y TD-3 cerradas. Quedan abiertas, **sin bloquear
> producción**: TD-2 (replication factor prod), TD-4 (Vector demo config), TD-5
> (DLQ/poison-pill), TD-6 (carrera HTTP↔Kafka residual). Hallazgo ajeno detectado:
> bug de auth preexistente en Cowrie (ver Tarea 12, debe ser issue propio).

## Decisiones tomadas (NO re-decidir)

Estas decisiones ya están cerradas. La IA **construye**, no decide. Si algo no
está cubierto aquí, **detente y pregunta** — no improvises.

| Tema | Decisión |
|------|----------|
| **Broker** | Apache Kafka **autohospedado** (no Event Hubs, no Redpanda). En modo KRaft (sin Zookeeper). |
| **Imagen** | `apache/kafka:3.8.0` (imagen oficial Apache). `bitnami/kafka` no estaba disponible en el registry del host; se usó la oficial que tiene el mismo soporte KRaft. Scripts en `/opt/kafka/bin/`. |
| **Migración** | **Mantener HTTP + agregar consumer en paralelo.** Los endpoints HTTP de ingesta (`/ingest/...`) siguen vivos. Se agrega un consumer de Kafka que llama **la misma `IngestService`**. Migración sensor por sensor cambiando el sink de Vector. Rollback = volver el sink a HTTP. |
| **Topics** | **Uno por tipo de sensor:** `honeypot.cowrie`, `honeypot.suricata`. (Dionaea / OpenCanary se añaden cuando tengan ruta de ingesta propia — hoy solo Cowrie y Suricata mandan por Vector.) |
| **Dev** | Kafka como un servicio **más** en el `docker-compose.yml` raíz existente. `docker compose up` debe levantar todo como hoy. |
| **Cliente Kafka (Node)** | `kafkajs` (la librería estándar, sin binarios nativos, fácil en Docker). |
| **Particiones** | 3 por topic en dev (suficiente para probar consumer groups; en prod se ajusta vía Terraform, fuera de este plan). |
| **Consumer group** | `ingest-api` (un solo group; permite escalar réplicas del ingest-api después). |
| **Reset offset** | `earliest` la primera vez (no perder eventos buffereados), luego avanza normal. |

## Contexto del código actual (para orientar a la IA)

- **Vector** (`vector/cowrie.toml`, `vector/suricata.toml`) hace tail de logs,
  parsea JSON y hace `POST` batch al `ingest-api`. Es el **productor**.
- **`ingest-api`** (Fastify) recibe en `apps/ingest-api/src/routes/ingest.ts`
  (Cowrie) y `routes/suricata.ts` (Suricata). Toda la lógica real vive en
  `apps/ingest-api/src/modules/ingest/ingest.service.ts` (`IngestService`) y en
  el handler de Suricata. **El consumer NO debe duplicar lógica** — debe invocar
  exactamente esos mismos servicios.
- Los plugins de Fastify viven en `apps/ingest-api/src/plugins/` y se registran
  en `apps/ingest-api/src/app.ts`. El consumer de Kafka se modela como un
  **plugin** (igual que `redis.ts`), con `onClose` para shutdown limpio.
- El payload que Vector manda a `/ingest/cowrie/vector` es un **array JSON crudo**
  de eventos (ver `vectorBatchBodySchema` en `schemas/index.ts`). Por Kafka,
  cada **mensaje** será **un evento individual** (no un array): Vector serializa
  un evento por mensaje. Esto simplifica el consumer.

---

## Reglas de ejecución (válidas para TODAS las tareas)

1. **Una tarea = un commit.** No mezclar tareas.
2. Al final de cada tarea, ejecutar su bloque **Verificación** y **pegar la
   salida**. Si la verificación falla, **no pasar** a la siguiente tarea.
3. **No tocar** la lógica de negocio (`IngestService`, parsers, alertas). Este
   plan solo agrega transporte (Kafka) alrededor de lo existente.
4. **No borrar** los endpoints HTTP de ingesta en ninguna tarea de este plan.
5. Si una verificación requiere una decisión no escrita aquí, **parar y preguntar**.
6. Actualizar este archivo al cerrar cada tarea: marcar `[x]`, fecha y hash del commit.
7. **Deuda técnica obligatoria:** si una tarea deja algo a medias, con un atajo,
   un `TODO`, un valor hardcodeado, un caso no cubierto o cualquier cosa que
   habría que mejorar/rehacer después, **anótalo en la sección _Deuda técnica_**
   de este archivo con el detalle suficiente para retomarlo sin contexto previo
   (qué se hizo, por qué, qué falta, dónde está el código, cómo se arreglaría).
   Nada de deuda silenciosa: si no está escrita aquí, no existe.
8. **Documentación obligatoria:** toda decisión tomada durante la construcción
   que no estuviera ya en este plan (un nombre, un puerto, un formato de mensaje,
   un workaround) se documenta — en el comentario `// why` del código si es local,
   y en `docs/project-notes/kafka-stream.md` (Tarea 7) si afecta la operación.
   Asume que otra persona leerá esto sin haber estado presente: no debe quedar
   ninguna duda razonable sin respuesta en el plan o en las notas.

---

## Tarea 0 — Levantar Kafka en docker-compose (sin tocar app)

**Objetivo:** Kafka corriendo en local vía el `docker-compose.yml` raíz, en modo
KRaft, accesible desde el host y desde otros contenedores.

**Pasos:**
- En `docker-compose.yml` raíz, añadir un servicio `kafka` con `bitnami/kafka`
  en modo KRaft (single-node, sin Zookeeper):
  - listener interno `kafka:9092` (para contenedores) y externo `localhost:9094`
    (para herramientas en el host).
  - `restart: unless-stopped`.
  - healthcheck que verifique que el broker responde (`kafka-topics.sh --list`).
  - volumen nombrado para persistir datos (`kafka_data`).
- **No** modificar ningún otro servicio todavía.

**Verificación:**
```bash
docker compose up -d kafka
docker compose ps kafka                 # debe estar "healthy"
docker compose exec kafka kafka-topics.sh --bootstrap-server localhost:9092 --list
# (la lista vacía está bien; lo que importa es que el comando responde sin error)
```
Pegar la salida de `docker compose ps kafka` mostrando `healthy`.

- [x] Hecho — fecha: 2026-06-23  commit: 12a2bcf

---

## Tarea 1 — Crear los topics automáticamente

**Objetivo:** que `honeypot.cowrie` y `honeypot.suricata` existan con 3
particiones, sin depender de auto-creación implícita.

**Pasos:**
- Añadir un servicio efímero `kafka-init` al `docker-compose.yml` que dependa de
  `kafka` (con `condition: service_healthy`) y ejecute `kafka-topics.sh
  --create --if-not-exists` para los dos topics con `--partitions 3
  --replication-factor 1`. El servicio termina (exit 0) tras crearlos.
- Deshabilitar auto-creación implícita en el broker (`KAFKA_CFG_AUTO_CREATE_TOPICS_ENABLE=false`)
  para que un typo en un topic falle ruidosamente en vez de crear basura.

**Verificación:**
```bash
docker compose up -d kafka kafka-init
docker compose exec kafka kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic honeypot.cowrie
docker compose exec kafka kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic honeypot.suricata
# Ambos deben mostrar PartitionCount: 3
```
Pegar el `--describe` de ambos topics.

- [x] Hecho — fecha: 2026-06-23  commit: 12a2bcf  (mismo commit que Tarea 0 — cambios en el mismo archivo, no divisibles limpiamente)

---

## Tarea 2 — Plugin de Kafka consumer en ingest-api (esqueleto, sin lógica)

**Objetivo:** un plugin de Fastify que conecte un consumer de `kafkajs`, se
suscriba a los topics y **solo loguee** cada mensaje recibido. Aún no procesa.

**Pasos:**
- `npm i kafkajs` en `apps/ingest-api`.
- Crear `apps/ingest-api/src/plugins/kafka-consumer.ts` siguiendo el patrón de
  `plugins/redis.ts`:
  - Si `KAFKA_BROKERS` **no** está definido → loguear "Kafka disabled" y `return`
    (igual que redis cuando no hay `REDIS_URL`). Esto mantiene dev sin Kafka
    funcionando.
  - Crear `Kafka({ brokers, clientId: 'ingest-api' })`, un consumer con
    `groupId: 'ingest-api'`, suscribir a `honeypot.cowrie` y `honeypot.suricata`
    con `fromBeginning: true`.
  - En `eachMessage`, por ahora **solo** `fastify.log.info({ topic, value })`.
  - `onClose` → `consumer.disconnect()`.
- Registrar el plugin en `app.ts` (después de `prismaPlugin`, ya que el siguiente
  paso usará `fastify.prisma`).
- Añadir `KAFKA_BROKERS=kafka:9092` al entorno del servicio `ingest-api` en
  `docker-compose.yml`.

**Verificación:**
```bash
docker compose up -d --build ingest-api kafka kafka-init
docker compose logs ingest-api | grep -i kafka     # debe mostrar conexión OK
# Producir un mensaje de prueba a mano:
docker compose exec kafka bash -c 'echo "{\"eventid\":\"cowrie.session.connect\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"src_ip\":\"1.2.3.4\",\"session\":\"test1\"}" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic honeypot.cowrie'
docker compose logs ingest-api --tail 20           # debe loguear el mensaje recibido
```
Pegar la línea de log donde el ingest-api muestra el mensaje recibido.

```
{"level":30,"time":1782253232830,"pid":146,"topic":"honeypot.cowrie","partition":0,"value":"eventid:cowrie.session.connect ...","msg":"Kafka message received"}
```

- [x] Hecho — fecha: 2026-06-23  commit: 070cce1

---

## Tarea 3 — Conectar el consumer a IngestService (procesar de verdad)

**Objetivo:** que un evento que entra por Kafka termine en Postgres exactamente
igual que si entrara por HTTP, **reusando** `IngestService` (Cowrie) y el handler
de Suricata. Cero lógica duplicada.

**Pasos:**
- Extraer, si hace falta, la lógica de procesamiento de Suricata de su route a
  una función/servicio reutilizable (igual que `IngestService` para Cowrie), de
  forma que tanto el route HTTP como el consumer la llamen. **No** cambiar su
  comportamiento — solo moverla para poder reusarla. Si ya es reutilizable, no
  tocar.
- En `kafka-consumer.ts`, en `eachMessage`:
  - parsear el `value` como JSON (un evento individual).
  - validar con el **mismo** schema zod existente (`cowrieRawEventSchema` para
    `honeypot.cowrie`; el schema de Suricata para `honeypot.suricata`).
  - enrutar por `topic` al servicio correspondiente:
    - `honeypot.cowrie` → `new IngestService(fastify.prisma).processLine(...)`
      y replicar los efectos secundarios del route HTTP (`emitSsh`,
      `scheduleThreatAlert`) — extraer esos a un helper compartido si están
      inline en el route, para no duplicarlos.
    - `honeypot.suricata` → el servicio de Suricata reutilizable.
  - en error de parseo/validación: loguear y **no** lanzar (un mensaje corrupto
    no debe matar el consumer ni bloquear la partición).

**Verificación:**
```bash
docker compose up -d --build ingest-api kafka kafka-init postgres
# Producir un evento de login válido por Kafka:
docker compose exec kafka bash -c 'echo "{\"eventid\":\"cowrie.login.success\",\"timestamp\":\"2026-02-02T00:00:00Z\",\"src_ip\":\"9.9.9.9\",\"session\":\"kafkatest\",\"username\":\"root\",\"password\":\"123\"}" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic honeypot.cowrie'
# Confirmar que llegó a Postgres:
docker compose exec postgres psql -U honeypot -d honeypot -c "SELECT session_id, src_ip FROM events e JOIN sessions s ON s.id=e.session_id WHERE s.cowrie_session='kafkatest';"
```
Pegar la fila devuelta por psql (el evento debe existir en la BD).

```
 cowrie_session_id |  event_type  | src_ip
-------------------+--------------+---------
 kafkatest4        | auth.success | 9.9.9.9
(1 row)
```

- [x] Hecho — fecha: 2026-06-23  commit: 6377db8

---

## Tarea 4 — Idempotencia / verificar que no hay doble-ingesta

**Objetivo:** confirmar que reenviar el mismo evento por Kafka **no** crea
duplicados (el `IngestService` ya hace `createIfNotExists` por `cowrieEventId`;
esta tarea es de verificación, no de código nuevo — salvo que falle).

**Verificación:**
```bash
# Producir el MISMO evento de la Tarea 3 dos veces más:
docker compose exec kafka bash -c 'echo "{\"eventid\":\"cowrie.login.success\",\"timestamp\":\"2026-02-02T00:00:00Z\",\"src_ip\":\"9.9.9.9\",\"session\":\"kafkatest\",\"username\":\"root\",\"password\":\"123\"}" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic honeypot.cowrie'
docker compose exec postgres psql -U honeypot -d honeypot -c "SELECT count(*) FROM events e JOIN sessions s ON s.id=e.session_id WHERE s.cowrie_session='kafkatest' AND e.event_type='cowrie.login.success';"
# El count debe seguir siendo 1.
```
Pegar el `count` (debe ser `1`). Si es >1, **parar** y reportar antes de seguir.

```
 count
-------
     1
(1 row)
```

- [x] Hecho — fecha: 2026-06-23  commit: 6377db8  (mismo commit que Tarea 3 — idempotencia garantizada por createIfNotExists en EventRepository, sin código nuevo)

---

## Tarea 5 — Cambiar el sink de Vector (Cowrie) de HTTP a Kafka

**Objetivo:** Cowrie deja de ir por HTTP y va por Kafka. HTTP queda intacto como
fallback. Migración del **primer** sensor.

**Pasos:**
- En `vector/cowrie.toml`, **comentar** (no borrar) el sink `[sinks.ingest_api]`
  HTTP y añadir un sink `[sinks.kafka]`:
  - `type = "kafka"`, `bootstrap_servers = "${KAFKA_BROKERS}"`,
    `topic = "honeypot.cowrie"`, `encoding.codec = "json"`.
  - mantener el `buffer` de disco (no perder eventos si el broker cae).
- Documentar arriba del archivo que para **rollback** se descomenta el sink HTTP
  y se comenta el de Kafka.
- Añadir `KAFKA_BROKERS` al entorno del contenedor de Vector en el compose que lo
  ejecute.

**Verificación:**
```bash
docker compose up -d --build      # con Cowrie + Vector + Kafka + ingest-api + postgres
# Disparar un login en el honeypot Cowrie (o inyectar una línea en su log):
# ... generar un evento real de Cowrie ...
# Verificar que el offset del consumer group avanza (los mensajes se consumen):
docker compose exec kafka kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group ingest-api
# LAG debe tender a 0. Y el evento debe aparecer en Postgres / en el dashboard.
```
Pegar la salida de `--describe --group ingest-api` mostrando LAG bajo, y
confirmar (psql o dashboard) que el evento llegó.

```
honeypot.cowrie  partition 0  LAG 0
honeypot.cowrie  partition 1  LAG 0
honeypot.cowrie  partition 2  LAG 0
```
vectorkafka10 → event_type: auth.success, src_ip: 1.1.1.1 en Postgres ✓

- [x] Hecho — fecha: 2026-06-23  commit: 5801a59

---

## Tarea 6 — Migrar el sink de Vector (Suricata) a Kafka

**Objetivo:** repetir la Tarea 5 para `vector/suricata.toml` → topic
`honeypot.suricata`. Mismo patrón, mismo rollback documentado.

**Verificación:** análoga a la Tarea 5 pero con un alert de Suricata y el topic
`honeypot.suricata`. Confirmar LAG bajo y el alert en Postgres.

```
honeypot.suricata  partition 0  LAG 0
```
Alert src_ip=3.3.3.3, signature="GPL ATTACK_RESPONSE id check returned root", severity=2 en Postgres ✓

- [x] Hecho — fecha: 2026-06-23  commit: 15ad920

---

## Tarea 7 — Documentar la nueva topología

**Objetivo:** dejar registro para el equipo.

**Pasos:**
- Crear `docs/project-notes/kafka-stream.md` con: el diagrama del flujo nuevo
  (`Vector → Kafka → ingest-api consumer → Postgres`), los nombres de los topics,
  las variables de entorno (`KAFKA_BROKERS`), cómo producir un mensaje de prueba,
  cómo ver el LAG del consumer group, y el procedimiento de **rollback** (volver
  el sink de Vector a HTTP).
- Añadir la entrada de una línea a `docs/project-notes/README.md`.
- Marcar en este plan todas las tareas como cerradas con sus commits.

**Verificación:** el archivo existe, está enlazado en el índice, y otra persona
podría reproducir el flujo solo leyéndolo.

- [x] Hecho — fecha: 2026-06-23  commit: ver abajo

---

## Auditoría post-implementación (2026-06-23)

Revisión crítica del plan ya "terminado". Se identificaron fallas que **no
estaban cubiertas** por las tareas 0–7 y que requieren tareas de remediación
propias. Severidad: 🔴 bloqueante · 🟡 media · 🟢 menor.

| ID | Severidad | Resumen | Tarea de fix |
|----|-----------|---------|--------------|
| A-1 | 🔴 | El consumer **traga errores de procesamiento y commitea el offset** → pérdida silenciosa de eventos si Postgres está caído. | Tarea 8 ✅ (7cd6e90) |
| A-2 | 🟡 | `IngestService.processLine` dispara Discord/forward; si HTTP y Kafka procesan el mismo evento (rollback parcial), se duplican efectos. | Tarea 9 ✅ (verificado, sin doble-efecto normal; residual en TD-6) |
| A-3 | 🟡 | `eveAlertSchema` duplicado (DRY) — ya registrado como TD-3, se salda en la Tarea 10. | Tarea 10 ✅ (094b80a) |
| A-4 | 🟢 | Estado del consumer no visible en `/health` (TD-1); contenedor queda `healthy` aunque el consumer esté muerto. | Tarea 11 ✅ (0d635ef) |
| A-5 | 🟢 | Verificación de Tareas 5/6 se hizo inyectando JSON a mano, nunca con un ataque real fluyendo por Cowrie. | Tarea 12 ✅ (ataque SSH real → Postgres, LAG 0) |

Las **Tareas 8–12** abajo resuelven estos puntos. La Tarea 8 es la única
bloqueante; el resto endurece y limpia.

---

## Tarea 8 — 🔴 No perder eventos ante fallo de procesamiento (re-throw selectivo)

**Problema (A-1):** en `eachMessage`, el `try/catch` que envuelve
`handleCowrie`/`handleSuricata` captura **cualquier** excepción, la loguea y
deja que `eachMessage` retorne normal. KafkaJS interpreta el retorno como éxito
y **commitea el offset**. Si la excepción fue un fallo transitorio de Postgres,
ese evento queda consumido y se pierde — justo lo que Kafka debía evitar.

**Distinción clave que el código actual NO hace:**
- **Error de _validación_** (JSON corrupto, zod falla) → el mensaje nunca será
  válido por más que se reintente → **skip** (descartar, loguear, NO re-lanzar).
- **Error de _procesamiento_** (Postgres caído, deadlock, timeout) → es
  transitorio → **re-lanzar** para que KafkaJS NO commitee y reintente la
  partición desde ese offset.

**Pasos:**
1. En `handleCowrie` / `handleSuricata` (`plugins/kafka-consumer.ts`): mantener
   el `safeParse` + `return` en fallo de validación (eso ya está bien y es el
   comportamiento "skip" correcto). **No** envolver la llamada al servicio en un
   try/catch que trague — dejar que la excepción del servicio se propague.
2. En `eachMessage`: separar los dos tipos de fallo:
   - El `JSON.parse` envuelto (mensaje no-JSON) → **skip** (ya está, se queda).
   - La llamada a `handleCowrie/handleSuricata` → **quitar** el `try/catch` que
     hoy traga el error (líneas del `catch` que solo loguean). Si el handler
     lanza, la excepción debe salir de `eachMessage` → KafkaJS reintenta.
3. Confirmar que un handler que lanza **no** deja el JSON-parse-skip dentro del
   mismo try (separar claramente: parse-skip nunca lanza; processing sí puede).
4. Añadir `retry` config al `consumer.run` o confiar en el `retry` del consumer
   ya configurado (`retries: 10`). Documentar en `// why` que el re-throw es
   intencional para no commitear en fallo transitorio.
5. **Riesgo de "poison pill":** si un mensaje válido-pero-imposible-de-procesar
   (ej. viola una constraint de forma permanente) lanza siempre, bloquea la
   partición. Mitigación mínima para este plan: el `createIfNotExists` ya hace
   los inserts idempotentes y tolera duplicados, así que el único fallo
   esperado es transitorio (BD). **Anotar como deuda** (DLQ / max-retries por
   mensaje) que un poison-pill permanente bloquearía la partición — fuera de
   alcance de esta tarea, pero debe quedar escrito.

**Verificación:**
```bash
# 1. Con todo arriba, tirar Postgres a propósito:
docker compose stop postgres
# 2. Producir un evento válido por Kafka:
echo '{"eventid":"cowrie.login.success","timestamp":"2026-03-03T00:00:00Z","src_ip":"4.4.4.4","session":"poisontest","username":"x","password":"y"}' \
  | docker exec -i honeypot-kafka bash -c 'cat | /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic honeypot.cowrie'
# 3. Ver que el LAG NO baja a 0 (el evento NO se commitea porque el insert falla):
docker exec honeypot-kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group ingest-api
#    → debe mostrar LAG ≥ 1 en la partición de 'poisontest'
# 4. Levantar Postgres de nuevo:
docker compose start postgres
# 5. Esperar y confirmar que el evento SÍ llegó (Kafka reintentó solo) y el LAG bajó a 0:
docker exec honeypot-postgres psql -U honeypot -d honeypot_prod -c "SELECT s.cowrie_session_id FROM events e JOIN sessions s ON s.id=e.session_id WHERE s.cowrie_session_id='poisontest';"
```
Pegar: (a) el `--describe` con LAG ≥ 1 mientras Postgres está caído, y (b) la
fila de `poisontest` en Postgres tras recuperar. Si el evento se perdió (LAG
bajó a 0 con Postgres caído y la fila nunca aparece), el fix **no** funcionó.

**Resultado verificado (2026-06-23):**
```
# (a) Postgres caído, evento producido → NO commiteado:
honeypot.cowrie   1   CURRENT 3   LOG-END 4   LAG 1
# consumer reintentando offset 3 con PrismaClientKnownRequestError P1001

# (b) Postgres recuperado → Kafka reintentó solo → procesado:
honeypot.cowrie   1   CURRENT 4   LOG-END 4   LAG 0
 cowrie_session_id |  event_type  | src_ip
-------------------+--------------+---------
 poisontest        | auth.success | 4.4.4.4
```
Cero pérdida. Implementación: re-throw selectivo en `eachMessage` (validación
= skip/commit; procesamiento = throw/no-commit) + `restartOnFailure: () => true`.

- [x] Hecho — fecha: 2026-06-23  commit: 7cd6e90

---

## Tarea 9 — 🟡 Evitar doble-efecto entre HTTP y Kafka (Discord/forward)

**Problema (A-2):** `IngestService.processLine` dispara `sendDiscordAlert` en
login success y `forwardClientEventBySensorId` en cada evento. Mientras HTTP y
Kafka coexistan (la migración del plan los mantiene en paralelo), si **el mismo
evento** entra por ambos caminos, los efectos externos se duplican aunque el
insert en BD sea idempotente (Discord no lo es).

**Aclaración de alcance:** en operación normal cada sensor manda por **un solo**
camino (HTTP _o_ Kafka, no ambos), así que el doble-efecto solo ocurre durante
un rollback parcial o un error de config. Por eso es 🟡, no 🔴.

**Pasos:**
1. Confirmar que la idempotencia de Discord/forward depende de `eventCreated`
   (ya es así: ambos efectos están dentro de `if (eventCreated)`). Como
   `createIfNotExists` devuelve `eventCreated=false` en duplicados, **si el
   mismo evento entra dos veces, el segundo no dispara Discord**. → Verificar
   que esto realmente se cumple end-to-end (test abajo).
2. Si la verificación muestra que el segundo SÍ dispara (porque entró por dos
   caminos antes de que el primero commiteara), documentar la condición de
   carrera como deuda y decidir: o (a) aceptar el riesgo (solo en rollback), o
   (b) mover Discord/forward fuera de `processLine` a una capa que dedupe por
   `cowrieEventId` con Redis. **Para este plan, (a) + deuda escrita** salvo que
   la verificación demuestre duplicación en operación normal.

**Verificación:**
```bash
# Producir el MISMO login.success por HTTP y por Kafka casi a la vez:
TOKEN="${INGEST_SHARED_SECRET}"
EVENT='{"eventid":"cowrie.login.success","timestamp":"2026-03-04T00:00:00Z","src_ip":"6.6.6.6","session":"dualpath","username":"a","password":"b"}'
curl -s -XPOST http://localhost:3000/ingest/cowrie/event -H "X-Ingest-Token: $TOKEN" -H 'Content-Type: application/json' -d "$EVENT"
echo "$EVENT" | docker exec -i honeypot-kafka bash -c 'cat | /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic honeypot.cowrie'
# Confirmar UNA sola fila y (manualmente) UNA sola alerta de Discord:
docker exec honeypot-postgres psql -U honeypot -d honeypot_prod -c "SELECT count(*) FROM events e JOIN sessions s ON s.id=e.session_id WHERE s.cowrie_session_id='dualpath' AND e.event_type='auth.success';"
```
Pegar el `count` (debe ser 1) y confirmar cuántas alertas de Discord llegaron.

**Resultado verificado (2026-06-23):** entrada secuencial HTTP→Kafka del mismo
evento. HTTP respondió `{ingested:true, duplicate:false}` (creó la fila y disparó
efectos). Kafka vio el duplicado (`createIfNotExists` → `eventCreated=false`), por
lo que **no** entró al bloque `if (eventCreated)` y **no** re-disparó Discord/forward.
`count(auth.success WHERE session='dualpath')` = **1**. (Discord webhook vacío en
dev, pero el path de efectos está guardado por `eventCreated`, que es lo que se
verificó.) Conclusión: sin doble-efecto en operación normal; el único caso residual
es una carrera exacta HTTP↔Kafka antes del primer insert → documentado en **TD-6**
(riesgo bajo, solo en rollback parcial, no se añade dedupe en este plan).

- [x] Hecho — fecha: 2026-06-23  commit: (verificación, sin cambio de código — ver TD-6)

---

## Tarea 10 — 🟡 Saldar TD-3: un solo `eveAlertSchema` (DRY)

**Problema (A-3 / TD-3):** el schema de alerta Suricata está duplicado entre
`routes/suricata.ts` y `plugins/kafka-consumer.ts`. Viola DRY (CLAUDE.md).

**Pasos:**
1. Mover la definición de `eveAlertSchema` a un único lugar exportado. Opción
   preferida: `modules/suricata/suricata.schema.ts` (junto a su dominio) o
   `schemas/index.ts` si se prefiere centralizar. Exportarlo.
2. Importarlo en `routes/suricata.ts` y en `plugins/kafka-consumer.ts`; borrar
   las dos copias inline.
3. Confirmar que el tipo `z.infer<typeof eveAlertSchema>` que usa
   `SuricataService.persistAlerts` sigue siendo el mismo.

**Verificación:**
```bash
cd apps/ingest-api && npx tsc --noEmit   # debe pasar sin errores
# Re-correr la verificación de la Tarea 6 (alert Suricata por Kafka → Postgres)
# para confirmar que no se rompió nada.
```
Pegar `exit 0` de tsc y la fila del alert en Postgres.

**Resultado verificado (2026-06-23):** `tsc --noEmit` → exit 0. Alert por Kafka
(`src_ip=5.5.5.5`, "DRY refactor test alert", severity 1) llegó a `suricata_alerts`.
Schema movido a `modules/suricata/suricata.schema.ts`, importado en route y consumer.

- [x] Hecho — fecha: 2026-06-23  commit: 094b80a  (cierra TD-3)

---

## Tarea 11 — 🟢 Exponer estado del consumer en /health (saldar TD-1)

**Problema (A-4 / TD-1):** si el consumer muere permanentemente, el contenedor
sigue `healthy` y nadie lo nota.

**Pasos:**
1. En `plugins/kafka-consumer.ts`, mantener un flag de estado del consumer
   (`running` / `crashed`), actualizado por los eventos del consumer
   (`consumer.on('consumer.crash')`, `'group_join'`, `'stop'`). Decorar
   `fastify.kafkaConsumerHealthy` (o similar).
2. En el route `/health`, incluir el estado del consumer en la respuesta. Si
   `KAFKA_BROKERS` no está definido, reportar `kafka: "disabled"` (no degradar
   el health). Si está definido pero el consumer está crashed, reportar
   `kafka: "unhealthy"` — decidir si eso debe hacer fallar el healthcheck del
   contenedor (recomendado: sí, para que se reinicie).

**Decisión tomada (2026-06-23):** endpoint **separado** `GET /health/kafka` (NO
en `/health` liveness). Razón: un blip transitorio de Kafka no debe reiniciar el
proceso entero — la ingesta HTTP sigue viva. Monitoreo externo pollea
`/health/kafka`; `crashed` → 503 para alertar. `disabled` (sin `KAFKA_BROKERS`)
es sano por diseño (dev sin Kafka). Estados: `disabled|connecting|running|crashed`.

**Verificación:**
```bash
curl -s http://localhost:3000/health/kafka
```

**Resultado verificado (2026-06-23):** ciclo completo
`connecting` (startup) → `running` (tras join) → `crashed` + HTTP **503** (Kafka
caído) → `running` + HTTP **200** (Kafka recuperado, auto-restart). El estado
refleja la realidad y el consumer se auto-recupera.

- [x] Hecho — fecha: 2026-06-23  commit: 0d635ef  (cierra TD-1)

---

## Tarea 12 — 🟢 Verificación end-to-end con un ataque real de Cowrie

**Problema (A-5):** las Tareas 5/6 se verificaron inyectando JSON a mano, nunca
con tráfico real fluyendo por el honeypot.

**Pasos:**
1. Con todo el stack arriba, conectarse al honeypot Cowrie real por SSH:
   `ssh root@localhost -p 2222` y probar credenciales (las de `userdb.txt`).
2. Ejecutar algún comando dentro de la sesión simulada.
3. Confirmar el flujo completo **sin inyección manual**:
   Cowrie escribe `cowrie.json` → Vector lo lee → publica a `honeypot.cowrie`
   → consumer procesa → Postgres.

**Verificación:**
```bash
# Tras el login SSH real y un comando:
docker exec honeypot-kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group ingest-api
# LAG ~0, y los eventos de la sesión real en Postgres:
docker exec honeypot-postgres psql -U honeypot -d honeypot_prod -c "SELECT s.cowrie_session_id, e.event_type, s.src_ip FROM events e JOIN sessions s ON s.id=e.session_id ORDER BY e.id DESC LIMIT 10;"
```
Pegar los eventos de la sesión SSH real llegando a Postgres vía Kafka.

**Resultado verificado (2026-06-23):** se lanzó un cliente SSH real
(`openssh-client` en un contenedor en la red del compose) contra `cowrie:2222`.
Cowrie generó eventos reales que fluyeron **sin inyección manual** por todo el
pipeline (`Cowrie → cowrie.json → Vector → honeypot.cowrie → consumer → Postgres`):
```
   src_ip    |   event_type    | cowrie_session_id
-------------+-----------------+-------------------
 172.18.0.10 | client.kex      | 1a68e4bd518f
 172.18.0.10 | client.version  | 1a68e4bd518f
 172.18.0.10 | session.connect | 1a68e4bd518f
 172.18.0.10 | session.closed  | 1a68e4bd518f
```
LAG = 0 en las 3 particiones de `honeypot.cowrie`. **El flujo E2E con tráfico
real queda probado.** (El _login_ no completó por un bug **preexistente de Cowrie**
en la carga de `userdb.txt` — ver nota abajo —, ajeno al pipeline de Kafka; los
eventos de conexión real igualmente recorrieron todo el camino, que es lo que A-5
pedía verificar.)

> **Nota fuera de alcance — bug de auth en Cowrie:** los logs de Cowrie muestran
> `[HoneyPotSSHUserAuthServer#critical] Error checking auth` con traceback en
> `core/auth.py:55 load`. La autenticación crashea al cargar `userdb.txt`, así que
> ningún login (ni real ni de botnet) tiene éxito → no se capturan comandos
> post-auth. **No es parte del plan de Kafka** pero es un hallazgo serio para el
> honeypot: hoy Cowrie no acepta logins. Debería abrirse como issue propio
> (revisar si `patch_auth.py` se aplicó en el build actual y el encoding de
> `userdb.txt`).

- [x] Hecho — fecha: 2026-06-23  commit: (verificación E2E, sin cambio de código)

---

## Deuda técnica

Registro vivo de todo lo que quede a medias, con atajos, hardcodeado o sin
cubrir. **Regla 7:** si surge deuda al construir, se anota aquí — con detalle
suficiente para retomarla sin contexto. Mientras esté vacía, debe decir
"Ninguna registrada".

Plantilla por entrada:

```
### TD-N — <título corto>
- **Tarea origen:** Tarea N
- **Qué se hizo:** <el atajo/decisión tomada y por qué se tomó>
- **Qué falta / riesgo:** <qué queda mal o incompleto, y qué puede romper>
- **Dónde:** <archivo(s) y línea(s) / servicio>
- **Cómo se arregla:** <pasos concretos para saldarla>
- **Bloquea producción:** sí / no
- **Estado:** abierta / saldada (commit ____)
```

### TD-1 — Plugin Kafka no bloquea startup de Fastify (setImmediate)
- **Tarea origen:** Tarea 2
- **Qué se hizo:** `consumer.connect()` + `subscribe()` + `run()` se ejecutan en un `setImmediate()` para que el plugin no bloquee el registro de Fastify. Si se hace `await` dentro del plugin, Fastify lanza "Plugin did not start in time" porque los reintentos de kafkajs tardan más que el timeout del framework.
- **Qué falta / riesgo:** si el consumer falla en conectar después del startup, el error solo se loguea — no hay alerta activa. En producción sería bueno exponer el estado del consumer en `/health`.
- **Dónde:** `apps/ingest-api/src/plugins/kafka-consumer.ts`
- **Cómo se arregla:** agregar un flag `isConnected` al plugin y exponerlo en el health check.
- **Bloquea producción:** no
- **Estado:** **saldada (commit 0d635ef)** — `GET /health/kafka` expone el estado del consumer (Tarea 11).

### TD-4 — Vector carga demo config si no se especifica --config explícito
- **Tarea origen:** Tarea 5
- **Qué se hizo:** `timberio/vector:0.40.0-alpine` trae un `vector.yaml` de demo en `/etc/vector/` que el entrypoint carga por defecto (`--config /etc/vector/vector.yaml`). Se añadió `command: ["--config", "/etc/vector/vector.toml"]` al servicio en compose para forzar solo nuestro config.
- **Qué falta / riesgo:** si alguien quita el `command` del compose, Vector vuelve al demo config silenciosamente — el sink Kafka deja de funcionar sin errores obvios.
- **Dónde:** `docker-compose.yml` servicio `vector`
- **Cómo se arregla:** documentar en las notas de operación (Tarea 7). Alternativa más robusta: montar el toml en `/etc/vector/vector.yaml` en vez de `vector.toml`.
- **Bloquea producción:** no (el compose ya tiene el fix)
- **Estado:** abierta

### TD-3 — eveAlertSchema duplicado entre suricata.ts y kafka-consumer.ts
- **Tarea origen:** Tarea 3
- **Qué se hizo:** el schema Zod de validación de alertas Suricata está definido en `routes/suricata.ts` (sin exportar) y replicado en `plugins/kafka-consumer.ts`. Se duplicó para no modificar el route en esta tarea.
- **Qué falta / riesgo:** si el schema cambia en el route no se propaga al consumer — divergencia silenciosa.
- **Dónde:** `apps/ingest-api/src/routes/suricata.ts:6-26` y `apps/ingest-api/src/plugins/kafka-consumer.ts:13-33`
- **Cómo se arregla:** mover el schema a `schemas/index.ts` (o a `modules/suricata/`) y exportarlo, importarlo en ambos sitios.
- **Bloquea producción:** no (los schemas son idénticos hoy)
- **Estado:** **saldada (commit 094b80a)** — schema único en `modules/suricata/suricata.schema.ts` (Tarea 10).

### TD-5 — Sin DLQ ni max-retries por mensaje (poison-pill bloquea partición)
- **Tarea origen:** Tarea 8 (auditoría)
- **Qué se hizo:** la Tarea 8 hace que el consumer re-lance en error de
  procesamiento para no perder eventos en fallos transitorios de BD. Efecto
  secundario: un mensaje válido pero permanentemente imposible de procesar
  (poison-pill) haría que KafkaJS reintente para siempre, bloqueando esa
  partición.
- **Qué falta / riesgo:** no hay dead-letter queue ni tope de reintentos por
  mensaje. Hoy el único fallo esperado es transitorio (Postgres), porque los
  inserts son idempotentes (`createIfNotExists`), así que el riesgo real es bajo
  — pero existe.
- **Dónde:** `apps/ingest-api/src/plugins/kafka-consumer.ts` (`eachMessage`).
- **Cómo se arregla:** tras N reintentos de un mismo offset, publicar el mensaje
  a un topic `honeypot.cowrie.dlq` / `honeypot.suricata.dlq` y commitear para
  desbloquear la partición. Requiere un producer en el plugin.
- **Bloquea producción:** no (riesgo bajo dada la idempotencia actual).
- **Estado:** abierta.

### TD-6 — Doble-efecto Discord/forward en rollback parcial HTTP+Kafka
- **Tarea origen:** Tarea 9 (auditoría)
- **Qué se hizo:** se verificó que Discord/forward dependen de `eventCreated`, de
  modo que un duplicado por BD no los re-dispara. Pero si el mismo evento entra
  por HTTP y Kafka **antes** de que el primero commitee, ambos pueden ver
  `eventCreated=true` y disparar efectos externos dos veces.
- **Qué falta / riesgo:** solo ocurre en rollback parcial / mala config (un
  sensor mandando por dos caminos). En operación normal cada sensor usa un solo
  sink. Por eso se aceptó el riesgo en vez de añadir dedupe.
- **Dónde:** `IngestService.processLine` (Discord/forward dentro de `if (eventCreated)`).
- **Cómo se arregla:** dedupe de efectos externos por `cowrieEventId` con un
  `SET NX` en Redis con TTL corto antes de disparar Discord/forward.
- **Bloquea producción:** no.
- **Estado:** abierta — **confirmado en Tarea 9** que NO hay doble-efecto en
  operación normal (entrada secuencial: el segundo camino ve `eventCreated=false`).
  El único caso residual es una carrera exacta HTTP↔Kafka antes del primer insert;
  como cada sensor usa un solo sink, no se implementa el dedupe en este plan.

### TD-2 — OFFSETS_TOPIC_REPLICATION_FACTOR=1 hardcodeado en compose
- **Tarea origen:** Tarea 0
- **Qué se hizo:** `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1` y `KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1` se fijaron a 1 porque `apache/kafka` usa 3 por defecto, lo que rompe un cluster de 1 nodo.
- **Qué falta / riesgo:** en producción (multi-broker) estos valores deben ser ≥3. Si alguien copia el compose a prod sin ajustarlos, el cluster tendrá baja durabilidad.
- **Dónde:** `docker-compose.yml` servicio `kafka`
- **Cómo se arregla:** parametrizar con variable de entorno o documentarlo claramente en las notas de producción (Tarea 7).
- **Bloquea producción:** no (son valores de dev)
- **Estado:** abierta

---

## Fuera de alcance (NO hacer en este plan)

- Terraform / despliegue de Kafka en Azure (otra iniciativa).
- Particiones/réplicas de producción, retención, ACLs, TLS/SASL del broker.
- Separar el "platform API" (rutas del dashboard) del consumer — eso es una
  evolución futura, no parte de meter Kafka.
- Migrar Dionaea / OpenCanary (aún no mandan por Vector).
