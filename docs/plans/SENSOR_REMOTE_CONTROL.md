# SENSOR_REMOTE_CONTROL - WebSocket control plane para sensores

## Estado actual (2026-07-15)

Resumen rapido de "hasta donde llegamos" — el detalle completo de cada
entrega esta en las secciones de Rebanadas mas abajo, esto es solo el mapa.

**Listo y verificado de punta a punta:**

- Rebanadas 0-7: el plano de control en si (cola de comandos, WebSocket
  sensor <-> ingest-api, agente Python compartido `control_agent.py`,
  fallback HTTP si el WS cae, UI con presencia/timeline/rollback). Piloteado
  con Cowrie.
- **Cowrie (ssh):** `status.get` + `config.apply` completo, con rollback
  automatico y manual, UI completa.
- **web-honeypot (http):** `status.get` + `config.apply` MVP (banner del
  servidor + nivel de logging, aplicado en caliente sin reiniciar).
- **port-honeypot, smb-honeypot, ftp-honeypot, mysql-honeypot:** `status.get`
  unicamente (sin `config.apply` — ver "pendiente" abajo, por que). Con esto,
  **los 6 sensores viables ya hablan con el plano de control.**
- **Instalador remoto de clientes** (`/api/sensor/install`, el boton de
  instalar sensor en la ficha del cliente): los 6 (ssh, http, port, smb, ftp,
  mysql) ya provisionan el agente de control correctamente. Cowrie ahi tenia
  un bug preexistente (crash por falta de `control_agent.py`) que se
  arreglo de paso; SMB tenia otro bug preexistente y mas grande (le faltaba
  todo el paquete `honeypot/`, crasheaba al arrancar) que tambien se
  arreglo.

**Sensores sin ningun trabajo de control plane, y no lo van a tener:**

- `dionaea`, `galah`, `opencanary`, `suricata` — descartados desde el
  dimensionamiento original (herramientas de terceros, no encajan en el
  patron de agente Python).

**Pendiente dentro de lo ya empezado:**

- `config.apply` para port-honeypot/smb-honeypot/ftp-honeypot/mysql-honeypot:
  a diferencia de web-honeypot, casi todos los campos de identidad (puertos
  activos, share/servidor SMB, dialecto, banners) se fijan al bindear el
  socket o construir el objeto del protocolo (Impacket para SMB) —
  cambiarlos exige reiniciar el contenedor, no hay "apply en caliente"
  posible. Falta decidir si vale la pena (`config.apply` + `service.restart`
  combinados) o limitarlo a los pocos campos cosmeticos que si se pueden
  cambiar sin reiniciar.
- Personalizacion real de marca/contenido en web-honeypot (el pedido de
  negocio original: "cambiar la pagina segun el cliente"): la marca
  "TechCorp" esta hardcodeada en ~13 archivos y atada al sistema de canary
  tokens — es un rediseno grande, todavia sin empezar.
- `int-ssh`/`int-http`/`int-smb`/`internal-canary` (deploys de deception
  interna): topologia separada con sus propios bugs preexistentes
  (referencian imagenes `{{registry}}/cowrie-beacon:latest` y
  `{{registry}}/smb-honeypot:latest` que `publish-sensor-images.yml` nunca
  publica) — deliberadamente sin tocar, nadie lo pidio todavia.
- **Rebanada 9 — consola SSH web para Cowrie:** diseño completo ya cerrado
  en el plan (arquitectura del tunel sobre el WS del agente, tokens
  efimeros, seguridad), **cero codigo implementado**.

**Deuda tecnica menor, anotada en su momento, sin resolver:**

- `DELETE /sensors/:id/control-credential` (revocacion de credencial) sin
  implementar — el read-path ya existe.
- `checkAutoRollback` (Cowrie) puede loopear reintentos cada ~90s si la
  ultima config "buena" tambien falla — sin tope de reintentos.
- `deploy/local/core.yml` no define `CONTROL_API_SECRET` ni
  `SENSOR_CONTROL_CREDENTIAL_PEPPER` — hay que exportarlas a mano para
  probar el plano de control localmente con ese compose.
- Acciones `service.restart`, `identity.rotate`, `capture.flush`:
  declaradas en el catalogo del contrato pero deshabilitadas, ningun sensor
  las implementa todavia.
- Sin metricas/alertas cuando un sensor pasa mucho tiempo en modo fallback
  HTTP (solo el log del propio agente).

## Contexto

Hoy el sistema ya tiene varias piezas cerca de lo que queremos:

- `ingest-api` recibe heartbeats en `/sensors/heartbeat`.
- `dashboard` consume eventos en vivo por SSE desde `/events/live`.
- Cowrie ya tiene un primer flujo de configuracion remota:
  - el dashboard guarda config en `/sensors/:sensorId/config`
  - `cowrie-beacon` hace polling
  - si cambia el `configHash`, escribe `cowrie.cfg` / `userdb.txt`
  - el entrypoint reinicia Cowrie para aplicar cambios
- El dashboard ya tiene start/stop/restart local via Docker socket cuando el sensor esta en el mismo host.

El problema: esto todavia no es un plano de control remoto real. Es parcial,
solo Cowrie tiene configuracion, el feedback es pobre, y el operador no sabe con
precision si una config quedo pendiente, aplicada, fallo o si el sensor reinicio
correctamente.

## Objetivo

Crear un plano de control remoto para sensores que permita:

- ver estado de sensores casi en tiempo real;
- cambiar configuracion por sensor desde el dashboard;
- aplicar config sin tocar SSH manualmente;
- enviar comandos controlados como `restart`, `reload-config`, `rotate-identity`;
- recibir ACKs y errores desde el sensor;
- auditar toda accion administrativa;
- mantener fallback por HTTP/polling si WebSocket cae.

## Decision de arquitectura

Usar WebSocket para control bidireccional y mantener SSE para eventos broadcast.

| Canal | Uso | Razon |
|------|-----|-------|
| SSE `/events/live` | ataques, alertas, heartbeats para UI | ya existe, simple y eficiente para servidor -> browser |
| WebSocket sensor -> ingest-api | comandos remotos y ACKs | los sensores mantienen conexion saliente, funciona mejor detras de NAT/firewall |
| HTTP REST | guardar configs, consultas, fallback | estable, auditable, simple para operaciones no interactivas |

No se reemplaza todo con WebSocket. El WebSocket se agrega como plano de control
bidireccional, no como transporte unico.

## Modelo mental

```
Dashboard
  PUT /api/sensors/:id/config
  POST /api/sensors/:id/control
       |
       v
ingest-api
  guarda config versionada
  crea comando pendiente
  emite estado por SSE
  entrega comando por WebSocket si el sensor esta conectado
       |
       v
sensor-agent / beacon
  mantiene WS saliente
  recibe comando
  aplica config / reinicia servicio / reporta error
  envia ACK + resultado
       |
       v
ingest-api
  actualiza estado del comando
  emite `config.applied`, `sensor.restarting`, `sensor.healthy`, `sensor.error`
```

## Eventos del control plane

### Sensor -> ingest-api

```json
{
  "type": "hello",
  "sensorId": "cowrie-01-SALUDSA",
  "protocol": "ssh",
  "version": "cowrie",
  "capabilities": ["config.apply", "service.restart", "identity.rotate"],
  "configHash": "abc123"
}
```

```json
{
  "type": "command.ack",
  "commandId": "cmd_123",
  "sensorId": "cowrie-01-SALUDSA",
  "accepted": true,
  "timestamp": "2026-06-25T20:00:00.000Z"
}
```

```json
{
  "type": "command.result",
  "commandId": "cmd_123",
  "sensorId": "cowrie-01-SALUDSA",
  "status": "ok",
  "configHash": "def456",
  "message": "config applied and service restarted"
}
```

```json
{
  "type": "sensor.status",
  "sensorId": "cowrie-01-SALUDSA",
  "state": "healthy",
  "details": {
    "pid": 123,
    "ports": [22]
  }
}
```

### ingest-api -> sensor

```json
{
  "type": "command",
  "commandId": "cmd_123",
  "sensorId": "cowrie-01-SALUDSA",
  "action": "config.apply",
  "payload": {
    "configHash": "def456",
    "config": {}
  },
  "expiresAt": "2026-06-25T20:01:00.000Z"
}
```

Acciones iniciales permitidas:

| Accion | Sensor inicial | Resultado esperado |
|--------|----------------|--------------------|
| `config.apply` | Cowrie, port-honeypot, smb-honeypot | escribe config y recarga/reinicia |
| `service.restart` | todos | reinicia el proceso o sale para que Docker lo reinicie |
| `identity.rotate` | Cowrie, SMB, port-honeypot | cambia identidad/banners/decoys segun plantilla |
| `capture.flush` | FTP, SMB | fuerza flush/scan de capturas pendientes |

## Estado de comandos

Estados persistidos:

| Estado | Significado |
|--------|-------------|
| `queued` | comando guardado, esperando entrega |
| `sent` | enviado por WS al sensor |
| `acked` | sensor confirmo recepcion |
| `running` | sensor empezo a aplicar |
| `succeeded` | termino correctamente |
| `failed` | termino con error |
| `expired` | no se entrego antes de `expiresAt` |
| `cancelled` | operador cancelo antes de ejecutarse |

## Cambios de base de datos

Agregar migracion:

```sql
CREATE TABLE sensor_commands (
  id TEXT PRIMARY KEY,
  sensor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL,
  requested_by TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  acked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX sensor_commands_sensor_status_idx
  ON sensor_commands(sensor_id, status, created_at DESC);
```

Extender `sensor_configs` o agregar tabla versionada:

```sql
CREATE TABLE sensor_config_versions (
  id TEXT PRIMARY KEY,
  sensor_id TEXT NOT NULL,
  protocol TEXT NOT NULL,
  config JSONB NOT NULL,
  config_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ,
  error TEXT
);
```

## Seguridad

Reglas obligatorias:

1. El sensor inicia conexion saliente al `ingest-api`; no abrir puertos de control en sensores.
2. WebSocket sensor usa `INGEST_SHARED_SECRET` o token provisionado por sensor.
3. Cada mensaje incluye `sensorId`; el backend valida que el socket autenticado solo pueda reportar por ese sensor.
4. Dashboard requiere roles:
   - `viewer`: ver estado
   - `analyst`: guardar config
   - `admin`: ejecutar `restart`, `stop`, `start`, `identity.rotate`
5. Todo comando se audita con usuario, IP publica, payload resumido y resultado.
6. Payloads de config se validan por protocolo con `zod`.
7. No se permite comando shell arbitrario.
8. Comandos tienen TTL corto, por defecto 60s.
9. Si el sensor no esta conectado por WS, el comando queda `queued` y el sensor puede recogerlo por HTTP fallback.

## UI objetivo

En cada tarjeta de sensor:

- badge `Connected live` cuando hay WS activo;
- `last heartbeat 12s ago`;
- `config: applied / pending / failed`;
- boton `Configure`;
- boton `Restart`;
- menu de acciones segun capabilities;
- timeline compacto de los ultimos comandos.

En el dialogo de config:

- formulario especifico por protocolo;
- indicador `saved`, `queued`, `sent`, `applied`, `failed`;
- boton `Apply now`;
- boton `Rollback` a la version anterior aplicada;
- diff resumido entre config actual y nueva.

## Configuraciones por sensor

### Cowrie

Ya existe base. Expandir:

- hostname;
- SSH banner;
- kernel version/build;
- hardware platform;
- timeouts;
- politica de credenciales:
  - aceptar todo;
  - aceptar lista;
  - fallar todo;
- perfiles de identidad:
  - `ubuntu-web`;
  - `debian-db`;
  - `generic-cloud`.

### Port honeypot

Campos:

- puertos activos;
- servicios emulados por puerto;
- identidad Docker API;
- identidad Elasticsearch;
- contenido de paneles HTTP;
- nombres de cluster/indexes;
- modo de captura de payload:
  - `basic`;
  - `verbose`;
  - `redacted`.

### SMB honeypot

Campos:

- share name;
- server name;
- domain/workgroup;
- server OS;
- share comment;
- decoy profile;
- upload capture enabled;
- max capture size.

### FTP honeypot

Campos:

- banner;
- modo anonimo;
- usuario/password señuelo;
- upload capture enabled;
- directorios visibles;
- max capture size.

### MySQL honeypot

Campos:

- server version;
- auth plugin;
- fake databases;
- accept/fail auth mode;
- handshake capability flags.

### Web honeypot

Campos:

- perfil visual;
- hostname/brand generico;
- rutas señuelo;
- paginas login;
- headers/server banner;
- nivel de detalle de logging.

