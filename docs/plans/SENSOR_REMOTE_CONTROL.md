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

## Fases de implementacion

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

