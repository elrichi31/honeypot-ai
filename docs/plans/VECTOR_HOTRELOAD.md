# VECTOR_HOTRELOAD — Vector hot-reload para instalación incremental de sensores

## Contexto y problema

**Seguimiento (2026-06-25):** implementado en working tree. Cambios hechos:
- `vector/conf.d/` creado con `cowrie.toml`, `web-honeypot.toml`, `protocol.toml`, `suricata.toml`, `galah.toml`
- `docker-compose.yml` y `docker-compose.prod.honeypot.yml` migrados a `--config-dir /etc/vector/conf.d/`
- `sensors/web-honeypot|ftp-honeypot|mysql-honeypot|port-honeypot|smb-honeypot/` ahora tienen `vector.toml` + `install.sh`
- colisión real resuelta en `cowrie.toml` y `suricata.toml`: `sinks.kafka` pasó a `sinks.cowrie_kafka` / `sinks.suricata_kafka`, y `parse_event` a `parse_cowrie_event`

**Verificación hecha:** `docker compose config --quiet`, `docker compose -f docker-compose.prod.honeypot.yml config --quiet`, `vector validate --config-dir /etc/vector/conf.d/`, arranque real de Vector con `--config-dir`, y reload por `SIGHUP` quitando/reponiendo `web-honeypot.toml`.

**Pendiente de cierre total:** prueba funcional de tráfico real hacia todos los sensores confirmando entrega al endpoint final.

**Estado actual (2026-06-25):** Vector corre con configs explícitas via `--config`:

```yaml
command:
  - "--config"
  - "/etc/vector/cowrie.toml"
  - "--config"
  - "/etc/vector/web-honeypot.toml"
  - "--config"
  - "/etc/vector/protocol.toml"
```

Esto exige que el deploy sea **monolítico**: hay que levantar todos los sensores juntos con `docker compose up`. Si un operador instala primero el `web-honeypot` y luego el `ftp-honeypot`, Vector ya está corriendo con la config de web únicamente. El `ftp-honeypot` escribe a su volumen pero Vector no lo lee.

**Objetivo:** Que se puedan instalar sensores de forma incremental (uno a uno) y Vector los detecte automáticamente sin reiniciarse ni perder eventos.

## Solución elegida: conf.d/ + SIGHUP

Vector soporta recargar toda su configuración con `SIGHUP` sin perder el estado del buffer de disco. La solución:

1. Vector se lanza apuntando a un **directorio** (`--config-dir /etc/vector/conf.d/`) en lugar de archivos individuales.
2. Cada sensor tiene su propio `.toml` que se **copia a `conf.d/`** al instalarse.
3. El script de instalación del sensor envía `SIGHUP` a Vector después de copiar la config.
4. Vector recarga en caliente: sigue leyendo fuentes existentes + incorpora las nuevas.

No se eligió "un Vector por sensor" porque multiplica procesos innecesariamente — Vector ya está diseñado para leer múltiples fuentes y el proyecto corre en single-host.

## Arquitectura objetivo

```
vector/
  conf.d/                        ← directorio montado RW en el contenedor Vector
    cowrie.toml                  ← siempre presente (Cowrie es la base)
    web-honeypot.toml            ← se copia al instalar web-honeypot
    ftp-honeypot.toml            ← se copia al instalar ftp-honeypot
    protocol.toml                ← (opcional: config compartida de protocolo)
    ...

sensors/<sensor>/
  vector.toml                    ← config Vector de ese sensor (fuente de verdad)
  install.sh                     ← script que copia el toml + envía SIGHUP
```

Vector en docker-compose:
```yaml
vector:
  command: ["--config-dir", "/etc/vector/conf.d/", "--watch-config"]
  volumes:
    - ./vector/conf.d:/etc/vector/conf.d      # RW: los sensores depositan sus toml aquí
    - cowrie_var:/cowrie/cowrie-git/var:ro
    - web_events:/var/log/web-honeypot:ro
    - ftp_events:/var/log/ftp-honeypot:ro
    - ...
```

## Tareas

### Tarea 1 — Crear `vector/conf.d/` y mover configs existentes

- Crear directorio `vector/conf.d/`
- Mover (o copiar) los toml actuales a `vector/conf.d/`:
  - `vector/cowrie.toml` → `vector/conf.d/cowrie.toml`
  - `vector/web-honeypot.toml` → `vector/conf.d/web-honeypot.toml`
  - `vector/protocol.toml` → `vector/conf.d/protocol.toml`
  - `vector/galah.toml` → `vector/conf.d/galah.toml`
  - `vector/suricata.toml` → `vector/conf.d/suricata.toml`
