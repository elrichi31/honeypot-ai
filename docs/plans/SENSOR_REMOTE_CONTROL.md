# SENSOR_REMOTE_CONTROL - WebSocket control plane para sensores

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

Pendiente: timeline de comandos (historial mas alla del ultimo resultado),
capabilities/config hash en el header, y habilitar acciones segun
ownership ademas de rol — todo eso tiene mas sentido una vez que exista
`config.apply` (Rebanada 5) para mostrar.

### Rebanada 8 - Adaptadores y operaciones adicionales

Objetivo: ampliar capacidades sin modificar protocolo, cola ni UI base.

- Integrar Port y SMB mediante handlers del agente comun.
- Agregar gradualmente `service.restart`, `identity.rotate` y `capture.flush`.
- Exigir schema, permisos, estrategia de rollback y pruebas por cada accion nueva.
- Calibrar rate limits, alertas y metricas con trafico real antes del rollout total.

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

