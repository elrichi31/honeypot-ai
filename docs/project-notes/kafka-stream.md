# Kafka stream — topología y operación

## Flujo de datos

```
cowrie.json  ──► Vector (cowrie.toml)  ──► topic: honeypot.cowrie   ──┐
eve.json     ──► Vector (suricata.toml)──► topic: honeypot.suricata ──┤
                                                                        ▼
                                                           ingest-api Kafka consumer
                                                                        │
                                                      ┌─────────────────┴──────────────────┐
                                                      ▼                                     ▼
                                               IngestService                        SuricataService
                                             (Cowrie → Postgres)               (Suricata → Postgres)
```

Cada evento viaja como **un mensaje individual** en Kafka (no arrays).  
Vector serializa un evento por mensaje; el consumer lo parsea y llama
al mismo servicio que usa el endpoint HTTP.

## Sensores que escriben log → Vector → HTTP (no-pérdida sin Kafka aún)

Los 5 honeypots que antes hacían POST directo *fire-and-forget* (perdían el
evento si el POST fallaba) ahora **escriben una línea JSON por evento** a un log
que Vector tailea. Vector entrega vía HTTP con **buffer en disco**, así que un
corte de la API/red ya no pierde eventos: esperan en disco y se reenvían al
recuperarse. Mismo principio que Cowrie/Suricata, pero con sink HTTP (todavía).

```
web-honeypot   events.json ──► Vector (web-honeypot.toml) ──► POST /ingest/web/vector
port/mysql/ftp/smb events.json ─► Vector (protocol.toml) ──► POST /ingest/protocol/event
```

| Sensor       | Log (en el sensor)            | Config Vector        | Endpoint                  |
|--------------|-------------------------------|----------------------|---------------------------|
| web-honeypot | `/var/log/honeypot/events.json` | `web-honeypot.toml`  | `/ingest/web/vector`      |
| port         | `/var/log/honeypot/events.json` | `protocol.toml`      | `/ingest/protocol/event`  |
| mysql        | `/var/log/honeypot/events.json` | `protocol.toml`      | `/ingest/protocol/event`  |
| ftp          | `/var/log/honeypot/events.json` | `protocol.toml`      | `/ingest/protocol/event`  |
| smb          | `/var/log/honeypot/events.json` | `protocol.toml`      | `/ingest/protocol/event`  |

Detalles:
- Cada sensor monta un named volume propio (`web_events`, `ftp_events`, …);
  Vector lo monta `:ro` en `/var/log/<sensor>/events.json` (mount-point distinto,
  mismo volumen). El path lo pasa la env var `<SENSOR>_LOG_PATH`.
- El **heartbeat** sigue siendo POST directo a `/sensors/heartbeat` — es estado
  vivo, no evento de ataque, y no necesita garantía de no-pérdida.
- La **captura de binarios** (ftp/smb) no cambia: sigue escribiendo
  `CAPTURES_DIR/{md5}` + `.meta.json`. Solo el *evento* `file.upload` va por el log.
- `/ingest/protocol/event` acepta **objeto o array**: Vector batchea (array),
  los sensores que aún POSTean directo (dionaea, opencanary) mandan objeto. Toda
  la lógica (event-bus, forward, threat/deception alerts) vive en una sola
  función `processProtocolEvent` — sin duplicar.
- Idempotente: los endpoints deduplican por `eventId`, así que un reenvío tras
  recovery no genera duplicados en DB.

> **Migración a Kafka (multi-host):** cuando el deploy pase a multi-host, cambiar
> el `sink` de `web-honeypot.toml` y `protocol.toml` de `http` a `kafka` (mismo
> patrón que `cowrie.toml`), crear topics `honeypot.web` y `honeypot.protocol`, y
> añadir sus handlers al consumer. Los sensores **no se tocan** — ya escriben el
> log. Ver TODO en el plan KAFKA_STREAM.

## Topics

