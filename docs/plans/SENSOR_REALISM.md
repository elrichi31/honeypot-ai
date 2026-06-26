# SENSOR_REALISM — Realismo, interacción y reestructuración de los sensores

## Para quién es este plan

Este documento es ejecutable por **otra IA o contributor sin contexto previo**. Cada
tarea incluye: archivo(s) a tocar, el problema concreto con número de línea, el
cambio esperado y cómo verificarlo. Se ejecuta **una tarea por commit**. Lee
[CLAUDE.md](../../CLAUDE.md) (principios DRY/KISS/segmentación) antes de empezar.

## Contexto

Los sensores viven en [`sensors/`](../../sensors/). Cinco son honeypots Python
custom y son el foco de este plan:

| Sensor | Archivo | Líneas | Estado estructura |
|--------|---------|--------|-------------------|
| `ftp-honeypot` | `app.py` | 471 | monolito |
| `mysql-honeypot` | `app.py` | 265 | monolito |
| `port-honeypot` | `app.py` | 660 | monolito |
| `smb-honeypot` | `app.py` | 488 | monolito |
| `web-honeypot` | `app.py` + `classifier.py` + `response_catalog.py` | 339+161+846 | **parcialmente modular (patrón a seguir)** |

Cowrie es upstream (no es código nuestro); solo ajustamos su `cowrie.cfg`.

Este plan tiene **dos ejes que se ejecutan juntos**:

1. **Reestructuración** — cada sensor es un mini-proyecto Python. Hoy 4 de 5 meten
   todo en un único `app.py`. Hay que separarlos en paquetes con responsabilidad
   única (ver "Estructura objetivo").
2. **Realismo e interacción** — corregir los "tells" que delatan el honeypot ante
   un scanner de fingerprinting y ampliar cuánta inteligencia capturamos.

**Regla de oro:** la reestructuración **no cambia comportamiento observable**. Se
hace primero, se verifica que el sensor sigue funcionando idéntico, y *después* se
añaden las mejoras de realismo sobre la estructura nueva. Nunca mezclar un refactor
estructural y un cambio de comportamiento en el mismo commit.

## Estructura objetivo (patrón común a todos los sensores)

Tomamos como referencia el patrón ya iniciado en `web-honeypot`. Cada sensor pasa
de `app.py` monolítico a un paquete:

```
sensors/<x>-honeypot/
  Dockerfile
  install.sh
  vector.toml
  requirements.txt          # nuevo donde no exista (ftp/mysql/port no tienen deps externas → puede quedar vacío o con comentario)
  app.py                    # SOLO arranque: lee env, crea servidores, corre el loop. Delgado.
  honeypot/                 # paquete con la lógica
    __init__.py
    config.py               # todas las constantes os.getenv() centralizadas
    ingest.py               # _post, _emit, _send, heartbeat (DUPLICADO HOY EN LOS 5 — ver Tarea 0)
    identity.py             # banners, nombres, OS, dominio, decoys → la "fachada"
    protocol.py             # el/los handler(s) del protocolo (ftp.py, mysql.py, etc. si hay varios)
```

Reglas de segmentación (de CLAUDE.md):
- Un archivo, una responsabilidad. Si `protocol.py` crece, partir por sub-protocolo
  (en `port-honeypot`: `services/redis.py`, `services/vnc.py`, `services/http.py`…).
- Ningún archivo de lógica supera ~250 líneas. `port-honeypot/app.py` (660) **debe**
  partirse sí o sí.
- `app.py` final solo orquesta; no contiene lógica de protocolo ni de ingest.

### Importante sobre el empaquetado Docker

Los Dockerfiles de ftp/mysql/port/smb hacen hoy `COPY app.py .`. Al pasar a paquete
**hay que cambiarlos a `COPY . .`** (como ya hace `web-honeypot/Dockerfile`). Si no
se cambia, el contenedor arrancará sin el paquete `honeypot/` y fallará. Esto es
parte de la tarea de reestructuración de cada sensor, no se puede olvidar.

---

## Fase 0 — Base compartida (hacer primero)

### Tarea 0.1 — Extraer el cliente de ingest común