- Mantener los archivos originales en `vector/` como referencia/backup (se pueden borrar al final).

**IMPORTANTE:** Los nombres de los `[sources.*]`, `[transforms.*]` y `[sinks.*]` deben ser únicos en todo el directorio. Verificar que no haya colisiones entre los toml existentes antes de moverlos.

### Tarea 2 — Actualizar docker-compose.yml (dev)

Cambiar el servicio `vector`:

```yaml
vector:
  image: timberio/vector:0.40.0-alpine
  container_name: vector
  restart: unless-stopped
  command:
    - "--config-dir"
    - "/etc/vector/conf.d/"
  depends_on:
    - cowrie
    - kafka
  volumes:
    - ./vector/conf.d:/etc/vector/conf.d          # RW — sensores depositan toml aquí
    - cowrie_var:/cowrie/cowrie-git/var:ro
    - web_events:/var/log/web-honeypot:ro
    - ftp_events:/var/log/ftp-honeypot:ro
    - mysql_events:/var/log/mysql-honeypot:ro
    - port_events:/var/log/port-honeypot:ro
    - smb_events:/var/log/smb-honeypot:ro
    - vector_data:/var/lib/vector
  environment:
    COWRIE_LOG_PATH: /cowrie/cowrie-git/var/log/cowrie/cowrie.json
    SENSOR_ID: ${SENSOR_ID_SSH:-cowrie-ssh-01}
    KAFKA_BROKERS: kafka:9092
    INGEST_API_URL: http://ingest-api:3000
    INGEST_SHARED_SECRET: ${INGEST_SHARED_SECRET:-}
    WEB_LOG_PATH: /var/log/web-honeypot/events.json
    FTP_LOG_PATH: /var/log/ftp-honeypot/events.json
    MYSQL_LOG_PATH: /var/log/mysql-honeypot/events.json
    PORT_LOG_PATH: /var/log/port-honeypot/events.json
    SMB_LOG_PATH: /var/log/smb-honeypot/events.json
```

Quitar las 3 líneas de `--config` individuales que había antes.

### Tarea 3 — Actualizar docker-compose.prod.honeypot.yml

Mismo cambio que Tarea 2 pero en el compose de producción. La sección `vector` del prod compose también usa `--config` individual — cambiarlo a `--config-dir`.

### Tarea 4 — Crear `sensors/<sensor>/vector.toml` para cada sensor

Cada sensor que necesite Vector tiene su propio `vector.toml`. Este archivo es la fuente de verdad de cómo Vector procesa los eventos de ese sensor.

**Sensores que necesitan vector.toml:**
- `sensors/web-honeypot/vector.toml` — copia de `vector/conf.d/web-honeypot.toml`
- `sensors/ftp-honeypot/vector.toml` — extraído de `vector/conf.d/protocol.toml` (solo la sección FTP)
- `sensors/mysql-honeypot/vector.toml` — ídem MySQL
- `sensors/port-honeypot/vector.toml` — ídem port
- `sensors/smb-honeypot/vector.toml` — ídem SMB

**Nota sobre protocol.toml:** El `protocol.toml` actual usa un source glob que lee los 4 sensores de protocolo. Para que cada sensor pueda instalarse independientemente, hay dos opciones:

- **Opción A (recomendada):** Mantener `protocol.toml` como config compartida en `conf.d/` y que incluya todos los paths. Al instalar un sensor nuevo solo se envía SIGHUP — no se añade un toml nuevo. Más simple, menos archivos.
- **Opción B:** Un toml por sensor de protocolo. Cada uno tiene su propio source/transform/sink con nombres únicos (ej: `ftp_file`, `parse_ftp`, `ftp_ingest`). Más aislado pero más verbose.

**→ Elegir Opción A para los sensores de protocolo** porque ya comparten el mismo endpoint y schema.

### Tarea 5 — Script `install-sensor.sh` por sensor

Crear `sensors/<sensor>/install.sh` — script que el operador ejecuta en el host para activar el sensor:

```bash
#!/usr/bin/env bash
# install.sh — activa <sensor> en un stack existente
set -euo pipefail

SENSOR_DIR="$(cd "$(dirname "$0")" && pwd)"
CONF_D="${SENSOR_DIR}/../../vector/conf.d"

# 1. Copiar la config de Vector a conf.d
cp "${SENSOR_DIR}/vector.toml" "${CONF_D}/<sensor>.toml"

# 2. Levantar el sensor (si no está corriendo)
docker compose up -d <sensor>

# 3. Enviar SIGHUP a Vector para que recargue la config
docker kill --signal=SIGHUP vector

echo "<sensor> instalado y Vector recargado."
```