| Topic               | Particiones | Replication factor | Productor         | Consumidor              |
|---------------------|-------------|-------------------|-------------------|-------------------------|
| `honeypot.cowrie`   | 3           | 1 (dev)           | Vector cowrie     | ingest-api (group: `ingest-api`) |
| `honeypot.suricata` | 3           | 1 (dev)           | Vector suricata   | ingest-api (group: `ingest-api`) |

> En producción ajustar replication factor a ≥ 3 vía Terraform.

## Variables de entorno

| Variable        | Servicio         | Valor dev       | Descripción                        |
|----------------|------------------|-----------------|------------------------------------|
| `KAFKA_BROKERS` | `ingest-api`     | `kafka:9092`    | Bootstrap servers para kafkajs     |
| `KAFKA_BROKERS` | `vector`         | `kafka:9092`    | Bootstrap servers para Vector sink |

El broker escucha en dos listeners:
- `kafka:9092` — interno (entre contenedores, PLAINTEXT)
- `localhost:9094` — externo (herramientas en el host)

## Configuración clave del broker (docker-compose)

```yaml
KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: "1"       # single-node dev
KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: "1"
KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"           # typos fallan ruidosamente
```

## Cómo producir un mensaje de prueba (Cowrie)

```bash
# Desde el host (bash/sh — sin BOM):
echo '{"eventid":"cowrie.login.success","timestamp":"2026-01-01T00:00:00Z","src_ip":"1.2.3.4","session":"test1","username":"root","password":"123"}' \
  | docker exec -i honeypot-kafka bash -c \
    'cat | /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic honeypot.cowrie'
```

> **Windows PowerShell:** `echo` y `Get-Content` agregan BOM que rompe el parse JSON.
> Usar Git Bash o WSL para estos comandos de prueba, o escribir el archivo con
> `New-Object System.Text.UTF8Encoding $false`.

## Cómo ver el LAG del consumer group

```bash
docker exec honeypot-kafka \
  /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe --group ingest-api
```

El campo `LAG` debe tender a 0. Si crece, el consumer no está procesando.

## Cómo listar los topics

```bash
docker exec honeypot-kafka \
  /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list
```

## Rollback: volver el sink de Vector a HTTP

### Cowrie (`vector/cowrie.toml`)

1. Comentar el bloque `[sinks.cowrie_kafka]` y su `[sinks.cowrie_kafka.buffer]`.
2. Descomentar el bloque `[sinks.cowrie_ingest_api]` y sus sub-tablas, reemplazando
   los placeholders con las variables reales:
   - `INGEST_API_URL_PLACEHOLDER` → `${INGEST_API_URL}`
   - `INGEST_SHARED_SECRET_PLACEHOLDER` → `${INGEST_SHARED_SECRET}`
3. En `vector/conf.d/cowrie.toml`, repetir el mismo cambio si el compose ya usa
   `--config-dir /etc/vector/conf.d/`.
4. `docker compose up -d vector`

### Suricata (`vector/suricata.toml`)

Mismo procedimiento que Cowrie, usando `suricata_kafka`.

## Gotchas

- **Vector ahora carga desde `conf.d/`.** El compose usa
  `command: ["--config-dir", "/etc/vector/conf.d/"]`, así que cualquier cambio
  en los TOML activos debe hacerse dentro de `vector/conf.d/`. Los archivos en
  `vector/` quedaron como referencia y backup.

- **Variables `${VAR}` en comentarios TOML son expandidas.** Vector expande
  `${...}` en todo el archivo, incluyendo líneas comentadas. Los sinks HTTP
  comentados usan placeholders literales (`INGEST_API_URL_PLACEHOLDER`) en
  vez de `${INGEST_API_URL}` para evitar errores de variable faltante.

- **Consumer Kafka arranca en background.** El plugin `kafka-consumer.ts` conecta
  con `setImmediate()` para no bloquear el startup de Fastify. Si el broker tarda
  en estar listo, kafkajs reintenta internamente (hasta 10 veces, backoff hasta 30s).
  El join al grupo puede tardar ~25s en arranque en frío.