**Problema:** `_post`, `_emit`, `_send`, `_send_heartbeat`, `heartbeat()` y
`_detect_ip()` están **copiados casi idénticos** en los 5 sensores
([ftp app.py:90-186](../../sensors/ftp-honeypot/app.py#L90),
[mysql app.py:112-180](../../sensors/mysql-honeypot/app.py#L112),
[port app.py:61-127](../../sensors/port-honeypot/app.py#L61),
[smb app.py:74-153](../../sensors/smb-honeypot/app.py#L74),
[web app.py](../../sensors/web-honeypot/app.py)). Viola DRY de forma grave.

**Decisión de arquitectura:** los sensores se construyen con
`build context: ./sensors/<x>-honeypot` (ver
[docker-compose.yml:184](../../docker-compose.yml#L184)), así que **un contexto no
puede importar archivos de otro**. No se puede hacer un paquete Python compartido
importable sin cambiar todos los build contexts a `./sensors` + Dockerfiles. Eso es
invasivo. **KISS:** en su lugar mantener un único archivo canónico
`sensors/_shared/ingest.py` y copiarlo en cada Dockerfile con una línea
`COPY ../_shared/ingest.py honeypot/ingest.py` **solo si** se cambia el build
context a `./sensors`.

> **Esta sub-decisión la debe tomar el implementador y dejarla escrita aquí.** Dos
> caminos válidos:
> - **(A) Recomendado, bajo riesgo:** cada sensor tiene su propio
>   `honeypot/ingest.py` (se acepta la duplicación entre proyectos porque son
>   despliegues independientes), pero **idéntico byte a byte**, derivado de una
>   plantilla en `sensors/_shared/ingest.py.template`. Documentar que cualquier
>   cambio se replica en los 5.
> - **(B) Más DRY, más riesgo:** mover build context a `./sensors`, ajustar los 5
>   Dockerfiles y el compose. Solo si el implementador valida que no rompe CI/CD
>   (ver [CICD.md](CICD.md)).
>
> **Por defecto seguir el camino (A).** No bloquear el resto del plan por esto.

**Verificación:**
```bash
docker compose -f docker-compose.prod.single-host.yml config --quiet
```

### Tarea 0.2 — Identidad de marca unificada (realismo crítico)

**Problema:** Cowrie se anuncia como `hostname = web-prod-01`
([cowrie.cfg:6](../../sensors/cowrie/cowrie.cfg#L6)) mientras FTP/SMB usan la marca
**"TechCorp"** (`FS-TECHCORP-01`, `techcorp_prod`, `db-primary.internal`). Un
atacante que pivota entre puertos del mismo host ve **dos identidades distintas** →
tell de honeypot multi-sensor mal coordinado.

**Cambio:** crear `sensors/_shared/identity.env.example` con la fachada de marca
única (hostname base, dominio, OS, nombres de servidor) y consumirla por env en
todos los sensores. Toda referencia hardcodeada a una marca pasa a leerse de env con
ese default común. Cowrie, FTP, SMB, port (paneles HTTP "TechCorp Internal
Dashboard") deben coincidir.

**Verificación:** revisar que `hostname`/dominio/OS son coherentes entre
`cowrie.cfg`, `smb-honeypot` (`SERVER_NAME`/`SERVER_DOMAIN`), `ftp-honeypot`
(decoys), `port-honeypot` (`_web_panel_response`, Docker `Name`).

---

## Fase 1 — Reestructuración (sin cambio de comportamiento)

Una tarea por sensor. **Cada una termina con el sensor funcionando idéntico.**

### Tarea 1.1 — Reestructurar `ftp-honeypot`
- `app.py` → solo `main()` + arranque.
- `honeypot/config.py` ← líneas [25-47](../../sensors/ftp-honeypot/app.py#L25).
- `honeypot/ingest.py` ← líneas [90-186](../../sensors/ftp-honeypot/app.py#L90).
- `honeypot/identity.py` ← `FTP_BANNER`, `FAKE_LISTING`, `DECOY_FILES`
  ([65-87](../../sensors/ftp-honeypot/app.py#L65)).
- `honeypot/ftp.py` ← `DataChannel` + `handle()`.
- Dockerfile: `COPY app.py .` → `COPY . .`.
- **Verificación:** `docker compose up -d --build ftp-honeypot` y prueba real:
  `curl -T /etc/hostname ftp://USER:pass@HOST/` debe seguir capturando el upload
  (aparece un fichero en el volumen de captures con su `.meta.json`).

### Tarea 1.2 — Reestructurar `mysql-honeypot`
- `honeypot/protocol.py` ← `_server_greeting`, `_error_packet`, `_parse_database`,
  `handle()`.
- resto igual que 1.1.
- **Verificación:** `mysql -h HOST -u root -ptest` devuelve `Access denied` igual que
  antes; aparece evento `auth` en el dashboard.

### Tarea 1.3 — Reestructurar `port-honeypot` (el más urgente, 660 líneas)
Partir por servicio:
```
honeypot/
  config.py            # PORTS, SERVICES, BANNERS
  ingest.py
  http_emulation.py    # _docker_response, _es_response, _web_panel_response, _parse_http_request, _http_response
  services/
    __init__.py
    vnc.py             # handle_vnc + VNC_CHALLENGE
    rdp.py             # handle_rdp
    redis.py           # handle_redis + REDIS_INFO + _redis_reply + _parse_resp
    http.py            # handle_httpish
    mongodb.py         # handle_mongodb
  dispatch.py          # make_handler() → mapea puerto a handler
```
- **Verificación:** `docker compose up -d --build port-honeypot`, luego
  `redis-cli -h HOST -p 6379 INFO` y `curl http://HOST:9200/` deben responder igual
  que hoy.

### Tarea 1.4 — Reestructurar `smb-honeypot`
- `honeypot/ingest.py`, `honeypot/config.py`, `honeypot/identity.py` (decoys +
  SERVER_*).
- `honeypot/impacket_patches.py` ← `_patch_impacket_writes`, `_patch_smb2_negotiate`,
  `_posix_to_filetime` ([230-357](../../sensors/smb-honeypot/app.py#L230)).
- `honeypot/capture.py` ← `_capture_file`, `_mark_write`, `_finalize_capture`.
- `app.py` ← `main()` + `_auth_callback`.
- **Verificación:** `smbclient //HOST/ADMIN$ -N -m SMB2 -c "ls"` y un `put` de un
  fichero pequeño se sigue capturando.

### Tarea 1.5 — Terminar de modularizar `web-honeypot`
Ya tiene `classifier.py` y `response_catalog.py`. Falta:
- Mover el cliente de ingest a `honeypot/ingest.py` (consistencia con los demás).
- Mover el session-tracker ([app.py:51-120](../../sensors/web-honeypot/app.py#L51))
  a `honeypot/sessions.py`.
- `response_catalog.py` tiene **846 líneas** → partir por categoría de payload
  (`catalog/config.py`, `catalog/dumps.py`, `catalog/seo.py`, `catalog/api.py`).
- **Verificación:** `curl http://HOST:8080/wp-config.php` sigue devolviendo el señuelo
  y el evento clasificado.

---

## Fase 2 — Mejoras de realismo (sobre la estructura nueva)

Ordenadas por ratio impacto/esfuerzo. Cada una es un commit independiente.

### Tarea 2.1 — Eliminar valores estáticos en `port-honeypot` (tell más obvio)
**Problemas concretos:**
- Redis `uptime_in_seconds:2847193` **fijo**
  ([app.py:413](../../sensors/port-honeypot/app.py#L413)) → dos `INFO` seguidos con
  el mismo uptime es imposible en un Redis real.
- Elasticsearch `_cat/indices` hardcodea `logs-prod-2026.06.25`
  ([app.py:265](../../sensors/port-honeypot/app.py#L265)) → la fecha caducará y
  delatará el honeypot el día que no coincida con "hoy".
- Docker `/info`: `Containers: 7`, mismo `ID` y `Name` siempre
  ([app.py:193](../../sensors/port-honeypot/app.py#L193)).

**Cambio:**
- `uptime_in_seconds` = segundos desde el arranque del proceso (guardar
  `START_TIME = time.time()` y calcular en cada `INFO`).
- Fechas de índices ES = relativas a `datetime.now()` (hoy y ayer), con tamaños que
  varíen ligeramente.
- Docker: contadores con jitter pequeño y `ID`/`ServerGuid` generados una vez al
  arranque (no literales).
**Verificación:** dos `redis-cli INFO` consecutivos muestran uptime creciente;
`curl http://HOST:9200/_cat/indices` muestra la fecha de hoy.

### Tarea 2.2 — SMB: ServerGuid aleatorio y coherencia OS/dialecto
**Problemas:**
- `ServerGuid = b"A" * 16` ([app.py:328](../../sensors/smb-honeypot/app.py#L328)) →
  GUID no aleatorio, tell trivial.
- Anuncia `SMB2_DIALECT_002` (Vista/2008-era) pero `SERVER_OS = "Windows Server
  2022"` ([app.py:49](../../sensors/smb-honeypot/app.py#L49), [327](../../sensors/smb-honeypot/app.py#L327))
  → `nmap --script smb2-capabilities` detecta la contradicción.

**Cambio:**
- `ServerGuid = os.urandom(16)` (una vez por arranque).
- Resolver la contradicción: **o** subir el dialecto anunciado a 2.1/3.0 si Impacket
  0.12 lo sirve de forma estable (probarlo), **o** bajar `SERVER_OS` por defecto a
  "Windows Server 2008 R2" para que case con SMB 2.0.2. Documentar cuál se eligió y
  por qué en el plan.
**Verificación:** `nmap -p445 --script smb2-capabilities,smb-os-discovery HOST` no
muestra incoherencia OS↔dialecto; GUID cambia entre reinicios.

### Tarea 2.3 — FTP: timestamps y tamaños coherentes
**Problemas:**
- Listado con fechas congeladas `Jan 1 00:00` / `Mar 15`
  ([app.py:65](../../sensors/ftp-honeypot/app.py#L65)).
- `SIZE` siempre `213 4096` ([app.py:437](../../sensors/ftp-honeypot/app.py#L437))
  aunque el listado declara 8192 y 512 para otros ficheros → inconsistencia.

**Cambio:**
- Generar el `FAKE_LISTING` con fechas relativas a "ahora" (últimos días/semanas).
- `SIZE <archivo>` devuelve el tamaño declarado en el listado para ese archivo;
  `550` si no existe. Mantener una sola fuente de verdad (un dict
  `{nombre: (size, mtime)}` en `identity.py`) que alimente listado **y** `SIZE`.
**Verificación:** `ftp` interactivo: `ls` muestra fechas recientes; `size
database_dump.sql` devuelve 8192, coherente con el listado.

### Tarea 2.4 — MySQL: identidad variable + interacción post-auth opcional
**Problemas:**
- `connection id` siempre `1` ([app.py:48](../../sensors/mysql-honeypot/app.py#L48))
  → dos conexiones con el mismo id es un tell.
- Responde `Access denied (using password: YES)` **aunque no haya password** y cierra
  de inmediato ([app.py:242-244](../../sensors/mysql-honeypot/app.py#L242)). Cero
  interacción post-handshake.

**Cambio:**
- `connection id` incremental/aleatorio por conexión.
- `using password: YES/NO` según si el auth-response venía vacío.
- **Modo `accept` opcional** (env `MYSQL_ACCEPT_AUTH`, default off para no cambiar
  comportamiento): si activo, mandar `OK` y entrar a un mini-bucle que responde a
  `SELECT @@version`, `SELECT @@version_comment`, `SHOW DATABASES`, `SELECT
  USER()` con datos señuelo coherentes con la marca, capturando **cada query** como
  evento `command`. Esto convierte el sensor de "solo credenciales" en uno que
  captura **intención** (dump, recon SQL, ransomware).
**Verificación:** con el modo off, comportamiento idéntico al actual. Con
`MYSQL_ACCEPT_AUTH=1`, `mysql -h HOST -u root -ptest -e "SELECT @@version"` devuelve
una versión señuelo y se registra un evento `command` con la query.

### Tarea 2.5 — Honeytokens por-IP reales (FTP y SMB)
**Problema:** el docstring del FTP promete "per-IP honeytokens"
([app.py:8](../../sensors/ftp-honeypot/app.py#L8)) pero `DECOY_FILES`
([76](../../sensors/ftp-honeypot/app.py#L76)) sirve contenido **estático e idéntico**
a todos. SMB igual: 5 decoys fijos para todos
([app.py:383](../../sensors/smb-honeypot/app.py#L383)). No se puede rastrear dónde
reaparecen las credenciales filtradas.

**Cambio:** al servir un decoy con credenciales (`.credentials`, `IT-Passwords`,
`VPN-Config`, `wp_config`), inyectar un **token único derivado de la IP+timestamp**
(p.ej. un usuario/host señuelo único) y emitir un evento `honeytoken.served` con el
token. Así, si ese token reaparece en otro sensor o en logins futuros, es trazable.
Documentar el formato del token para que el ingest-api lo pueda correlacionar (puede
ser trabajo de seguimiento; aquí basta con sembrarlo y emitir el evento).
**Verificación:** dos IPs distintas que descargan `.credentials` reciben tokens
distintos; cada descarga emite `honeytoken.served`.

### Tarea 2.6 — Port-honeypot: continuar la conversación
**Problema:** `handle_rdp`, `handle_mongodb`, `handle_httpish` leen **un solo
paquete y cierran** ([app.py:485-543](../../sensors/port-honeypot/app.py#L485)). Un
cliente con keep-alive HTTP o un pipeline de comandos no recibe respuesta a su
segundo mensaje → la interacción muere. (Redis sí itera, [462](../../sensors/port-honeypot/app.py#L462), es el modelo a copiar.)

**Cambio:** en `http.py` soportar keep-alive (leer-responder en bucle con
`Connection: keep-alive` y un cap de N requests/sesión). Evaluar lo mismo para
mongodb (responder a un segundo `OP_MSG`). Mantener el cap y los timeouts para no
abrir un vector de DoS.
**Verificación:** `curl --http1.1 http://HOST:9200/ http://HOST:9200/_cluster/health`
(dos requests, misma conexión) recibe **ambas** respuestas.

### Tarea 2.7 — Cowrie: coherencia final
Tras la Tarea 0.2, ajustar [cowrie.cfg](../../sensors/cowrie/cowrie.cfg) para que
`hostname`, kernel y banner SSH casen con la marca y el OS unificados del resto de la
flota. Verificar de punta a punta que un login SSH sigue funcionando y el `hostname`
del shell coincide con la fachada común.

---

---

## Estado de implementación (2026-06-26)

### Completado

| Tarea | Commit | Notas |
|-------|--------|-------|
| 0.2 Identidad unificada | — | `sensors/_shared/identity.env.example` creado. Hostname base `web-prod-01`, domain `corp.internal`, OS `Windows Server 2008 R2 Standard` para coherencia SMB. |
| 0.1 Plantilla ingest | — | `sensors/_shared/ingest.py.template`. Camino (A): cada sensor mantiene su propio `honeypot/ingest.py` derivado de esta plantilla. |
| 1.3 port-honeypot | — | `honeypot/{config,ingest,http_emulation,dispatch}.py` + `services/{vnc,rdp,redis,http,mongodb}.py`. `app.py` solo orquesta. Dockerfile `COPY . .`. |
| 1.1 ftp-honeypot | — | `honeypot/{config,ingest,identity,ftp}.py`. Dockerfile `COPY . .`. |
| 1.2 mysql-honeypot | — | `honeypot/{config,ingest,protocol}.py`. Dockerfile `COPY . .`. |
| 1.4 smb-honeypot | — | `honeypot/{config,ingest,identity,capture,impacket_patches}.py`. `app.py` solo `main()` + `_auth_callback`. Dockerfile `COPY . .`. |
| 1.5 web-honeypot | — | `honeypot/{ingest,sessions}.py`. `honeypot/catalog/{shared,api,config,dumps,seo}.py`. `response_catalog.py` reducido a ROUTE_TABLE + `get_response()`. |
| 2.1 Port: valores estáticos | — | Redis uptime dinámico (`_START_TIME`). ES `/_cat/indices` con fechas relativas a hoy/ayer. Docker `/info` con contadores con jitter y hostname/ID por proceso. |
| 2.2 SMB: ServerGuid + OS/dialecto | — | `_SERVER_GUID = os.urandom(16)` generado al arranque y pasado a `patch_smb2_negotiate()`. `SERVER_OS` ahora lee `SENSOR_OS` con default `"Windows Server 2008 R2 Standard"` — coherente con `SMB2_DIALECT_002`. Decisión: bajar OS para casar con dialecto 2.0.2 (Impacket 0.12 más estable así). |
| 2.3 FTP: timestamps y tamaños | — | `DECOY_CATALOG` dict único con `(size, mtime)`. Mtime relativo a hoy (`_rel_mtime`). `SIZE` devuelve tamaño del dict o `550`. |
| 2.4 MySQL: connection id + accept | — | `_next_conn_id()` incremental. `using password: YES/NO` según presencia de auth_response. `MYSQL_ACCEPT_AUTH=1` activa mini-bucle que responde `SELECT @@version`, `SHOW DATABASES`, etc. y emite evento `command`. |
| 2.5 Honeytokens per-IP | — | FTP: `_honeytoken(src_ip)` HMAC-SHA256, inyectado en `.credentials` y evento `honeytoken.served`. SMB: token en `IT-Passwords-TEMP.txt`; correlación downstream. |
| 2.6 Port: keep-alive HTTP | — | `handle_httpish` itera hasta `_MAX_KEEPALIVE_REQUESTS=10`. ES y Docker responden `Connection: keep-alive`. Otros puertos (panels) cierran tras la primera respuesta. |
| 2.7 Cowrie: coherencia | — | `cowrie.cfg` ya tenía `hostname = web-prod-01`. Añadido comentario de referencia a `identity.env.example`. SSH version, kernel y OS ya coherentes con fachada Ubuntu 22.04. |

### Pendiente

- Nada del alcance original. El plan está completo.

---

## Orden de ejecución recomendado

1. **0.2** (identidad unificada) — define la fachada que todo lo demás consume.
2. **0.1** (ingest común) — base estructural.
3. **1.3** (port-honeypot, 660 líneas) — el refactor más urgente.
4. **1.1, 1.2, 1.4, 1.5** — resto de reestructuraciones, en cualquier orden.
5. **2.1 → 2.7** — mejoras de realismo, por impacto.

Las mejoras de realismo de un sensor (Fase 2) **no se empiezan hasta que ese sensor
está reestructurado** (Fase 1), para no mezclar refactor y comportamiento.

## Criterios de listo

- Ningún sensor mantiene toda su lógica en un único `app.py`; cada uno es un paquete
  con responsabilidad única y ningún archivo de lógica > ~250 líneas.
- El cliente de ingest no está duplicado de forma divergente (idéntico vía plantilla,
  o compartido).
- La identidad de marca (hostname/dominio/OS/banners) es **coherente entre todos los
  sensores** del mismo host.
- `nmap` con scripts de fingerprint no muestra contradicciones obvias (OS↔dialecto
  SMB, GUID literal, uptime/fechas estáticas).
- Cada sensor reestructurado pasa su prueba de interacción real (curl/mysql/smbclient/
  redis-cli) **idéntica** a antes del refactor.
- Las mejoras de realismo no rompen la captura existente (uploads FTP/SMB, auth,
  eventos al dashboard).

## Verificación global

```bash
docker compose -f docker-compose.prod.single-host.yml config --quiet
docker compose up -d --build ftp-honeypot mysql-honeypot port-honeypot smb-honeypot web-honeypot
# luego las pruebas de interacción real listadas en cada tarea
```

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Refactor cambia comportamiento sin querer | una tarea = un commit; prueba de interacción real antes/después |
| Olvidar `COPY app.py .` → `COPY . .` y el contenedor arranca sin el paquete | checklist explícito en cada tarea de Fase 1 |
| Duplicación del ingest se vuelve a divergir | plantilla única + nota de "replicar en los 5" |
| `MYSQL_ACCEPT_AUTH`/keep-alive abren un vector de abuso | mantener caps de comandos/requests y timeouts existentes |
| Impacket 0.12 no sirve SMB 2.1/3.0 de forma estable | fallback: bajar `SERVER_OS` para casar con SMB 2.0.2 |

## Relación con otros planes

- [SENSOR_REMOTE_CONTROL.md](SENSOR_REMOTE_CONTROL.md) prevé `identity.rotate` con
  plantillas de identidad por sensor. La fachada de marca de la **Tarea 0.2** es el
  insumo natural de ese comando: una vez centralizada la identidad, rotarla
  remotamente es trivial. Coordinar ambos planes.
- [VECTOR_HOTRELOAD.md](VECTOR_HOTRELOAD.md) define el `install.sh` + `vector.toml`
  por sensor; al reestructurar no romper esa convención.