Sensores de protocolo (ftp, mysql, port, smb) comparten `protocol.toml` — su install.sh actualiza ese archivo y envía SIGHUP, no crea un toml nuevo.

**Sensores que necesitan install.sh:**
- `sensors/web-honeypot/install.sh`
- `sensors/ftp-honeypot/install.sh`
- `sensors/mysql-honeypot/install.sh`
- `sensors/port-honeypot/install.sh`
- `sensors/smb-honeypot/install.sh`

### Tarea 6 — Verificar que `--config-dir` de Vector funciona correctamente

Vector con `--config-dir` carga todos los `.toml` y `.yaml` del directorio. Verificar:

1. `docker compose config --quiet` — compose válido sin errores
2. `docker compose up -d` — Vector arranca sin errores
3. `docker compose logs vector | grep "Starting file server"` — confirmar que lee todos los paths
4. Enviar tráfico a cada sensor y confirmar que llegan eventos a ingest-api (HTTP 200 en logs de Vector)
5. **Prueba de hot-reload:** Quitar un toml de `conf.d/`, enviar SIGHUP, confirmar que Vector deja de leer esa fuente. Re-agregar el toml, SIGHUP, confirmar que retoma.

### Tarea 7 — Actualizar docs

- Este archivo (`VECTOR_HOTRELOAD.md`): marcar tareas completadas con fecha y hash de commit.
- `docs/plans/README.md`: añadir entrada para este plan.
- `docs/project-notes/kafka-stream.md` si hay algo relevante sobre el cambio de arquitectura.

## Archivos clave a modificar

| Archivo | Cambio |
|---|---|
| `docker-compose.yml` | `vector.command`: `--config-dir /etc/vector/conf.d/`; `vector.volumes`: montar `./vector/conf.d` RW |
| `docker-compose.prod.honeypot.yml` | Mismo cambio |
| `vector/conf.d/*.toml` | Directorio nuevo con todos los toml actuales |
| `sensors/web-honeypot/vector.toml` | Config Vector del sensor |
| `sensors/ftp-honeypot/vector.toml` | Config Vector (o referencia a protocol.toml) |
| `sensors/*/install.sh` | Script de instalación incremental |

## Gotchas y restricciones

- **Nombres únicos en conf.d:** Vector falla al arrancar si dos archivos en `conf.d/` definen `[sources.foo]` con el mismo nombre. Verificar antes de hacer la migración.
- **`--watch-config` vs SIGHUP:** Vector 0.40 soporta `--watch-config` que recarga automáticamente cuando detecta cambios en el directorio. Es más cómodo que SIGHUP manual pero puede causar reloads inesperados. Evaluar si conviene habilitarlo.
- **Variables de entorno en conf.d:** Los toml en `conf.d/` siguen usando `${VAR}` que Vector expande desde el entorno del contenedor. Asegurarse de que todas las env vars necesarias están en el `environment:` del servicio vector en el compose.
- **Buffer de disco persiste:** El `vector_data` volume mantiene el offset de lectura y el buffer. Un reload con SIGHUP no pierde eventos ni resetea offsets — eso es el comportamiento correcto.
- **El `--config` explícito y `--config-dir` son mutuamente compatibles** en Vector, pero para claridad usar solo `--config-dir`.
- **`read_from = "end"` en fuentes de archivo:** Al hacer hot-reload, Vector empieza a leer archivos nuevos desde el final (no desde el principio). Si un sensor ya tenía eventos escritos antes de que Vector los detecte, esos eventos no se retransmiten. Eso es el comportamiento esperado — los eventos pre-instalación no son retransmitidos.

## Estado

| Tarea | Estado | Fecha | Commit |
|---|---|---|---|
| 1. Crear `vector/conf.d/` y mover configs | hecho | 2026-06-25 | sin commit |
| 2. Actualizar docker-compose.yml | hecho | 2026-06-25 | sin commit |
| 3. Actualizar docker-compose.prod.honeypot.yml | hecho | 2026-06-25 | sin commit |
| 4. Crear `sensors/*/vector.toml` | hecho | 2026-06-25 | sin commit |
| 5. Crear `sensors/*/install.sh` | hecho | 2026-06-25 | sin commit |
| 6. Verificar hot-reload end-to-end | parcial | 2026-06-25 | sin commit |
| 7. Actualizar docs | hecho | 2026-06-25 | sin commit |
