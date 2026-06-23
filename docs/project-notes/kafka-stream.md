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

1. Comentar el bloque `[sinks.kafka]` y su `[sinks.kafka.buffer]`.
2. Descomentar el bloque `[sinks.ingest_api]` y sus sub-tablas, reemplazando
   los placeholders con las variables reales:
   - `INGEST_API_URL_PLACEHOLDER` → `${INGEST_API_URL}`
   - `INGEST_SHARED_SECRET_PLACEHOLDER` → `${INGEST_SHARED_SECRET}`
3. En `docker-compose.yml`, servicio `vector`: reemplazar `KAFKA_BROKERS` por
   `INGEST_API_URL` e `INGEST_SHARED_SECRET`; cambiar `depends_on` de `kafka` a `ingest-api`.
4. `docker compose up -d vector`

### Suricata (`vector/suricata.toml`)

Mismo procedimiento que Cowrie, mismos placeholders.

## Gotchas

- **Vector carga su demo `vector.yaml` por defecto.** La imagen `timberio/vector:0.40.0-alpine`
  trae `/etc/vector/vector.yaml` (demo con logs sintéticos). El compose especifica
  `command: ["--config", "/etc/vector/vector.toml"]` para forzar solo nuestro config.
  Si se quita ese `command`, Vector silenciosamente vuelve al demo y deja de enviar eventos.

- **Variables `${VAR}` en comentarios TOML son expandidas.** Vector expande
  `${...}` en todo el archivo, incluyendo líneas comentadas. Los sinks HTTP
  comentados usan placeholders literales (`INGEST_API_URL_PLACEHOLDER`) en
  vez de `${INGEST_API_URL}` para evitar errores de variable faltante.

- **Consumer Kafka arranca en background.** El plugin `kafka-consumer.ts` conecta
  con `setImmediate()` para no bloquear el startup de Fastify. Si el broker tarda
  en estar listo, kafkajs reintenta internamente (hasta 10 veces, backoff hasta 30s).
  El join al grupo puede tardar ~25s en arranque en frío.