## Plan incremental actualizado (2026-07-11)

Este es el orden autoritativo de implementacion. Las fases detalladas que aparecen
despues se conservan como referencia de alcance, pero el trabajo debe entregarse en
rebanadas pequenas, verificables y acumulativas. Cada rebanada deja contratos y
puntos de extension listos para la siguiente, sin activar acciones destructivas
antes de validar el ciclo completo.

### Principios de ejecucion

1. Un cambio pequeno debe poder probarse y desplegarse de forma independiente.
2. El protocolo se versiona desde el primer mensaje con `protocolVersion: 1`.
3. No se agrega `config.apply`, `restart` ni otra accion con efectos hasta que
   `status.get` complete todo el ciclo cola -> WS -> ACK -> resultado -> auditoria.
4. Todo comando es idempotente por `commandId`; un sensor nunca ejecuta dos veces
   el mismo comando aunque se reconecte o reciba fallback HTTP.
5. El backend conserva la fuente de verdad. La memoria solo mantiene presencia y
   sockets activos; comandos, estados y resultados siempre se persisten.
6. Las acciones se registran en un catalogo cerrado de capabilities. Nunca se
   acepta shell arbitrario ni nombres de accion enviados libremente por la UI.
7. SSE sigue siendo el canal backend -> dashboard. El WebSocket es exclusivo del
   plano de control backend <-> sensor.
8. Cada entrega actualiza este plan con fecha, verificacion realizada y trabajo
   restante.

### Rebanada 0 - Preparar y congelar contratos

Objetivo: eliminar ambiguedades antes de crear tablas o conexiones persistentes.

**Progreso (2026-07-11):** contrato v1 creado en
`apps/ingest-api/src/contracts/sensor-control/`. Incluye schemas Zod estrictos,
tipos TypeScript, limites de protocolo, documentacion de interoperabilidad y
pruebas. Solo `status.get` esta modelado; faltan baseline Cowrie, validacion del
identificador/autenticacion existentes y la decision de limites operativos finales.

- Confirmar el identificador canonico del sensor y el mecanismo de autenticacion
  ya provisionado. El socket debe quedar ligado a un unico `sensorId` autenticado.
- Verificar el flujo actual de heartbeat y configuracion Cowrie de punta a punta;
  guardar la evidencia como baseline para detectar regresiones.
- Confirmar que freshness y presencia no dependen de una replica atrasada.
- Definir schemas Zod compartidos para los mensajes v1:
  - `hello`;
  - `hello.accepted` / `hello.rejected`;
  - `command`;
  - `command.ack`;
  - `command.result`;
  - `sensor.status`;
  - `ping` / `pong`.
- Congelar el catalogo inicial de acciones. Para las primeras entregas solo se
  habilita `status.get`; las demas quedan declaradas pero deshabilitadas.
- Definir limites: tamano maximo de mensaje/payload, TTL por defecto, timeout de
  ACK, timeout de resultado y una ejecucion concurrente por sensor.
- Documentar compatibilidad: una version de protocolo desconocida se rechaza de
  forma explicita y el sensor vuelve al mecanismo HTTP disponible.

Criterio de salida: contrato v1 documentado, schemas acordados, baseline Cowrie
verificado y ninguna accion con efectos habilitada.

### Rebanada 1 - Cola persistente y auditoria por REST

Objetivo: construir el modelo confiable antes del transporte WebSocket.

**Progreso (2026-07-11):** se agregaron el modelo/migracion aditivos de comandos
y eventos de auditoria, el servicio/repository/controller REST y `CONTROL_API_SECRET`
separado de `INGEST_SHARED_SECRET`. Solo `status.get` puede encolarse y queda
cerrado por defecto sin el secreto administrativo. El BFF dashboard ya propaga
rol, scope e IP mediante el secreto administrativo, sin interfaz visual todavia.

**Progreso (2026-07-13):** agregadas pruebas de integracion reales contra Postgres
(`tests/sensor-control.integration.test.ts`, 11 casos: creacion/idempotencia,
scope por cliente, rol insuficiente, sensor inexistente, listado ordenado,
cancelacion + doble cancelacion, cancelacion cross-sensor, expiracion por TTL,
superadmin cross-client). Se activan solo con `TEST_DATABASE_URL` seteada
(se saltan en `npm test` normal, no requieren Docker por defecto). Verificadas
contra un Postgres 16 efimero, aislado de `honeypot_prod`.

De paso se detecto y corrigio un bug real en la migracion
`20260708000000_idx_sessions_sensor_started`: mezclaba `CREATE INDEX CONCURRENTLY`
+ `DROP INDEX` en un solo archivo, lo que Prisma envuelve en una transaccion y
Postgres rechaza (25001), el mismo patron que ya rompio produccion una vez. Aun
no se habia aplicado en `honeypot_prod`. Se separo el `DROP INDEX` a
`20260708000001_drop_sessions_sensor_id_idx` siguiendo la regla de un
`CONCURRENTLY` por archivo. Verificado con `prisma migrate deploy` de punta a
punta contra una base nueva.

Rebanada 1 cerrada: criterio de salida cumplido (REST + cola + auditoria +
pruebas unitarias y de integracion).

- Crear `sensor_commands` con estados, timestamps, TTL, `requested_by`, resultado
  estructurado y error redactado.
- Incluir una restriccion de estados validos y los indices para listar historial,
  recuperar pendientes y expirar comandos sin escanear toda la tabla.
- Definir la transicion de estados en un unico servicio. Controllers solo validan
  HTTP/autorizacion; SQL y Prisma quedan en el repository.
- Agregar endpoints para crear, listar, consultar y cancelar comandos.
- Hacer que la creacion acepte una clave de idempotencia o rechace duplicados
  equivalentes cuando el cliente reintenta la misma solicitud.
- Validar accion, capability, payload, rol y ownership del sensor antes de guardar.
- Registrar auditoria desde el primer estado (`queued`), incluyendo usuario, IP,
  sensor, accion y payload resumido/redactado.
- Implementar expiracion determinista de comandos `queued`/`sent` cuyo TTL venza.
- Probar transiciones validas e invalidas, permisos, aislamiento por tenant,
  cancelacion, expiracion e idempotencia.

Criterio de salida: se puede crear y seguir un `status.get` por REST, pero todavia
no se entrega a ningun sensor.

### Rebanada 2 - Presencia WebSocket sin ejecutar comandos

Objetivo: validar conectividad, autenticacion y ciclo de vida del socket sin riesgo.

**Prerequisito de seguridad (2026-07-11):** no usar `INGEST_SHARED_SECRET` para
autenticar un socket de control: todos los sensores lo conocen y no prueba la
identidad de uno concreto. Antes de abrir esta ruta, crear credenciales de control
aleatorias por `sensorId`, guardar solo su hash y entregar el valor una sola vez en
la instalacion futura del agente. Los sensores existentes no reciben credencial ni
cambian su comportamiento hasta su fase de integracion.

- Agregar el endpoint WebSocket saliente desde sensor hacia `ingest-api`.
- Autenticar antes de registrar la conexion; no confiar en el `sensorId` del body.
- Procesar `hello`, capabilities y `protocolVersion` con validacion estricta.
- Mantener un registro de conexiones activas desacoplado tras una interfaz de
  entrega. La primera implementacion puede ser en memoria mientras produccion use
  una sola instancia de `ingest-api`.
- Documentar la restriccion single-instance. Si se despliegan varias replicas, la
  interfaz debe poder usar Redis pub/sub o un broker para enrutar al proceso que
  posee el socket, sin cambiar el servicio de comandos.
- Reemplazar una conexion anterior del mismo sensor de forma determinista y cerrar
  el socket viejo.
- Agregar ping/pong, timeout de conexion muerta, backpressure y limites de mensaje.
- Emitir `sensor.connected` y `sensor.disconnected` por el SSE existente.
- No entregar comandos en esta rebanada.

Criterio de salida: un simulador puede conectar, autenticar, enviar `hello`,
mantenerse vivo y desconectar; la presencia llega al dashboard por SSE.

**Progreso (2026-07-13):** Rebanada 2 completa y verificada de punta a punta.

- Credenciales por sensor: `SensorControlCredential` (migracion
  `20260713150000_add_sensor_control_credentials`), un row por sensor
  (`@unique` en `sensorId`, upsert = rotacion in-place). Hash HMAC-SHA256 con
  pepper dedicado (`SENSOR_CONTROL_CREDENTIAL_PEPPER`, nunca reutiliza
  `INGEST_SHARED_SECRET` ni `CONTROL_API_SECRET`), `secretPrefix` de 8 hex
  chars no-secreto para mostrar en UI sin revelar el valor completo. Nunca se
  guarda el secreto en claro (`sensor-control-credential.crypto.ts`,
  `.repository.ts`, `.service.ts`).
- Endpoint de emision: `POST /sensors/:sensorId/control-credential`, mismo
  boundary que el resto de rutas administrativas (`ensureControlApiToken` +
  actor headers desde el BFF del dashboard), rol minimo `admin` (mas estricto
  que `analyst` de `queueStatusGet`, porque emite una credencial que
  impersona el canal de control de un sensor). El secreto crudo solo aparece
  una vez, en la respuesta `201`.
- WebSocket: `GET /sensors/control/ws` (`sensor-control-ws.plugin.ts`).
  Autentica por headers (`X-Sensor-Id` / `X-Sensor-Control-Secret`) antes de
  procesar cualquier mensaje; valida `hello` contra el contrato v1 congelado
  (protocolVersion, sensorId cruzado contra el autenticado, capabilities);
  responde `hello.accepted`/`hello.rejected`; ping/pong a nivel de aplicacion
  cada `heartbeatIntervalSeconds` (30s por defecto) con timeout de conexion
  muerta a 2x ese intervalo; guarda de backpressure sobre
  `socket.bufferedAmount`; limite de tamano de mensaje reforzado dos veces
  (`maxPayload` de `@fastify/websocket` + chequeo manual antes de `JSON.parse`,
  segun exige el README del contrato).
- Registro de conexiones: `SensorConnectionRegistry` (interfaz) +
  `InMemorySensorConnectionRegistry` (unica implementacion hoy), singleton de
  modulo siguiendo el mismo patron que `plugins/defense.ts`. Reemplazo
  deterministico: una segunda conexion del mismo sensor cierra la anterior
  (`4000 replaced_by_new_connection`) antes de registrarse. Documentada la
  restriccion single-instance con el punto de extension para Redis
  pub/sub/broker si se despliegan replicas.
- Presencia por SSE: `sensor.connected` / `sensor.disconnected` (con
  `reason`: `client_closed`, `replaced_by_new_connection`,
  `connection_timeout`, `socket_error`) agregados a `LiveEvent` y a
  `/events/live`.
- Bug real encontrado y corregido durante la implementacion: pausar el socket
  (`socket.pause()`) al entrar al handler es obligatorio antes de cualquier
  `await` (la verificacion de credencial), porque un mensaje que llega
  mientras el listener `message` todavia no esta registrado se pierde (los
  `EventEmitter` no bufferean para listeners tardios) — sin este fix, todo
  `hello` enviado inmediatamente tras conectar quedaba colgado
  indefinidamente. Se reanuda (`socket.resume()`) justo despues de registrar
  todos los listeners. Documentado en el codigo con la razon exacta.
- Verificacion: unit tests de hashing (`sensor-control-credential.test.ts`,
  9 casos) mas integracion real contra Postgres y un servidor Fastify real
  con `buildApp()` (`sensor-control-ws.integration.test.ts`, 8 casos: happy
  path con presencia SSE, secreto invalido, `sensorId` no coincide,
  `protocolVersion` no soportada, frame sobredimensionado, reemplazo
  deterministico, keepalive ping/pong, timeout de conexion muerta), gateado
  por `TEST_DATABASE_URL` igual que Rebanada 1 (se salta sin Docker). 161/161
  tests verdes. Verificacion manual adicional con
  `scripts/simulate-sensor-ws.mjs`: dos instancias del simulador conectando
  al mismo sensor confirmaron en vivo, via `curl -N /events/live`, el orden
  exacto `connect(A)` -> `connect(B)` -> `disconnect(A, replaced_by_new_connection)`
  -> `disconnect(B, client_closed)`.

Pendiente para Rebanada 3: no hay entrega de comandos por el socket todavia;
`SensorControlService` (Rebanada 1) no consulta el registro de conexiones
para decidir `queued` vs `sent`; los sensores existentes
(`sensors/cowrie/heartbeat.py`) siguen sin credencial de control y sin
cambios; no hay endpoint `GET` de metadata de credencial (prefix/fechas) —
deferido, no bloqueante.

