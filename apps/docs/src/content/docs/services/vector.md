---
title: Vector (Log Shipper)
description: Como Vector lee los logs de Cowrie y los envia a ingest-api con offset persistente, buffer en disco y retry automatico.
---

Vector es el log shipper que transporta eventos de Cowrie desde el archivo `cowrie.json` hacia `ingest-api`. Reemplaza el antiguo script Bash (`pull-cowrie-logs.sh`) con una solucion mas robusta: offset persistente, buffer en disco de 256 MB y 360 reintentos automaticos.

## Por que Vector

| Caracteristica | Script Bash anterior | Vector |
|----------------|---------------------|--------|
| Offset persistente | No — al reiniciar perdia la posicion | Si — guardado en `/var/lib/vector` |
| Buffer ante API caida | No — eventos perdidos | Si — disco hasta 256 MB |
| Retry automatico | No | Si — 360 intentos, backoff exponencial |
| Parsing JSON | Manual con `jq` | Nativo VRL (`parse_json!`) |
| Batching | Manual (1 a la vez) | 100 eventos / 2s timeout |
| Modelo | Pull (el app server hace SSH al VPS) | Push (Vector en el VPS empuja al app server) |

## Modelo push vs pull

Con el script Bash, el servidor app necesitaba una clave SSH para entrar al VPS honeypot y leer logs remotamente. Esto requeria credenciales persistentes en el servidor app.

Con Vector, el flujo se invierte:

```
VPS honeypot                      Servidor app
────────────                      ────────────
cowrie.json
      │
  Vector (sidecar)
  tail + parse + buffer
      │
      └── POST /ingest/cowrie/vector  ──▶  ingest-api
          (via VPN, X-Ingest-Token)
```

El servidor app no necesita saber nada del VPS. Solo expone el endpoint de ingesta en su IP VPN.

## Configuracion (`vector/cowrie.toml`)

```toml
data_dir = "/var/lib/vector"   # offset y buffer persistentes

[sources.cowrie_file]
type = "file"
include = ["${COWRIE_LOG_PATH}"]
read_from = "end"              # al arrancar, no re-procesa el historico
fingerprint.strategy = "device_and_inode"

[transforms.parse_event]
type = "remap"
inputs = ["cowrie_file"]
drop_on_error = true           # descarta lineas no-JSON silenciosamente
source = '. = parse_json!(string!(.message))'

[sinks.ingest_api]
type = "http"
inputs = ["parse_event"]
uri = "${INGEST_API_URL}/ingest/cowrie/vector"
method = "post"
encoding.codec = "json"

[sinks.ingest_api.batch]
max_events = 100
timeout_secs = 2

[sinks.ingest_api.request]
headers.Content-Type = "application/json"
headers.X-Ingest-Token = "${INGEST_SHARED_SECRET}"
retry_attempts = 360           # 1 hora de reintentos
retry_initial_backoff_secs = 1
retry_max_duration_secs = 10

[sinks.ingest_api.buffer]
type = "disk"
max_size = 268435456           # 256 MB
when_full = "block"            # backpressure — no descarta eventos
```

## Variables de entorno

| Variable | Descripcion |
|----------|-------------|
| `COWRIE_LOG_PATH` | Ruta al archivo `cowrie.json` dentro del contenedor |
| `INGEST_API_URL` | URL base de ingest-api. En single-host: `http://ingest-api:3000`. En two-host: `http://<ip-vpn-app>:3000` |
| `INGEST_SHARED_SECRET` | Token para el header `X-Ingest-Token` |

## Despliegue en Docker Compose

### Dev / Single-host

```yaml
vector:
  image: timberio/vector:0.40.0-alpine
  container_name: vector
  depends_on:
    cowrie:
      condition: service_started
    ingest-api:
      condition: service_healthy
  volumes:
    - cowrie_var:/cowrie/cowrie-git/var:ro      # lee el log de Cowrie
    - ./vector/cowrie.toml:/etc/vector/vector.toml:ro
    - vector_data:/var/lib/vector               # offset y buffer persistentes
  environment:
    COWRIE_LOG_PATH: /cowrie/cowrie-git/var/log/cowrie/cowrie.json
    INGEST_API_URL: http://ingest-api:3000
    INGEST_SHARED_SECRET: ${INGEST_SHARED_SECRET}
  networks:
    - honeypot_ingest
```

### Two-host (VPS honeypot)

```yaml
vector:
  image: timberio/vector:0.40.0-alpine
  container_name: vector
  depends_on:
    - cowrie
  volumes:
    - cowrie_var:/cowrie/cowrie-git/var:ro
    - ./vector/cowrie.toml:/etc/vector/vector.toml:ro
    - vector_data:/var/lib/vector
  environment:
    COWRIE_LOG_PATH: /cowrie/cowrie-git/var/log/cowrie/cowrie.json
    INGEST_API_URL: ${INGEST_API_URL}           # http://100.x.y.z:3000 via VPN
    INGEST_SHARED_SECRET: ${INGEST_SHARED_SECRET}
  networks:
    - edge
```

## Endpoint que consume

`POST /ingest/cowrie/vector` acepta un array JSON de eventos Cowrie en crudo (el mismo formato que escribe Cowrie en `cowrie.json`). Vector envia batches de hasta 100 eventos con el array directamente en el body — sin envelope adicional.

```json
[
  { "eventid": "cowrie.session.connect", "src_ip": "1.2.3.4", "timestamp": "...", ... },
  { "eventid": "cowrie.login.failed", "username": "admin", "password": "123456", ... }
]
```

## Ver logs de Vector

```bash
docker logs -f vector

# Salida tipica:
# INFO vector::sources::file: Tailing file. path=/cowrie/cowrie-git/var/log/cowrie/cowrie.json
# INFO vector::sinks::http: Request finished. status=200 body_size=1234
```

## Que pasa si ingest-api esta caido

1. Vector acumula eventos en el buffer de disco (hasta 256 MB)
2. Reintenta cada segundo, con backoff hasta 10s por intento
3. Despues de 360 reintentos (~1 hora) deja de reintentar ese batch
4. Si el buffer de disco se llena, Vector bloquea la lectura del archivo (no descarta eventos)
5. En cuanto ingest-api vuelva, Vector retoma el envio automaticamente
