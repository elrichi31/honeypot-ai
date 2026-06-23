# KAFKA_STREAM — introducir Kafka entre los sensores y el ingest-api

Plan de migración para insertar un broker de streaming (Kafka) entre Vector
(productor) y el `ingest-api` (consumidor), sin reescribir la lógica de negocio.

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

- [ ] Hecho — fecha: ____  commit: ____

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

- [ ] Hecho — fecha: ____  commit: ____

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

- [ ] Hecho — fecha: ____  commit: ____

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

- [ ] Hecho — fecha: ____  commit: ____

---

## Tarea 6 — Migrar el sink de Vector (Suricata) a Kafka

**Objetivo:** repetir la Tarea 5 para `vector/suricata.toml` → topic
`honeypot.suricata`. Mismo patrón, mismo rollback documentado.

**Verificación:** análoga a la Tarea 5 pero con un alert de Suricata y el topic
`honeypot.suricata`. Confirmar LAG bajo y el alert en Postgres.

- [ ] Hecho — fecha: ____  commit: ____

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

- [ ] Hecho — fecha: ____  commit: ____

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

_Ninguna registrada._

---

## Fuera de alcance (NO hacer en este plan)

- Terraform / despliegue de Kafka en Azure (otra iniciativa).
- Particiones/réplicas de producción, retención, ACLs, TLS/SASL del broker.
- Separar el "platform API" (rutas del dashboard) del consumer — eso es una
  evolución futura, no parte de meter Kafka.
- Migrar Dionaea / OpenCanary (aún no mandan por Vector).