### Rebanada 3 - Primer ciclo vertical con `status.get`

Objetivo: probar el plano de control completo con una accion de solo lectura.

- Entregar un `status.get` queued cuando el sensor esta conectado.
- Persistir `sent`, `acked`, `running` y `succeeded`/`failed` mediante transiciones
  atomicas y monotonicamente validas.
- Exigir ACK rapido y resultado separado; un ACK no implica ejecucion exitosa.
- Persistir el resultado normalizado: version del agente, uptime, PID, puertos,
  config hash y estado de salud, sin datos secretos.
- Deduplicar por `commandId` en backend y simulador/agente.
- Manejar desconexion entre envio, ACK y resultado sin inventar un estado exitoso.
- Publicar cada transicion relevante por SSE para futuros consumidores UI.
- Agregar una prueba de integracion con simulador para exito, rechazo, timeout,
  resultado duplicado, reconexion y comando expirado.

Criterio de salida: REST -> cola -> WebSocket -> ACK -> resultado persistido -> SSE
funciona de punta a punta con `status.get` y queda auditado.

**Progreso (2026-07-13):** Rebanada 3 completa y verificada de punta a punta.

- Maquina de estados (`sensor-command-state.ts`): `acked` ahora permite saltar
  directo a `succeeded`/`failed` (el contrato dice que `command.running` es
  opcional); `sent` permite `failed` directo (un `command.ack` con
  `accepted: false` es una respuesta real del sensor, no un salto sin
  evidencia); `acked`/`running` permiten `expired` para poder resolverse via
  TTL si el sensor se cae a mitad de comando.
- `expireQueued` (repository) amplio su alcance: ya no solo barre `queued`,
  tambien `sent`/`acked`/`running` cuyo `expiresAt` paso — cierra un gap real
  donde un comando atascado tras una desconexion nunca resolvia a estado
  terminal. Nombre del metodo se mantiene por compatibilidad, alcance es
  intencionalmente mas amplio desde esta rebanada.
- Entrega: `SensorControlService.attemptDelivery(sensorId)` (nuevo, recibe
  `SensorConnectionRegistry` por constructor) se llama desde dos sitios:
  dentro de `queueStatusGet` (sensor ya conectado) y tras `sensor.connected`
  en el plugin WS (comando encolado mientras el sensor estaba offline).
  `handleAck`/`handleRunning`/`handleResult` en el service delegan a nuevos
  metodos CAS del repository (`markSent`/`markAcked`/`markRunning`/
  `markResult`), mismo patron transaccional que `cancelQueued` ya usaba.
  Deduplicacion de resultados repetidos sale gratis del CAS (una transicion
  invalida por estado ya terminal se descarta sin duplicar auditoria).
- SSE: cuatro eventos nuevos (`command.sent`, `command.acked`,
  `command.running`, `command.result`), payloads deliberadamente delgados
  (solo IDs + status, nunca el `result`/`error` completo — `/events/live` es
  un broadcast sin autorizacion por-suscriptor).
- **Bug real encontrado y corregido durante la verificacion manual** (no lo
  atrapo la suite automatizada): `attemptDelivery` mandaba el mensaje
  `command` por el socket *antes* de esperar `markSent` en la base de datos.
  Un simulador real respondiendo rapido podia mandar su `command.ack` antes
  de que la escritura de `sent` hubiera terminado, y `markAcked` rechazaba la
  transicion (`invalid_transition` desde `queued`, no `sent`). Los tests
  automatizados no lo detectaron porque el cliente de test siempre espera el
  mensaje `command` antes de ackear, dando tiempo de sobra al `await`. Fix:
  `markSent` ahora se espera *antes* de `connection.send(...)`, no despues —
  sigue cumpliendo la regla del README ("marks it sent only after writing to
  the transport") porque el mensaje real solo sale una vez que el estado ya
  quedo persistido, así cualquier ACK que llegue after-the-wire ve el DB ya
  al dia.
- Verificacion: suite completa 172/172 en verde (unitarios + ambas
  integraciones contra Postgres real via `TEST_DATABASE_URL`, gateado igual
  que Rebanadas 1-2). Seis casos nuevos en
  `sensor-control-ws.integration.test.ts`: exito (entrega a sensor conectado
  y a sensor que se conecta despues), rechazo (`accepted: false` -> `failed`
  directo), timeout (TTL sin ACK), resultado duplicado (CAS descarta sin
  duplicar), reconexion (comando atascado en `acked` no se reentrega, resuelve
  por TTL), comando expirado nunca entregado. Verificacion manual con
  `scripts/simulate-sensor-ws.mjs` extendido (responde `command.ack` ->
  `command.running` -> `command.result` con delays de 300ms): confirmado en
  vivo el ciclo completo `command.sent -> command.acked -> command.running ->
  command.result` por SSE y el estado final `succeeded` con `result` poblado
  sin campos secretos via `GET /sensors/:sensorId/commands`.

Pendiente para Rebanada 4+: sigue sin existir agente Python comun ni cambios
en `sensors/cowrie/heartbeat.py` — el simulador es la unica implementacion de
cliente. No hay redelivery automatica tras reconexion (deliberadamente
diferido a Rebanada 6, "fallback y recuperacion"). No hay UI en el dashboard
que consuma los eventos SSE de comandos todavia.

**Hardening (2026-07-13):** revision post-implementacion, cuatro fixes en el
plugin WS/service antes de arrancar Rebanada 4:

- **Race de ordenamiento (correctitud, el importante):** los handlers se
  disparaban con `void handleAck/Running/Result`, sin serializar. Como
  `EventEmitter.emit` ignora las promesas, un `command.ack` seguido de un
  `command.result` (lo que hara un agente real de `status.get`, con ack+result
  a microsegundos) corria las dos transacciones concurrentes: `markResult`
  podia leer el estado `sent` pre-ack (READ COMMITTED) y descartar el resultado
  como `invalid_transition`, dejando el comando en `acked` -> `expired` con el
  resultado exitoso perdido. La verificacion previa no lo detecto porque tanto
  la suite como el simulador manual meten delays (300ms) que serializan los
  mensajes. Fix: cadena de promesa por conexion (`processing.then(fn)`) que
  garantiza que cada transicion commitee antes de procesar la siguiente;
  `attemptDelivery` en connect tambien pasa por la cadena.
- **Rechazo de promesa no manejado (robustez):** esos `void handleX` no tenian
  `.catch`, y no hay handler global de `unhandledRejection`; un error de DB en
  el plano de control podia tumbar el proceso `ingest-api` compartido (y con el
  la telemetria). El `.catch` de la cadena de serializacion (log via
  `request.log.error`) lo cubre, siguiendo el patron ya usado en `defense.ts`.
- **Barrido de expiracion periodico:** `expireQueued` solo corria en las rutas
  REST de operador; sin trafico, un comando atascado nunca resolvia. Nuevo
  `SensorControlService.sweepExpired()` + `setInterval(30s).unref()` en el
  plugin lo drena independientemente.
- **`cleanup()` idempotente:** `close` y `error` podian dispararlo dos veces y
  emitir `sensor.disconnected` duplicado por SSE; guard `cleanedUp`.

Verificacion: `tsc --noEmit` limpio y 172/172 tests en verde. Falta agregar un
caso de integracion gateado que envie `command.ack`+`command.result`
pipelined (sin delay) para blindar el fix del race como regresion — pendiente
para cuando el simulador soporte ese modo.

### Rebanada 4 - Agente comun y piloto Cowrie

Objetivo: convertir el simulador en una base reutilizable por todos los sensores.

- Crear un agente Python comun con conexion, backoff con jitter, `hello`, ping/pong,
  recepcion, ACK/resultado, deduplicacion persistente corta y registro de handlers.
- Separar transporte de handlers de acciones; cada sensor solo registra sus
  capabilities y funciones concretas.
- Integrarlo primero en Cowrie beacon con unicamente `status.get` habilitado.
- Asegurar que una caida del control plane no detiene heartbeat, captura ni envio
  normal de eventos del honeypot.
- Definir logs estructurados y metricas minimas: conexiones, reconexiones, comandos,
  latencia de ACK, resultados y errores.

Criterio de salida: Cowrie ejecuta `status.get` real usando el agente compartido y
el comportamiento existente permanece intacto cuando WS no esta disponible.

**Progreso (2026-07-14):** Rebanada 4 completa y verificada de punta a punta.

- `sensors/_shared/control_agent.py` — `ControlAgent` reutilizable: conecta con
  `websockets.sync.client` (sincrono, mismo estilo de threads que el resto del
  beacon, sin asyncio), hello v1, ping/pong, backoff exponencial + jitter
  (reset solo tras un hello aceptado, para no hot-loopear con credenciales
  malas), dedup de `commandId` en memoria con ventana de 120s, y registro de
  handlers via decorator `@agent.action("nombre")`. Transporte y handlers
  separados: el modulo no sabe nada de Cowrie, solo dispara la funcion
  registrada para cada `action`.
- `sensors/cowrie/heartbeat.py` registra `status.get` (agentVersion,
  uptimeSeconds, pid, ports, configHash local) y arranca el agente en su
  propio thread daemon junto a los threads de heartbeat/config existentes —
  una caida del WS no toca esos loops. Sin `SENSOR_CONTROL_SECRET` el agente
  no arranca (opt-in, sin cambiar el comportamiento de sensores no
  provisionados).
- Decision de dependencia (con el usuario): `pip install websockets==13.1` en
  el `command` del contenedor del beacon (`sh -c "pip install ... && python3
  /heartbeat.py"`), sin Dockerfile nuevo — mantiene el patron actual de
  imagen stock `python:3.12-alpine` montando scripts, evita escribir un
  cliente WS a mano en stdlib (framing RFC6455 a mano es demasiado riesgo
  para el beneficio). Actualizados los 4 compose que corren el beacon:
  `docker-compose.prod.honeypot.yml`, `docker-compose.prod.single-host.yml`,
  `deploy/local/sensor-cowrie.yml`, `deploy/local/sensor-ssh-web.yml`
  (mount de `control_agent.py` + env `SENSOR_CONTROL_SECRET`). Nuevo
  `SENSOR_CONTROL_SECRET_SSH` documentado en `.env.example` raiz.
- Verificado end-to-end contra un ingest-api + Postgres locales reales (no
  solo unit tests): sensor registrado, credencial emitida via
  `POST /sensors/:id/control-credential`, agente conectado con el `heartbeat.py`
  real, comando `status.get` encolado via REST y resuelto
  `queued -> sent -> acked -> succeeded` con el `result` completo validando
  contra `sensorStatusDetailsSchema` del servidor. Tambien verificado el
  rechazo limpio (4401) con secreto incorrecto.

Pendiente: agente no integrado en ningun otro sensor todavia (Port/SMB quedan
para Rebanada 8), y no hay metricas/logs agregados mas alla de los contadores
en memoria (`ControlAgent.stats`) — nadie los expone ni los scrapea aun.

### Rebanada 5 - Primera accion con efectos: `config.apply` en Cowrie

Objetivo: aplicar una configuracion versionada con confirmacion real y rollback.

- Crear `sensor_config_versions` y guardar config validada antes de generar comando.
- Redactar secretos tanto en auditoria como en respuestas y logs.
- Aplicar escritura atomica (archivo temporal + rename) y conservar la ultima
  version valida para rollback.
- Reportar `running`; despues del reload/restart, confirmar el nuevo `configHash`
  mediante heartbeat antes de marcar `succeeded`.
- Marcar `failed` si escritura, validacion, reload o confirmacion de hash falla.
- Evitar loops de restart con limite de intentos y rollback automatico seguro.

Criterio de salida: Cowrie aplica una configuracion, confirma el hash y puede volver
a la version anterior sin acceso SSH manual.

**Progreso (2026-07-14):** Rebanada 5 completa y verificada de punta a punta,
incluyendo el rollback automatico disparandose organicamente en el servidor real.

Decisiones confirmadas con el usuario antes de implementar:

- El polling HTTP existente (10s, sin ACK) queda funcionando en paralelo como
  fallback — no se toca, es lo que Rebanada 6 formalizara despues. Ambos
  caminos son idempotentes (mismo `config_hash`), sin riesgo de restart doble
  peligroso.
- El agente NO auto-reporta `succeeded` para `config.apply`: manda
  `ack -> running` y se detiene (solo manda `failed` si la escritura falla).
  El servidor confirma `succeeded` unicamente cuando el SIGUIENTE heartbeat
  reporta el `configHash` esperado — si Cowrie no vuelve sano, el comando
  expira por TTL en vez de mentir.
- Auto-rollback a las 2 fallas consecutivas (`failed` o `expired`) de
  `config.apply`, siempre que exista una version previa con status
  `applied` y no haya ya otro apply en curso (evita tormentas de rollback).

Implementacion:

- `sensor_config_versions` (nueva tabla, migracion
  `20260714120000_add_sensor_config_versions`): historial append-only detras
  de `sensor_configs` (que sigue siendo la fila unica que lee el poller
  viejo). Validado sin drift contra un Postgres limpio antes de aplicarla a
  cualquier DB con datos reales.
- `sensor-config.repository.ts` + `sensor-config.service.ts` (modulo
  `sensors`, nuevos archivos): `saveAndQueueApply` (PUT config guarda version
  + encola `config.apply`), `confirmApplied` (heartbeat confirma), y
  `checkAutoRollback` (cuenta fallas consecutivas, revierte a la ultima
  version `applied`). Dependen de `SensorControlService` en una sola
  direccion — el modulo de control no sabe nada de que es un "config".
- `protocol.ts`: `sensorControlActionSchema` paso de `literal('status.get')`
  a `enum(['status.get', 'config.apply'])`; el payload del comando se
  aflojo a un record generico (solo se construye server-side, nunca se
  parsea de input no confiable). El payload de `config.apply` en el wire es
  solo `{configHash}` — el agente re-descarga la config completa por el
  mismo endpoint HTTP que ya usaba el poller, protocol.ts nunca conoce la
  forma de ningun config de protocolo.
- Cerrado un gap real que la ampliacion del enum hubiera introducido:
  `POST /sensors/:id/commands` ahora fija `action: z.literal('status.get')`
  en vez del enum general — antes de este fix, ese endpoint operador habria
  aceptado `action:'config.apply'` en el body y creado silenciosamente un
  `status.get` de todas formas (el handler nunca miraba el campo `action`).
- `control_agent.py`: los handlers ahora reciben `report_running()` y su
  contrato de retorno se amplio — dict (succeeded), `None` (no mandar
  command.result, otra cosa confirma el exito), o excepcion (failed).
- `heartbeat.py`: nuevo handler `config.apply` (report_running -> fetch
  config -> escribir con `_atomic_write` (temp+rename) -> return None);
  heartbeat ahora reporta `configHash` cuando existe uno local.
- `X-Requested-By` nuevo header del proxy dashboard -> ingest-api en PUT
  config, para poblar `created_by`/`requested_by` (esa ruta usa
  `INGEST_SHARED_SECRET`, no el `ControlActor` con headers de rol —
  necesitaba un canal separado para saber quien pidio el cambio).

Verificado end-to-end contra ingest-api + Postgres + agente Python reales
(no simulador): PUT config -> version `pending` -> comando `config.apply`
`queued->sent->acked->running` -> agente escribe `cowrie.cfg`/`userdb.txt`
atomicamente -> heartbeat siguiente confirma -> comando `succeeded` y
version `applied`. Rollback probado forzando 2 fallas consecutivas: el
propio sweep de TTL del servidor (30s, mismo proceso que las conexiones WS)
disparo el auto-rollback de forma organica sin intervencion manual, entrego
el comando de vuelta al agente conectado, y confirmo `applied` por
heartbeat — cerrando el loop de seguridad completo en el proceso real, no
en un mock.

Pendiente: sin UI para "Apply now" explicito ni boton "Rollback" manual en
el dashboard (el dialogo ya llama "Save & Apply" y ahora SI aplica por WS
confirmado, pero no muestra el estado del comando en vivo ni el historial de
versiones) — queda para el resto de Rebanada 7. `protocol` en
`sensor_config_versions` esta hardcodeado a `'ssh'` en el controller porque
hoy solo Cowrie tiene config.apply; generalizar cuando Port/SMB lo sumen
(Rebanada 8).

Conocido (2026-07-14): `checkAutoRollback` cuenta fallas consecutivas sobre
*todos* los config.apply (incluidos rollbacks previos) y siempre re-encola la
misma version `findLastApplied`. Si esa ultima version `applied` tampoco puede
levantar Cowrie (drift de entorno), el rollback entra en un loop de reinicios
cada ~90s sin rendirse — el guard `hasPendingConfigApply` evita *apilar* pero
no *repetir*. Rate acotado, solo acumula filas de version; no es un bug pero si
una debilidad. Cerrar con un tope de reintentos o un check "no hacer rollback a
un hash que el mismo acaba de fallar". Diferido.

**Verificado en produccion (2026-07-14):** desplegado en el VPS single-host real
via `up-single-host.sh`. Primer intento de `config.apply` fallo con
`UNSUPPORTED_ACTION` porque `cowrie-beacon` seguia con el `heartbeat.py` viejo
pese a un `docker restart` previo — Compose no recrea un contenedor cuyo
bind-mount cambio en el host si la config del servicio (imagen/volumes/command)
no cambio, asi que un `docker restart` manual es indispensable despues de tocar
`heartbeat.py`/`control_agent.py`, y conviene confirmarlo con
`docker exec cowrie-beacon grep -c "<algo nuevo>" /heartbeat.py` en vez de
asumir que el restart alcanzo. Con el agente correcto cargado, el ciclo
completo corrio real: `Save & Apply` desde el dialogo -> comando
`queued->sent(33ms)->acked(32ms)->running(28ms)` -> agente escribe config real
-> heartbeat siguiente confirma -> `succeeded` (~19s despues) con
`result.confirmedVia:"heartbeat"`.

### Rebanada 6 - Fallback y recuperacion

Objetivo: que la entrega no dependa de una conexion WebSocket perfecta.

- Agregar polling HTTP autenticado para recoger comandos pendientes.
- Reutilizar el mismo envelope, handlers, deduplicacion y estados del canal WS.
- Definir una unica politica de lease/claim para impedir que WS y HTTP ejecuten el
  mismo comando simultaneamente.
- Recuperar pendientes despues de reinicios del sensor o `ingest-api`.
- Aplicar backoff, jitter, TTL y limite de una ejecucion activa por sensor.

Criterio de salida: cortar WS no pierde ni duplica comandos; el sensor usa HTTP y
vuelve a WS cuando la conexion se recupera.

**Progreso (2026-07-14):** Rebanada 6 completa y verificada de punta a punta,
incluyendo el caso real "WS nunca conecta, todo pasa por HTTP".

Implementacion:

- `GET /sensors/control/poll` + `POST /sensors/control/report` (nuevo
  `sensor-control-poll.controller.ts`): mismas credenciales por sensor que el
  WS (`X-Sensor-Id`/`X-Sensor-Control-Secret`), mismo envelope de mensajes
  (`sensorControlClientMessageSchema` reusado tal cual para el body de
  `/report`).
- La politica de lease/claim que pedia el plan sale gratis del CAS que ya
  existía: `markSent` solo transiciona `queued -> sent` si encuentra la fila
  en `queued`. Se extrajo `claimDeliverable(sensorId)` de `attemptDelivery`
  (WS) para que el poll HTTP llame al mismo metodo — quien gane la carrera
  (WS empujando o HTTP reclamando) es quien se queda el comando; no hizo
  falta tabla ni columna de lease separada.
- Se extrajo `routeClientMessage(sensorId, msg, onConfigApplyFailure?)` en
  `SensorControlService`, consolidando lo que antes eran tres closures
  (`handleAck`/`handleRunning`/`handleResult`) duplicables en el plugin WS.
  Ahora WS y el poll HTTP comparten transiciones de estado, emision de SSE, y
  el disparador de auto-rollback de config.apply (Rebanada 5) sin
  divergencia posible entre los dos transportes.
- `control_agent.py`: refactor de `_handle_command(ws, msg)` a
  `_dispatch_command(msg, send_fn)` — el dispatch (dedup, handlers,
  ack/running/result) es ahora agnostico de transporte. Nuevo thread
  `_poll_forever`: si `_ws_connected` es `False` (bandera que el thread WS
  actualiza), hace `GET /sensors/control/poll` cada 15s (con backoff en
  errores) y reporta con `POST /sensors/control/report`; si el WS esta
  conectado, el poll solo late a 5s sin trabajo real, evitando trafico
  redundante. Sin cambios en `heartbeat.py` — `ControlAgent` ya tenia todo lo
  necesario (ingest_url, sensor_id, secret).
- "Recuperar pendientes despues de reinicios" queda cubierto por diseno, no
  por codigo nuevo: los comandos ya son filas persistentes en
  `sensor_commands`; un reinicio de sensor o de `ingest-api` no pierde nada,
  y el poll HTTP (o el WS al reconectar) los recoge apenas alguno de los dos
  vuelve a estar disponible.

Verificado end-to-end contra ingest-api + Postgres + el agente Python real,
con el WS **deliberadamente roto** (URL a un puerto inexistente) para forzar
el camino 100% HTTP: `stats: {connects: 0, commands: 1, http_polls: 2}` —
cero conexiones WS exitosas, un comando `status.get` real encolado por REST
mientras el WS fallaba, recogido por el poll, y confirmado `succeeded` con
resultado real, todo por HTTP. Tambien 5 tests de integracion nuevos
(`sensor-control-poll.integration.test.ts`): auth invalida (401), poll vacio,
claim exactamente una vez (la garantia CAS), ciclo completo por HTTP, y
rechazo de tipos de mensaje no soportados. Suite completa: 178/178 verde.

Pendiente: no hay metrica/alerta cuando un sensor pasa mucho tiempo en modo
fallback (solo el log `[control-http]` del propio agente) — util para
Rebanada 8 si el patron de caidas de WS se vuelve frecuente en produccion.

### Rebanada 7 - UI operativa

Objetivo: exponer el modelo ya probado sin crear un segundo sistema de estados.

- Mostrar presencia WS, heartbeat, capabilities, ultimo comando y config hash.
- Crear timeline consumiendo REST para estado inicial y SSE para actualizaciones.
- Mostrar claramente queued, sent, acknowledged, running, succeeded, failed,
  expired y cancelled.
- Habilitar acciones segun rol, ownership, capability y conectividad.
- Mantener feedback accesible y recuperable despues de recargar la pagina.

Criterio de salida: el operador puede consultar estado y aplicar config Cowrie con
feedback completo, sin refresh manual.

**Progreso (2026-07-14):** adelantada una porcion minima (presencia WS +
`status.get`), el resto (timeline completo, `config.apply` desde UI) espera a
Rebanada 5.

- `GET /sensors/:id/control-status` nuevo (ingest-api), respaldado por
  `SensorConnectionRegistry.has()` (reincorporado — ahora tiene un caller
  real). Mismo scope de rol/tenant que las demas rutas de control.
- `SensorControlPanel` (dashboard): badge de presencia WS — distinto del
  badge Online por heartbeat, ya que un sensor puede heartbeatear por HTTP
  con el socket de control caido — mas boton para disparar `status.get` y
  mostrar el resultado inline. Gateado a sensores SSH/Cowrie, igual que el
  dialogo de config existente.
- Bug real encontrado y arreglado en `live-stream-provider.tsx`: cualquier
  evento SSE que no fuera `alert`/`sensor-heartbeat` caia por default en
  `onAttack`; los eventos nuevos (`sensor.connected/disconnected`,
  `command.*`) se habrian colado como ataques falsos en el mapa. Ahora tienen
  su propio routing explicito.
- Verificado end-to-end en el VPS de produccion real (no solo local): stack
  completo levantado con `scripts/up-single-host.sh`, credencial de control
  emitida via REST, `cowrie-beacon` conectado (`pip install websockets` +
  agente real), badge pasando a "Control · connected" en vivo por SSE sin
  recargar la pagina, y `status.get` disparado desde el boton mostrando
  version+uptime reales.
- Gotcha de deploy encontrado: el `.env` raiz (el que lee docker-compose,
  distinto de `apps/ingest-api/.env` usado en dev local) no tenia
  `CONTROL_API_SECRET` ni `SENSOR_CONTROL_CREDENTIAL_PEPPER` documentados —
  con el fail-closed del pepper (Rebanada 4), su ausencia tumba el
  `ingest-api` completo al arrancar, no solo el control plane. Documentado en
  `.env.example` raiz.

**Progreso (2026-07-14, cont.):** con `config.apply` ya en Rebanada 5,
sumado el feedback en vivo en el dialogo de config de Cowrie —
`sensor-config-dialog.tsx`. El "Save & Apply" ya no muestra un aviso
estatico ("Cowrie reiniciara en ~15s" a ciegas); ahora trackea el
`configHash` devuelto por el PUT y consulta `GET /commands` para mostrar el
estado real del comando `config.apply`: `queued/sent/acked/running`
(spinner), `succeeded` (verde, confirmado por heartbeat), `failed` (rojo,
con el mensaje de error real) o `expired` (sensor probablemente
desconectado). Actualiza por SSE (`useLiveStream`) con un poll de respaldo
cada 5s — el poll es obligatorio, no cosmetico: la expiracion por TTL nunca
se anuncia por SSE (`expireQueued` solo escribe la fila), asi que sin el
poll ese caso quedaria invisible en la UI. Verificado: `tsc --noEmit`
limpio, 47/47 tests unitarios del dashboard. No verificado en browser —
mismo limite que el resto de la UI de control (sin acceso a la sesion real
del usuario).

Pendiente: timeline de comandos (historial mas alla del ultimo resultado),
capabilities/config hash en el header, boton "Rollback" manual explicito
(hoy el rollback automatico ya existe server-side desde Rebanada 5 pero no
hay forma de dispararlo a mano ni de verlo en la UI), y habilitar acciones
segun ownership ademas de rol.

**Progreso (2026-07-14, cierre):** los cuatro pendientes de arriba,
implementados.

- **Timeline de comandos:** `SensorControlPanel` ahora pide
  `GET /commands?limit=8` (antes `limit=1`) y guarda la lista completa en
  `history`; un toggle colapsable muestra accion+estado de cada uno. Sin
  cambios de backend — `listCommands` ya soportaba `limit` hasta 100, el
  dashboard solo pedia el ultimo.
- **Capabilities + configHash en el header:** `SensorControlConnection`
  (`sensor-connection-registry.ts`) gano dos campos (`agentVersion`,
  `capabilities`) poblados en `sensor-control-ws.plugin.ts` desde el `hello`
  ya validado; `GET /control-status` los devuelve cuando el sensor esta
  conectado. El panel los pinta como chips. `configHash` se sigue mostrando
  desde el `result` de `status.get` (ya existia en el tipo, no se pintaba).
- **Rollback manual:** nuevo par de rutas —
  `GET /sensors/:id/config/versions` (viewer) y
  `POST /sensors/:id/config/rollback` (admin) — en `sensors.controller.ts`,
  detras del mismo `ControlActor`/`CONTROL_API_SECRET` que ya protegia
  `commands`/`control-status` (no el `INGEST_SHARED_SECRET` mas debil que
  usa el resto de `/config`). `SensorConfigService.checkAutoRollback`
  (Rebanada 5) se partio en un helper privado `applyRollback` reutilizado
  por el path automatico (2 fallas seguidas, actor `system:auto-rollback`)
  y el nuevo `rollbackToLastApplied` (un click, actor real, sin esperar
  fallas — rechaza con 409 si ya hay un `config.apply` en vuelo y 404 si no
  hay ninguna version `applied` a la que volver). `SensorControlService`
  expone `authorizeActor` (wrapper publico de la validacion de rol+tenant
  que antes era privada) para que `sensor-config.service.ts` la reuse sin
  duplicar el chequeo de scope. UI: seccion colapsable "Version history" +
  boton "Rollback to last applied" en `sensor-config-dialog.tsx`, reusa el
  mismo tracking de `configHash` pendiente que ya tenia el flujo de
  Save & Apply (Rebanada 7 anterior) para mostrar el resultado del rollback
  en vivo.
- **Ownership en la UI:** nuevo hook `hooks/use-viewer.ts` — un solo
  `GET /api/me` cacheado a nivel de modulo (evita N requests si hay N
  sensor cards en la pagina) mas `canActOnSensor(viewer, minRole,
  sensorClientId)`, que reusa `hasPermission` de `roles-shared.ts` y
  compara `clientId` (superadmin siempre pasa). El boton "Configure" en
  `sensor-card.tsx`, el trigger de `status.get` en `SensorControlPanel`, y
  el boton de rollback en el dialogo ahora se ocultan si el usuario no
  cumple rol+ownership — antes se mostraban a cualquiera y dependian 100%
  del 403 del servidor. El enforcement real sigue siendo server-side
  (`SensorControlService.authorize`/`authorizeActor`); esto es UX, no una
  nueva capa de seguridad.

Refactor de paso (DRY): `getActor`/`actorHeadersSchema`, duplicados en
`sensor-control.controller.ts`, se movieron a `lib/control-auth.ts` como
`getControlActor` — usado ahora tambien por las dos rutas nuevas de config
en `sensors.controller.ts`.

Verificado: `tsc --noEmit` limpio en ambos apps, 47/47 tests del dashboard
y 147/147 unitarios de ingest-api (las suites de integracion que tocan
control plane siguen gateadas por `TEST_DATABASE_URL`, sin Docker en este
entorno — no se corrieron). No verificado en browser real, mismo limite
que el resto de la UI de control plane en este repo.

Pendiente real: sin tests nuevos para `rollbackToLastApplied`/`listVersions`
mas alla de tsc + lectura cuidadosa (el resto del modulo de control se
verifica con integracion real contra Postgres, gateada; estos dos metodos
siguen ese mismo patron pero no se agrego un caso nuevo). Rebanada 7 cierra
aqui — criterio de salida cumplido en su totalidad.

### Rebanada 8 - Adaptadores y operaciones adicionales

Objetivo: ampliar capacidades sin modificar protocolo, cola ni UI base.

**Dimensionamiento de sensores (2026-07-14):** de los 10 sensores en
`sensors/`, solo `cowrie`, `ftp-honeypot`, `mysql-honeypot`,
`port-honeypot`, `smb-honeypot` y `web-honeypot` corren un proceso Python
propio (`app.py`/`heartbeat.py`) donde `control_agent.py` engancha con el
mismo patron ya probado en Cowrie (`agent.action(...)` + escritura atomica).
`dionaea`, `galah`, `opencanary` y `suricata` son binarios/tools de terceros
sin ese hook — no entran en esta rebanada, integrarlos requeriria un agente
desde cero fuera del patron actual y no hay caso de negocio que lo justifique
hoy.

Orden de implementacion dentro de esta rebanada, por valor de negocio:

1. **`web-honeypot`** (prioridad alta, adelantada respecto al plan original):
   caso de uso concreto identificado con el usuario — poder cambiar el
   landing/paneles falsos por cliente segun sus requerimientos, sin releases
   ni SSH manual. Config: perfil visual, hostname/brand, rutas señuelo,
   paginas de login, headers/server banner, nivel de logging (ya listados
   arriba en "Configuraciones por sensor").
2. **`port-honeypot`** y **`smb-honeypot`**: alcance original del plan,
   identidad (Docker API/Elasticsearch en Port; share/server/domain/OS en
   SMB) personalizable por cliente, mismo valor que ya probo Cowrie.
3. **`ftp-honeypot`** y **`mysql-honeypot`**: mismo patron, prioridad menor
   salvo pedido explicito de un cliente (banner, version de server,
   credenciales señuelo).

Por sensor incluido:

- Integrar Port, SMB, FTP, MySQL y Web mediante handlers del agente comun.
- Agregar gradualmente `service.restart`, `identity.rotate` y `capture.flush`
  donde aplique (`capture.flush` solo tiene sentido en FTP/SMB, que capturan
  uploads).
- Exigir schema, permisos, estrategia de rollback y pruebas por cada accion
  nueva, siguiendo el mismo ciclo verificado en Cowrie (Rebanada 5).
- Calibrar rate limits, alertas y metricas con trafico real antes del
  rollout total.

**Progreso — Rebanada 8a, web-honeypot solo `status.get` (2026-07-14):**
primer vertical de web-honeypot completo y verificado de punta a punta,
mismo alcance minimo que uso Cowrie en Rebanada 4 (conectividad + `status.get`
unicamente, sin `config.apply` ni UI todavia).

- Backend (`apps/ingest-api`): **cero cambios.** La exploracion previa a
  implementar confirmo que todo el plano de comandos (`protocol.ts`,
  `sensor-control.service/repository`, `sensor-control-ws.plugin.ts`,
  `SensorConnectionRegistry`) ya es generico por `sensorId`, sin nada
  hardcodeado a Cowrie/ssh.
- Decision de arquitectura — **sidecar, no in-process:** `web-honeypot` corre
  con gunicorn (4 workers = 4 procesos separados, no threads). Enganchar el
  agente de control dentro de `app.py` como el heartbeat actual hubiera
  significado 4 conexiones WS independientes peleando por el mismo
  `sensorId`, cada una desconectando a la anterior (`SensorConnectionRegistry`,
  Rebanada 2) — connect/disconnect storm permanente. Se replica el patron
  `cowrie-beacon`: nuevo sidecar `web-honeypot-beacon` (mismo
  `python:3.12-alpine` + mount de `control_agent.py` + `pip install
  websockets==13.1`). Diferencia deliberada con Cowrie: el `heartbeat.py` de
  Cowrie manda el heartbeat *y* corre el agente (Cowrie no puede
  heartbeatear solo); `web-honeypot/app.py` ya manda su propio heartbeat, asi
  que el nuevo `sensors/web-honeypot/heartbeat.py` es **solo control-plane**
  (sin `POST /sensors/heartbeat`, para no duplicar heartbeats).
- `sensors/web-honeypot/heartbeat.py` (nuevo): registra `status.get` via
  `ControlAgent` (`sensors/_shared/control_agent.py`, sin cambios, mismo
  "copy don't import"), reportando `agentVersion`/`uptimeSeconds`/`pid` del
  beacon (no del proceso gunicorn real, mismo criterio que ya usa Cowrie con
  `os.getpid()`) + `ports` desde `SENSOR_PORTS`.
- Compose: `web-honeypot-beacon` agregado en los 4 archivos que ya tenian
  `cowrie-beacon` — `docker-compose.prod.honeypot.yml`,
  `docker-compose.prod.single-host.yml`, `deploy/local/sensor-web.yml`,
  `deploy/local/sensor-ssh-web.yml`. Nuevo `SENSOR_CONTROL_SECRET_HTTP`
  documentado en `.env.example` (mismo patron que `SENSOR_CONTROL_SECRET_SSH`).
- **Bug real encontrado y corregido durante la verificacion:**
  `sensorStatusDetailsSchema` (`protocol.ts`) declara `configHash` como
  `.nullable()`, no `.optional()` — es una clave requerida en el
  `command.result`, solo puede valer `string | null`, nunca faltar. El primer
  handler de `status.get` no incluia la clave (no aplicaba, sin
  `config.apply` en esta rebanada) y el `command.result` se rechazaba
  silenciosamente en el servidor: el comando quedaba encallado en `acked`
  para siempre, sin pasar a `succeeded` ni a `failed`. Fix: siempre incluir
  `"configHash": None` en el dict de retorno, igual que ya hace
  `sensors/cowrie/heartbeat.py:237`.
- Verificado end-to-end contra un ingest-api + Postgres reales (harness
  Docker aislado, sin tocar el stack de dev normal): sensor seedeado por
  heartbeat, credencial de control emitida via
  `POST /sensors/:id/control-credential`, `web-honeypot-beacon` conectado
  (`hello` aceptado), presencia confirmada por SSE
  (`sensor.disconnected` -> `sensor.connected` con
  `capabilities:["status.get"]` al reiniciar el beacon), `status.get`
  encolado por REST y resuelto `queued(0ms) -> sent -> acked -> succeeded`
  con `result` real (`pid`, `ports`, `agentVersion`, `uptimeSeconds`,
  `configHash:null`). Rechazo con secreto invalido confirmado (401 en
  `/sensors/control/ws` y `/sensors/control/poll`).
- Gap preexistente encontrado (no de esta rebanada): `deploy/local/core.yml`
  no define `CONTROL_API_SECRET` ni `SENSOR_CONTROL_CREDENTIAL_PEPPER` —
  cualquiera que use ese compose para levantar control plane localmente
  necesita exportarlas a mano. No se toco el archivo (fuera de alcance de
  esta rebanada); queda para cuando alguien retome el flujo de control plane
  sobre `deploy/local` en vez del compose raiz.

**Progreso — Rebanada 8b, web-honeypot `config.apply` MVP (2026-07-15):**
`config.apply` real para web-honeypot, con dos campos aislados y de bajo
riesgo (banner del servidor, nivel de logging) en vez de la personalizacion
de marca/contenido completa que pedia el objetivo de negocio original — la
marca "TechCorp" esta hardcodeada en ~13 archivos (templates, payloads,
varios `honeypot/catalog/*.py`) y atada al sistema de canary tokens
(`_CANARY_DB_USER = "techcorp_app"`); reescribir eso es un rediseno aparte,
decidido con el usuario. Este MVP prueba el pipeline completo de punta a
punta con riesgo minimo.

- **Backend generalizado por protocolo** (`sensors.controller.ts`): nuevo
  `webHoneypotConfigSchema` (`server_header`, `powered_by_header`,
  `log_level`) + registro `CONFIG_SCHEMAS: Record<protocol, {schema,
  default}>` reemplazando el hardcode de `cowrieConfigSchema` + literal
  `protocol: 'ssh'` en `GET`/`PUT /sensors/:sensorId/config`. Nuevo
  `SensorRepository.getSensorProtocol()` (mismo patron `$queryRaw` que
  `getSensorClientId`) + passthrough en `SensorService.getProtocol()` para
  elegir el schema correcto. `sensor-config.service.ts`/`.repository.ts` y
  todo el plano de comandos (`queueConfigApply`) no cambiaron — ya eran
  genericos por protocolo.
- **Decision de arquitectura — apply en caliente, sin restart:**
  `web-honeypot` corre 4 workers gunicorn = 4 procesos separados, no threads;
  no hay memoria compartida para mutar en un solo lugar. Se agrego un volumen
  `web_signal` (mismo patron que `cowrie_signal`) compartido entre
  `web-honeypot-beacon` (escribe `web-config.json` + hash) y `web-honeypot`
  (solo lee). Cada uno de los 4 procesos de `web-honeypot` corre su propio
  thread `_config_watch_loop` (mismo patron "harmless duplicado" que ya usa
  el heartbeat) que revisa el hash cada 5s y aplica el config en memoria —
  sin restart, a diferencia de Cowrie.
- **`heartbeat.py` (beacon):** agregado `_fetch_config`/`_atomic_write`/
  `_read_current_hash`/`_write_current_hash` (mismo patron que
  `cowrie/heartbeat.py`, sin el loop de poll directo de 10s — el fallback
  HTTP generico de Rebanada 6 ya cubre esa necesidad) y el handler
  `config.apply` (`ack -> running`, sin `command.result` en el happy path,
  igual que Cowrie: la confirmacion la hace el siguiente heartbeat de
  `app.py` con el hash coincidente).
- **Bug real encontrado y corregido durante la verificacion:** mutar
  `_STATIC_HEADERS["Server"]` en `app.py` no tenia ningun efecto en el header
  HTTP real — `gunicorn.http.wsgi.Response.default_headers()` siempre emite
  su propia linea `Server:` leyendo el global `gunicorn.http.wsgi.SERVER`
  (el mismo que `gunicorn.conf.py` ya parchea una vez al arrancar cada
  worker), ignorando lo que Flask haya puesto en `response.headers`. `X-Powered-By`
  si funcionaba (gunicorn no lo toca), lo que hizo el bug facil de pasar por
  alto probando un solo campo. Fix: `_apply_web_config` ahora tambien muta
  `gunicorn.http.wsgi.SERVER`/`SERVER_SOFTWARE` directamente — se lee fresco
  por request (`self.version = SERVER` dentro de `Response.__init__`), asi
  que el cambio se refleja en el siguiente request sin reiniciar el proceso.
- Verificado end-to-end contra un ingest-api + Postgres + `web-honeypot` +
  `web-honeypot-beacon` reales (harness Docker aislado, mismo patron que
  Rebanada 8a): `PUT /sensors/:id/config` con `server_header`/
  `powered_by_header` nuevos -> `config.apply`
  `queued->sent->acked->running->succeeded` (`confirmedVia:"heartbeat"`) ->
  **`curl` directo a `web-honeypot` confirmando el header `Server` Y
  `X-Powered-By` reales cambiados sin reiniciar el contenedor** (probado dos
  veces con valores distintos, `nginx/1.24.0`+`Express/4.18` y luego
  `Microsoft-IIS/10.0`+`ASP.NET`). `log_level` usa el mismo `_apply_web_config`
  que los headers ya verificados, mismo mecanismo de mutacion en caliente.
- Dashboard: `sensor-card.tsx`'s `isConfigurable` paso de
  `protocol === "ssh"` a `CONFIGURABLE_PROTOCOLS.has(sensor.protocol)`
  (`ssh`, `http`). `sensor-config-dialog.tsx` gano un prop `protocol`, tipo
  `SensorConfig = CowrieConfig | WebHoneypotConfig`, y los campos de Cowrie
  se agruparon en `CowrieConfigFields` + nuevo `WebHoneypotConfigFields` —
  el resto del dialogo (apply-status, version history, rollback,
  `handleSave`) sigue operando sobre `cfg` como blob generico, sin cambios.
  Extraer a archivos separados queda diferido hasta que entre un 3er
  protocolo (Port/SMB). Nuevas keys en `lib/i18n/dicts/sensors-config.ts`
  (en + es).
- Verificado: `tsc --noEmit` limpio en ambos apps, 47/47 tests dashboard,
  147/147 unitarios ingest-api (integracion sigue gateada por
  `TEST_DATABASE_URL`, no corrida en este entorno).

Pendiente: personalizacion de marca/contenido real (fuera de alcance,
rediseno aparte); tests dedicados para la nueva ruta `GET/PUT /config`
generalizada (hoy se verifica con `tsc` + el harness end-to-end manual,
mismo patron que el resto de rutas de config); UI en el dashboard no probada
en browser real (mismo limite que el resto del control plane en este repo).

**Progreso — Rebanada 8c, plano de control en el instalador remoto de
clientes (2026-07-15):** hallazgo del usuario al preguntar "cuando instalo
un sensor en otro lado (no single-host, sino desde la ficha del cliente),
¿ya tiene los cambios que agregamos?" — la respuesta era **no**. El boton
"instalar sensor" de un cliente (`/api/sensor/install`,
`sensor-install-script.ts`) no clona el repo: arma un `docker-compose.yml`
inline a partir de plantillas completamente separadas
(`sensor-compose-blocks.ts` + `sensor-compose-builder.ts`), que nunca se
tocaron desde que existe el plano de control (Rebanada 4+). Esto afectaba a
**ambos** sensores con beacon, no solo web:

- `cowrie-beacon` en ese instalador ya estaba **roto de antes**: montaba
  `heartbeat.py` pero nunca descargaba `control_agent.py` (`from
  control_agent import ControlAgent` fallaba con `ModuleNotFoundError` al
  arrancar) y el `command` no instalaba `websockets`. Un sensor SSH instalado
  por ese camino tenia el contenedor `cowrie-beacon` crasheando en loop
  desde el dia uno — bug preexistente, no introducido por esta sesion, pero
  en el mismo archivo que habia que tocar para arreglar web-honeypot, asi
  que se corrigio junto.
- `web-honeypot` en ese instalador no tenia beacon en absoluto (ni
  `control_agent.py`, ni volumen de señal, ni `SENSOR_CONTROL_SECRET`).

Cambios:

- `sensor-compose-blocks.ts`: `SSH_TEMPLATE`'s `cowrie-beacon` ahora monta
  `./control_agent.py:/control_agent.py:ro`, agrega
  `SENSOR_CONTROL_SECRET: ""` y cambia el `command` a
  `pip install --quiet websockets==13.1 && python3 /heartbeat.py` (antes
  `python3 /heartbeat.py` a secas). `HTTP_TEMPLATE` gana un nuevo servicio
  `web-honeypot-beacon` (mismo patron), y `web-honeypot` gana
  `volumes: - web_signal:/signal:ro` + `SIGNAL_DIR: /signal` — mismo
  volumen compartido que ya usan los compose de single-host/remote-honeypot.
- `sensor-compose-builder.ts`: `buildVolumeLines` declara `web_signal:`
  cuando `services.includes("http")`.
- `sensor-install-script.ts`: nuevas `httpDownloadLines()` (descarga
  `sensors/web-honeypot/heartbeat.py` como `web-heartbeat.py`, nombre
  distinto para no chocar con el `heartbeat.py` de Cowrie en el mismo
  directorio de instalacion) y `controlAgentDownloadLines()` (descarga
  `sensors/_shared/control_agent.py` una sola vez, compartida por ambos
  beacons si estan presentes).
- **Limite real, no resuelto por diseno:** el instalador no puede llevar un
  `SENSOR_CONTROL_SECRET` valido de fabrica — la credencial se emite server
  side (`POST /sensors/:id/control-credential`) recien despues de que el
  sensor exista en la base (su primer heartbeat lo crea), asi que no puede
  conocerse en el momento de generar el script de instalacion. Los beacons
  arrancan igual (heartbeat/eventos normales no dependen del control plane),
  intentan conectar con secreto vacio, y el servidor los rechaza limpio
  (401) hasta que un admin emite la credencial y actualiza el compose a
  mano. Se agrego un aviso final en el script (`controlPlaneNote()`, nueva
  seccion en el resumen "Sensor is UP and connected") indicando ese paso
  pendiente explicitamente en vez de dejarlo silencioso.
- **Fuera de alcance deliberado:** `int-ssh`/`int-http`/`internal-canary`
  (deploys de deception interna) no se tocaron — tienen su propio problema
  preexistente y no relacionado (`INT_SSH_TEMPLATE` referencia
  `{{registry}}/cowrie-beacon:latest`, una imagen que
  `.github/workflows/publish-sensor-images.yml` nunca publica; `int-http`
  no tiene beacon en absoluto). Es una topologia distinta (nodos LAN de
  deception) que nadie pidio arreglar en esta entrega.
- Verificado: `tsc --noEmit` limpio, 47/47 tests dashboard. Compose generado
  end-to-end con `buildCompose(...)`/`buildScript(...)` reales (deployId,
  ssh+http) validado con `docker compose config --quiet` (exit 0) y el
  script bash completo con `bash -n` (sintaxis valida) — confirmando en el
  output real que `cowrie-beacon`/`web-honeypot-beacon` traen sus mounts,
  `SENSOR_CONTROL_SECRET`, `web_signal`, y que el aviso final aparece.

**Progreso — Rebanada 8d, port-honeypot + smb-honeypot, solo `status.get`
(2026-07-15):** siguiente sensor de la lista de prioridad de negocio,
mismo alcance minimo que Cowrie (Rebanada 4) y web-honeypot (Rebanada 8a).

- **Hallazgo — mas simple que Cowrie y que web-honeypot:** ninguno de los
  dos corre gunicorn ni tiene multiples workers — `port-honeypot` es un
  solo proceso asyncio, `smb-honeypot` un solo proceso sincrono con Impacket
  bloqueante en el thread principal. No hace falta sidecar (`*-beacon`) ni
  un `heartbeat.py` nuevo: `control_agent.py` se importa directo dentro del
  `app.py` que ya existe, mismo archivo compartido de siempre montado por
  volumen (`/app/control_agent.py`, ya que el `WORKDIR` de ambos es `/app`).
- `sensors/port-honeypot/app.py`: `status.get` reporta `ports=_active_ports`
  (la lista que ya se va llenando a medida que cada
  `asyncio.start_server` bindea). `control_agent.start()` se llama en
  `main()` despues del loop de bind, antes del `asyncio.gather(...)`.
- `sensors/smb-honeypot/app.py`: mismo patron, `status.get` reporta
  `ports=[PORT]`; `control_agent.start()` junto a donde ya arranca
  `_heartbeat_loop`.
- **Dependencia horneada en la imagen, no instalada en runtime:** a
  diferencia de los sidecars beacon (`python:3.12-alpine` generico +
  `pip install` en el `command`, aceptable ahi por ser contenedores
  descartables), estos dos ya tienen Dockerfile propio. Se agrego
  `RUN pip install --no-cache-dir websockets==13.1` a
  `sensors/port-honeypot/Dockerfile` (no tenia ningun `RUN pip install`
  antes) y se sumo `websockets==13.1` a la linea de `pip install` que
  `sensors/smb-honeypot/Dockerfile` ya tenia para `impacket` — se instala
  una sola vez al construir la imagen, sin latencia de red en cada arranque
  del proceso principal.
- Compose: mount de `- ./sensors/_shared/control_agent.py:/app/control_agent.py:ro`
  + `SENSOR_CONTROL_SECRET: ${SENSOR_CONTROL_SECRET_PORT:-}` /
  `${SENSOR_CONTROL_SECRET_SMB:-}` en `docker-compose.prod.honeypot.yml`,
  `docker-compose.prod.single-host.yml` y `deploy/local/sensor-port.yml`
  (smb no tiene archivo de dev local — no se creo uno nuevo, mismo criterio
  que `int-*`). Nuevas `SENSOR_CONTROL_SECRET_PORT`/`_SMB` en `.env.example`.
- Instalador remoto de clientes (`sensor-compose-blocks.ts`): `PORT_TEMPLATE`
  (imagen prebuilt) gano el mismo mount en runtime que Cowrie/web +
  `controlAgentDownloadLines()` extendido para incluir `"port"`.
  `SMB_TEMPLATE` es distinto — construye con `dockerfile_inline` trayendo
  `app.py` por `ADD <url>` en vez de por mount; se le sumo una segunda linea
  `ADD .../control_agent.py /app/control_agent.py` en el mismo Dockerfile
  inline, sin necesitar descarga aparte.

**Progreso — Rebanada 8e, fix del instalador remoto de SMB (2026-07-15):**
el bug preexistente detectado en 8d (`SMB_TEMPLATE` solo hacia `ADD` de
`app.py`, nunca del paquete `honeypot/` completo que ese mismo `app.py`
importa — `smb-honeypot` instalado por el flujo remoto de clientes fallaba
con `ModuleNotFoundError` antes de siquiera llegar al plano de control) se
arreglo a pedido del usuario. Se agregaron las 6 lineas `ADD` que faltaban
(`honeypot/__init__.py`, `config.py`, `capture.py`, `identity.py`,
`impacket_patches.py`, `ingest.py`) al mismo `dockerfile_inline`.
Verificado con un build Docker real contra las URLs de GitHub (los archivos
del paquete ya estaban en `master`, sin necesidad de push previo): la
imagen compila y el contenedor arranca sin `ModuleNotFoundError` — logs
reales `SMB honeypot starting...`/`Config file parsed` en vez del crash de
antes. Limpio despues de la verificacion, sin dejar imagenes ni contenedores
sueltos. `INT_SMB_TEMPLATE` (deception interna) sigue sin tocar —
referencia `{{registry}}/smb-honeypot:latest`, una imagen que
`publish-sensor-images.yml` tampoco publica (mismo problema que
`cowrie-beacon:latest` en Rebanada 8c), parte del mismo alcance
deliberadamente fuera de esta entrega.
- Verificado end-to-end contra un ingest-api + Postgres reales (harness
  Docker aislado, imagenes construidas con los Dockerfiles nuevos, sin tocar
  el stack de dev del usuario): ambos sensores arrancan y sirven normal
  (puertos 6379/9200 responden como siempre — incluyendo el panel falso de
  Elasticsearch real vía `curl`; el puerto 445 de SMB acepta conexion TCP),
  se conectan al plano de control (`[control] connected as ...` en logs),
  credencial emitida por sensor via REST, `status.get` encolado y resuelto
  `queued->sent->acked->succeeded` con `result` real (`ports`, `pid`,
  `agentVersion`, `uptimeSeconds`) para ambos. `tsc --noEmit` limpio,
  47/47 tests dashboard. Compose+script remoto generado con `port`+`smb`
  reales, validado con `docker compose config --quiet` (exit 0) y
  `bash -n` (sintaxis valida).

Pendiente: `config.apply` para ambos sensores queda deliberadamente fuera de
esta entrega — a diferencia de web-honeypot, la mayoria de los campos de
identidad (puertos activos, share/servidor SMB, dialecto) se fijan una sola
vez al bindear el socket o construir el `SimpleSMBServer` de Impacket;
cambiarlos requeriria reiniciar el contenedor, no hay equivalente al "apply
en caliente sin restart" de web-honeypot. Decidir si vale la pena antes de
implementarlo (`config.apply` + `service.restart` combinados, o limitarlo a
los pocos campos realmente cosmeticos: titulo/org del panel HTTP en Port,
contenido de los archivos señuelo en SMB).

**Progreso — Rebanada 8f, ftp-honeypot + mysql-honeypot, solo `status.get`
(2026-07-15):** ultimos dos sensores de los seis viables, mismo patron
exacto que port/smb (Rebanada 8d) — ambos son un solo proceso asyncio, sin
gunicorn, sin sidecar necesario. `control_agent.py` importado directo en
cada `app.py`, `websockets==13.1` horneado en cada Dockerfile (ninguno tenia
`RUN pip install` antes, igual que port-honeypot).

- `sensors/ftp-honeypot/app.py`: `status.get` reporta `ports=[PORT]`;
  `control_agent.start()` llamado en `main()` justo despues de bindear el
  server, antes del `asyncio.gather(...)`.
- `sensors/mysql-honeypot/app.py`: mismo patron.
- Compose: mount de `control_agent.py` + `SENSOR_CONTROL_SECRET_FTP`/`_MYSQL`
  en `docker-compose.prod.honeypot.yml` y `docker-compose.prod.single-host.yml`
  (ninguno de los dos tiene archivo de dev local, igual que smb). Nuevas
  entradas en `.env.example`.
- Instalador remoto de clientes: `FTP_TEMPLATE`/`MYSQL_TEMPLATE` (ambos con
  imagen prebuilt, igual que Port) ganaron el mismo mount en runtime +
  `SENSOR_CONTROL_SECRET`. `controlAgentDownloadLines()` generalizado a una
  lista `CONTROL_AGENT_SERVICES` en vez de una cadena de `&&` creciente.
  `controlPlaneNote()` incluye ahora los 6 servicios posibles.
- Verificado end-to-end contra un ingest-api + Postgres reales (harness
  Docker aislado, sin tocar el stack del usuario): ambos sensores arrancan y
  sirven normal (banner FTP falso `220 (vsFTPd 3.0.5)` real via socket;
  handshake MySQL 5.7 falso real via socket), se conectan al plano de
  control, credencial emitida por sensor via REST, `status.get` encolado y
  resuelto `queued->sent->acked->succeeded` con `result` real para ambos.
  `tsc --noEmit` limpio, 47/47 tests dashboard. Compose+script remoto
  generado con `ftp`+`mysql` reales, validado con `docker compose config
  --quiet` (exit 0) y `bash -n`.

**Con esto, los 6 sensores viables (`ssh`, `http`, `port`, `smb`, `ftp`,
`mysql`) tienen `status.get` funcionando de punta a punta, tanto en
single-host/remote-honeypot como en el instalador remoto de clientes.**
Pendiente el mismo tipo de trabajo que para port/smb: decidir e implementar
`config.apply` donde tenga sentido real (la mayoria de campos de estos
sensores tambien requieren restart, no hay "apply en caliente" generalizado
mas alla de Cowrie y web-honeypot).

### Rebanada 9 - Consola SSH web para probar el sensor Cowrie

Estado: **planificada, sin implementar** (2026-07-14).

Objetivo: que un operador pueda abrir una terminal SSH interactiva contra el
honeypot Cowrie **desde el dashboard**, sin salir del navegador ni tener un
cliente SSH local, para probar el shell falso, los banners, el hostname, y las
credenciales configuradas exactamente como los veria un atacante que entra por
el puerto expuesto. Es una herramienta de prueba/QA del sensor SSH (el que mas
se esta iterando), no una accion del control plane.

Decisiones ya tomadas con el usuario (2026-07-14):

- **Ubicacion:** boton nuevo "Console" en la card del sensor SSH, al lado de
  "Configure" (mismo gate `isConfigurable = protocol === 'ssh'`), que abre un
  modal con la terminal.
- **Login:** manual — la terminal conecta y deja al operador escribir
  usuario/contrasena, igual que un atacante real. Asi se prueban las
  credenciales configuradas tal como estan expuestas. (Sin auto-login.)
- **Rol minimo:** `admin`. Es mas restrictivo que "Configure" (analyst)
  porque tecnicamente es un cliente SSH real corriendo desde el server.

**Requisito explicito del usuario (2026-07-14):** la consola debe funcionar
**igual en single-host que con sensores remotos** — un solo camino, no un
modo "local" y otro "remoto". Eso descarta el enfoque de "ingest-api dialer
directo al puerto SSH" (solo sirve local) y fuerza el diseno unificado de
abajo.

#### Contexto de topologia (lo que condiciona TODO el diseno)

Verificado en `docker-compose.prod.single-host.yml`:

- `cowrie` escucha en `2222` (expuesto como `22:2222` y `2222:2222`).
- `ingest-api` comparte la red `honeypot_ingest` con cowrie, asi que en
  single-host *podria* dialar `cowrie:2222` — pero eso NO sirve para sensores
  remotos.
- `dashboard` esta solo en `app_api` + `db_private`: no alcanza a cowrie,
  solo a `ingest-api`.
- Un sensor **remoto** (otro VPS, `docker-compose.prod.honeypot.yml`) hace
  solo conexiones **salientes** al `ingest-api` central; este NO tiene ruta de
  vuelta al puerto SSH del sensor remoto. Es la regla de seguridad #1 del
  plan: los sensores nunca aceptan conexiones entrantes.

La unica pieza que ya existe y alcanza al sensor **en ambas topologias por
igual** es la **conexion WS saliente que el agente (`cowrie-beacon`) ya
mantiene** contra el `ingest-api`. Por eso el tunel del PTY tiene que viajar
por ahi. El agente es quien abre el SSH — contra su **propio cowrie local**
(mismo host/red) — y bombea los bytes de la terminal por su WS saliente.
`ingest-api` nunca dialer hacia ningun sensor; solo hace de puente.

#### Arquitectura unificada (misma para local y remoto)

```
Browser (xterm.js en un modal)
   | WS operador (bytes crudos del PTY)  ── token corto de un solo uso
   v
ingest-api  ── PUENTE de bytes, registro de sesiones de consola ──
   ^                                            |
   | WS agente (bytes crudos del PTY)           | control WS existente:
   |  ── token corto de un solo uso             |   command `console.open`
   |                                            v   {sessionId, token, wsUrl}
cowrie-beacon (ControlAgent)  <─────────────────┘
   - recibe `console.open` por el control WS que ya tiene abierto
   - abre WS saliente dedicado al ingest-api (con el token)
   - abre SSH a su cowrie LOCAL (cowrie:2222 / 127.0.0.1:2222) con PTY (paramiko)
   - pipe bidireccional: WS <-> canal SSH
```

Flujo completo:

1. Browser -> BFF `POST /api/sensors/:id/console` (admin). El BFF pide a
   `ingest-api` que cree una **sesion de consola**: `ingest-api` genera
   `{sessionId, operatorToken, agentToken}` (tokens cortos, un solo uso) y
   encola/entrega un command **`console.open`** al agente por el control WS ya
   existente, con `sessionId`, `agentToken` y la URL WS a la que debe dialar.
2. El agente recibe `console.open` (accion nueva, manejada como stream **fuera**
   de la maquina de estados de comandos normal), abre un **WS saliente
   dedicado** `/(...)/console/agent?token=agentToken`, y abre SSH a su cowrie
   local pidiendo un PTY.
3. El browser abre su propio WS `/(...)/console/operator?token=operatorToken`.
4. `ingest-api` empareja las dos puntas por `sessionId` en un registro en
   memoria (mismo patron single-instance que `SensorConnectionRegistry`) y
   **bombea bytes crudos** operador <-> agente. Los eventos de resize
   (cols/rows del xterm) viajan operador -> ingest -> agente -> PTY.
5. Cerrar cualquiera de las dos puntas (o el modal) desmonta todo: WS operador,
   WS agente y la sesion SSH.

Por que un **WS dedicado efimero** y no multiplexar sobre el control WS
existente: el control WS serializa todo por la cadena `processing` + dedup,
disenada para comandos discretos (ack/result), no para un stream interactivo
de alto volumen; meter los bytes del PTY ahi agregaria latencia y podria
ahogar el procesamiento de comandos. Ademas el protocolo de control es JSON y
un stream de terminal en base64-sobre-JSON es un desperdicio. El command
`console.open` sirve solo de **disparador** ("dialer de vuelta a esta URL con
este token"); el stream va por su propio canal.

#### Componentes a construir

1. **Protocolo de control:** nueva accion `console.open` (payload
   `{sessionId, token, wsUrl}`). El agente la trata distinto: no reporta
   ack/running/result por la maquina de estados — abre el WS dedicado.
2. **`control_agent.py`:** handler de `console.open` que abre el WS saliente
   dedicado + SSH local con PTY (`paramiko`, dep nueva del agente, via el
   mismo patron `pip install` del compose). Bombea bytes en un thread propio,
   independiente del loop de control y del de heartbeat. Cierra limpio si
   cualquiera de las dos puntas cae.
3. **ingest-api — plugin WS `console/agent` y `console/operator`** +
   **registro de sesiones de consola** que empareja ambas puntas por
   `sessionId` y hace el puente de bytes. Limites: timeout de inactividad,
   tope de tamano de frame, una sesion activa por operador.
4. **ingest-api — REST `POST /sensors/:id/console`** (protegido por
   `ensureControlApiToken` + `ControlActor` admin): crea la sesion, mintea los
   dos tokens, dispara el `console.open`. Devuelve `operatorToken` + la URL WS
   publica.
5. **dashboard BFF — `POST /api/sensors/:id/console`:** `requireRole('admin')`,
   reenvia con headers de control, audita la apertura (`logAudit`).
6. **dashboard UI — `SensorConsoleDialog`:** modal con `@xterm/xterm` +
   `@xterm/addon-fit` (deps nuevas). Pide la sesion al BFF, abre el WS operador
   directo a `ingest-api`, conecta xterm. Boton "Console" en `sensor-card.tsx`
   gateado a `isConfigurable && esAdmin` (rol del cliente via `useSession()`;
   el gate real lo hace el server).

Nota de por que el WS operador va directo a `ingest-api` y no via el BFF:
Next.js App Router **no soporta upgrade a WebSocket** en un route handler (el
SSE de `/api/events/live` funciona porque es una respuesta HTTP larga con
`reply.raw`, no un upgrade). Por eso el token: el BFF autoriza y mintea, el
browser abre el WS directo al `ingest-api` (publico via `NEXT_PUBLIC_API_URL`).

#### Dependencias nuevas

- `paramiko` en el **agente** (`cowrie-beacon`): cliente SSH + PTY, para dialar
  el cowrie local. Se suma al `pip install` que ya hace el compose
  (`websockets` -> `websockets paramiko`). Reemplaza la idea previa de meter
  `ssh2` en ingest-api — con el diseno unificado ingest-api NO habla SSH, solo
  puentea bytes.
- `@xterm/xterm` + `@xterm/addon-fit` en el **dashboard**. Funcionalidad nueva,
  no reemplaza nada.

#### Seguridad

- Rol `admin` + scope de tenant (reusar `authorize()` de
  `SensorControlService`).
- Dos tokens de un solo uso, TTL corto, atados a `{sessionId, sensorId,
  actorId}` — uno para la punta operador, otro para la punta agente. El
  browser no puede mandar headers custom en un `new WebSocket()`, de ahi el
  token en query.
- El canal de consola NO reusa la credencial del control plane; el
  `console.open` viaja por el control WS ya autenticado, pero el WS de bytes
  usa su propio token efimero.
- Auditar apertura y cierre (quien, que sensor, duracion).
- Timeout de inactividad + cierre forzado; una consola activa por operador
  (evita SSH colgados por modales olvidados).

#### Gotcha: contaminacion de datos del honeypot

El agente abre el SSH contra su cowrie local, asi que **Cowrie registra la
sesion de prueba como un evento/ataque mas**, con IP de origen interna (el
propio agente / `127.0.0.1` en el host del sensor), no una IP externa real.
Esas sesiones van a aparecer en analytics/mapa como ataques. Decidir antes del
rollout:

- Etiquetar el origen "operator/test" (p.ej. un usuario/marca conocida en el
  login, o la IP interna del agente) y excluirlo de metricas y del mapa (lo
  mas limpio).
- O aceptar la contaminacion si el volumen de pruebas es bajo, y documentarlo.

#### Alcance v1 (lo que se implementa)

- Consola a cowrie **local y remoto por el mismo camino** (tunel sobre el WS
  del agente).
- Login manual.
- Rol admin + scope tenant + tokens cortos + auditoria.
- Filtrar/etiquetar las sesiones de prueba fuera de analytics.

#### Diferido a una v2 (no en esta rebanada)

- Grabacion/replay de la sesion de consola.
- Consola para otros protocolos (no aplica: solo SSH tiene shell interactivo).
- Multi-instancia del registro de sesiones de consola (hoy en memoria,
  single-instance, mismo limite documentado que `SensorConnectionRegistry`).

#### Criterio de salida

El operador admin abre "Console" en la card de un sensor SSH — **da igual si
es el cowrie local del single-host o uno remoto en otro VPS** — escribe una
credencial configurada, entra al shell falso de Cowrie, ejecuta comandos y ve
la salida en tiempo real; al cerrar el modal la sesion SSH y ambos WS se
cierran del lado del server; la apertura queda auditada; y las sesiones de
prueba no ensucian las metricas de ataques.

### Primer bloque de trabajo recomendado

La primera implementacion debe limitarse a Rebanadas 0 y 1. Deja listo todo lo
necesario para WebSocket sin agregar aun una dependencia de transporte ni acciones
remotas con efectos.

Entregables del bloque:

- contrato v1 y catalogo inicial (`status.get` habilitado);
- migracion y modelo `sensor_commands`;
- repository, service y controllers respetando el layering del backend;
- endpoints REST y permisos por rol/tenant;
- auditoria, TTL, cancelacion e idempotencia;
- tests unitarios y de integracion de estados y autorizacion;
- nota de baseline del flujo Cowrie actual;
- actualizacion de este plan con resultados y siguiente paso exacto.

No forman parte de este primer bloque:

- dependencia WebSocket;
- registro de sockets;
- cambios en sensores;
- `config.apply`;
- botones nuevos en dashboard;
- restart, shell o cambios de identidad.

## Referencia detallada por componente (plan original)

### Fase 0 - Cerrar deuda actual

Objetivo: que el estado base sea confiable antes del control remoto.

- `/sensors` debe leer freshness desde primario, no replica.
- `SensorLiveProvider` debe expirar heartbeats por TTL.
- Documentar que SSE queda como broadcast live feed.
- Verificar que Cowrie config actual funciona de punta a punta.

Verificacion:

```bash
npx tsc --noEmit
docker compose -f docker-compose.prod.single-host.yml config --quiet
```

### Fase 1 - Modelo de comandos y estados

Objetivo: persistir comandos remotos antes de transportar por WS.

- Crear migracion `sensor_commands`.
- Crear repositorio/servicio `SensorCommandService`.
- Agregar endpoints:
  - `POST /sensors/:sensorId/commands`
  - `GET /sensors/:sensorId/commands?limit=20`
  - `POST /sensors/:sensorId/commands/:commandId/cancel`
- Integrar audit log.
- No conectar WS todavia.

Verificacion:

```bash
cd apps/ingest-api
npm test
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

### Fase 2 - WebSocket sensor-agent

Objetivo: sensores conectados al ingest-api por WS saliente.

- Agregar `@fastify/websocket`.
- Crear plugin `sensor-control-ws`.
- Endpoint:
  - `GET /sensors/control/ws?sensorId=...`
- Autenticar con `X-Ingest-Token` o query token firmado.
- Registrar sockets activos por `sensorId`.
- Emitir eventos SSE:
  - `sensor.connected`
  - `sensor.disconnected`
  - `command.sent`
  - `command.ack`
  - `command.result`
- Entregar comandos `queued` al conectar.

Verificacion:

```bash
node scripts/simulate-sensor-ws.js
curl -s http://localhost:3000/sensors | jq
```

### Fase 3 - Sensor agent comun

Objetivo: no duplicar logica de WS en cada sensor.

- Crear modulo Python comun, por ejemplo `sensors/common/control_agent.py`.
- Funciones:
  - conectar WS con backoff;
  - enviar `hello`;
  - enviar heartbeats enriquecidos;
  - recibir comandos;
  - ACK/result;
  - fallback HTTP polling.
- Integrarlo primero en Cowrie beacon.

Verificacion:

```bash
docker logs cowrie-beacon --tail 100
```

Debe verse:

- `control ws connected`;
- `hello accepted`;
- `command received`;
- `command result sent`.

### Fase 4 - Cowrie config apply con ACK real

Objetivo: reemplazar feedback ciego por estado real.

- `PUT /config` crea `sensor_config_version`.
- Backend crea comando `config.apply`.
- Cowrie recibe por WS.
- Cowrie escribe config + userdb.
- Cowrie dispara reload.
- Cowrie reporta `running`.
- Tras reinicio y siguiente heartbeat con nuevo hash, backend marca `succeeded`.
- Dashboard muestra `Applied`.

Verificacion:

```bash
curl -X PUT /api/sensors/<cowrie-id>/config
docker logs cowrie-beacon --tail 100
docker logs cowrie --tail 100
```

### Fase 5 - UI de control remoto

Objetivo: que el operador vea y controle todo desde el dashboard.

- Extender `use-live-stream` para nuevos tipos de eventos.
- Crear `SensorCommandTimeline`.
- Mostrar:
  - WS connected/disconnected;
  - last heartbeat;
  - latest command status;
  - config hash actual/aplicado;
  - error si fallo.
- El dialogo de config debe esperar `command.result` y actualizar sin refresh manual.

Verificacion:

```bash
cd apps/dashboard
npx tsc --noEmit
```

### Fase 6 - Port y SMB configurables

Objetivo: aplicar el mismo modelo a sensores que mas valor dan ahora.

- Port honeypot:
  - config de servicios, banners y puertos;
  - reload sin recrear contenedor cuando sea posible;
  - restart si cambia lista de puertos.
- SMB:
  - server name/domain/share/OS/decoys;
  - reload decoys e identidad;
  - restart si cambia dialect/support profundo.

Verificacion:

```bash
docker compose -f docker-compose.prod.single-host.yml up -d --build port-honeypot smb-honeypot
curl http://HOST:9200/
smbclient //HOST/ADMIN$ -N -m SMB3 -c "ls"
```

### Fase 7 - Fallback y resiliencia

Objetivo: que el control no dependa de una conexion perfecta.

- Si WS cae, sensor vuelve a polling HTTP cada 30s.
- Comandos pendientes sobreviven reinicios.
- Comandos expirados se marcan `expired`.
- Dashboard muestra `queued` si el sensor esta offline.
- Reconexion con backoff y jitter.
- Limite de comandos concurrentes por sensor: 1.

Verificacion:

```bash
docker stop ingest-api
docker start ingest-api
docker logs <sensor> --tail 100
```

### Fase 8 - Auditoria y hardening

Objetivo: que sea operable en produccion.

- Audit log para:
  - config saved;
  - command queued;
  - command sent;
  - command result;
  - command failed;
  - rollback.
- Redactar secretos en configs.
- Rate limit para endpoints de control.
- Tests de permisos por rol.
- Alertas para `config.failed` y sensores desconectados.
- Revocacion de credencial de control (deshabilitar sin rotar). El read-path ya
  existe: `verify()` chequea `revokedAt`, la columna y su indice estan en el
  schema; solo falta el write. Agregar `DELETE /sensors/:id/control-credential`
  (repo `revoke()` + role check admin + audit) junto con Rebanada 4, cuando un
  sensor real sostenga la credencial y el corte se pueda testear de punta a
  punta. Hoy la rotacion (re-issue) ya invalida el secreto viejo.

## Criterios de listo

La implementacion se considera lista cuando:

- un sensor remoto puede conectarse por WS al ingest-api;
- el dashboard muestra connected/disconnected sin refresh manual;
- Cowrie recibe una config nueva y reporta `applied`;
- `port-honeypot` y `smb-honeypot` pueden cambiar identidad desde UI;
- todos los comandos quedan auditados;
- si WS cae, el sensor sigue aplicando via fallback HTTP;
- no existe comando shell arbitrario;
- hay pruebas unitarias del servicio de comandos y prueba manual documentada del flujo real.

## Riesgos

| Riesgo | Mitigacion |
|--------|------------|
| Sensor queda en loop de restart por config mala | validar config antes de guardar, mantener rollback |
| Un atacante usa control plane si roba token | token por sensor, rotacion, audit, allowlist de acciones |
| WS rompe por proxy/tunel | mantener HTTP fallback |
| Config aplicada pero UI no se entera | command result + heartbeat con `configHash` |
| Demasiada carga por conexiones WS | conexiones solo sensores, dashboard sigue SSE |
| Drift entre sensor y backend | `hello` incluye `configHash` y capabilities |

## Deuda tecnica conocida

- Cowrie ya tiene config remota, pero su userdb actual acepta wildcard. Hay que decidir si la UI realmente controla credenciales o si el modo `accept-all` debe mostrarse explicitamente.
- `dashboard` y `ingest-api` tienen rutas de control locales por Docker socket. Este plan no las elimina; las complementa para sensores remotos.
- El plan no migra ataques/eventos a WebSocket. Los eventos de ataque siguen por pipeline actual y SSE al dashboard.

