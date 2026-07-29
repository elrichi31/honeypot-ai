# INTERNAL_SENSORS.md

Reutilizar los honeypots existentes como **sensores internos** (deception dentro
de la LAN corporativa) y rediseñar el modal de instalación por cliente en dos
categorías claras: **External Sensors** y **Deception Sensors**.

Extiende [`PLAN_DECEPTION.md`](PLAN_DECEPTION.md) (Track C: campo `layer`). Este
plan es la fuente de verdad para el trabajo de sensores internos.

Estado: **implementado (2026-07-01/02)** — ver §7 para el detalle de qué se hizo
y §8 para la deuda técnica pendiente.

---

## 0. Contexto y decisiones tomadas

### El problema que dispara esto
- Hoy el catálogo mezcla sensores externos (SSH, HTTP, FTP, MySQL, Port, SMB) con
  el "Deception Network (OpenCanary)" y un "Internal Canary" que estaba **roto**
  (no existía en `SERVICE_MAP`, generaba `ENABLED_COMPOSE_SERVICES` vacío).
- Instalar deception levantaba 8-9 filas de sensor sin una separación mental clara
  entre "lo que mira internet" y "lo que mira la red interna".

### Cómo funciona hoy (verificado en código)
Dos mecanismos **independientes** marcan un sensor/evento como deception:

1. **Card en la vista de sensores** — se agrupa por `sensors.protocol = 'deception'`.
   Ver [sensors/page.tsx:157](../../apps/dashboard/app/sensors/page.tsx) y
   [DeceptionNetworkCard](../../apps/dashboard/components/sensors/deception-network-card.tsx).
2. **Kill chain / eventos de deception** — NO usa el protocolo. Filtra por
   `data->>'source' = 'opencanary'` en
   [deception.repository.ts:3](../../apps/ingest-api/src/modules/deception/deception.repository.ts).
   Los `protocol_hits` conservan su protocolo real (`ssh`, `mysql`, `smb`…).

**Consecuencia de diseño:** para que un honeypot propio (Impacket SMB, etc.) sea
un nodo interno correlacionable necesita:
- Heartbeat con `protocol: "deception"` → aparece en el card agrupado.
- Eventos con un marcador de capa interna → entran al kill chain.

Hoy ese marcador es `data.source = 'opencanary'`. Lo generalizamos a un campo
**`layer: "internal"`** más un `source` libre (ver §3), para no atarnos a
OpenCanary y poder incluir nuestros honeypots.

### Decisiones (confirmadas con el usuario 2026-07-01)
- **Topología: flexible.** El catálogo permite descargar cada sensor interno
  individualmente (1 VM = 1 servicio, IP real de la LAN) **y** un bundle
  multi-servicio para una sola VM (red Docker `10.0.1.0/24`). El cliente elige
  según su infra.
- **Motor: ambos.** Se reutilizan los honeypots propios (full-interaction:
  capturan credenciales, comandos, archivos) **y** se mantiene OpenCanary como
  nodo liviano para saturar la red con muchos trap-nodes baratos.

### Requisito de UI (imagen del usuario)
- Modal de instalación **más ancho** para ver mejor.
- Dos secciones: **External Sensors** y **Deception Sensors**.
- Cada sensor se puede descargar/bundlear según lo que el cliente quiera en su
  infra.

---

## 1. Arquitectura objetivo

```
                    INTERNET (DMZ)                         LAN CORPORATIVA (interna)
  ┌───────────────────────────────────┐        ┌────────────────────────────────────────┐
  │ External Sensors (layer=external) │        │  Deception Sensors (layer=internal)     │
  │                                   │        │                                          │
  │  cowrie SSH   :22                 │        │  10.0.1.10  SMB    (impacket, full)      │
  │  web-honeypot :80/:8443           │        │  10.0.1.11  MySQL  (mysql-hp, full)      │
  │  ftp-honeypot :21                 │        │  10.0.1.12  SSH    (cowrie, full)        │
  │  mysql-hp     :3306               │        │  10.0.1.13  HTTP   (web-hp, full)        │
  │  port-hp      :1433 …             │        │  10.0.1.2   fake-dc   (opencanary, lite) │
  │  smb-hp       :445                │        │  10.0.1.5   fake-intranet (oc, lite)     │
  └──────────────┬────────────────────┘        └──────────────────┬───────────────────────┘
                 │                                                 │
                 │  heartbeat: protocol=<real>                     │  heartbeat: protocol="deception"
                 │  events:    layer=external                      │  events:    layer=internal, source=<engine>
                 └──────────────────────┬──────────────────────────┘
                                        ▼
                                  [ ingest-api ]
                                        ▼
                    ┌───────────────────┴───────────────────┐
                    │  Sensors page:                         │
                    │   • External cards (por protocolo)     │
                    │   • DeceptionNetworkCard (agrupado)    │
                    │  Deception page: kill chain interno,   │
                    │   portscans, nodos — filtra layer=int  │
                    └────────────────────────────────────────┘
```

Cada **Deception Sensor** puede vivir:
- En su **propia VM** con IP real de la LAN (`install-sensor-<slug>-smb-internal.sh`
  en la VM `10.0.1.10`), o
- Junto a otros en **una VM** vía red Docker `deception_net` (bundle).

Ambos caminos producen el mismo heartbeat/eventos, así que la correlación es
idéntica.

---

## 2. El marcador `layer` (una sola fuente de verdad)

Un único env var recorre todo el stack:

```
SENSOR_LAYER = "external" (default) | "internal"
```

- **Heartbeat:** cuando `SENSOR_LAYER=internal`, el heartbeat manda
  `protocol: "deception"` (para el card agrupado) y añade `layer: "internal"`.
  El protocolo real se preserva en `data`/eventos.
- **Eventos (`protocol_hits`):** cada honeypot añade `"layer": "internal"` en el
  payload `data` del evento cuando corre en modo interno. El protocolo real
  (`smb`, `mysql`…) se mantiene en el campo `protocol`.

### Por qué un env var y no un tipo nuevo de sensor
KISS: los honeypots ya leen su config de env vars (`SENSOR_ID`, `SENSOR_NAME`,
`SENSOR_HOST`). Añadir `SENSOR_LAYER` es una línea por honeypot y cero cambios de
esquema en la tabla `sensors` para la ruta feliz (el `protocol=deception` ya
existe). El `layer` en `data` (JSONB) no necesita migración.

---

## 3. Backend — ingest-api

### T1. Heartbeat acepta y persiste `layer`
- [sensors.ts route] — schema Zod del heartbeat: añadir `layer: z.enum(['external','internal']).default('external')`.
- [sensors.service.ts / sensors.repository.ts] `upsertHeartbeat`: cuando
  `layer==='internal'`, forzar `protocol='deception'`. Guardar el protocolo real
  en una columna nueva `real_protocol` **o** en `data`. **Decisión:** columna
  `real_protocol text null` en `sensors` (migración Prisma) — la necesitamos para
  mostrar "SMB" / "MySQL" en el `DeceptionNetworkCard` en vez de un genérico.
- Migración: `ALTER TABLE sensors ADD COLUMN real_protocol text;` (idempotente,
  nullable — sin backfill obligatorio).

### T2. `SERVICE_MAP` gana los servicios internos
[sensors.service.ts:12](../../apps/ingest-api/src/modules/sensors/sensors.service.ts) —
el `redeemProvisionToken` mapea `serviceKey → contenedores`. Añadir claves
internas que reusan las mismas imágenes:

```ts
const SERVICE_MAP: Record<string, string[]> = {
  ssh:   ['cowrie', 'cowrie-beacon', 'vector'],
  http:  ['web-honeypot'],
  ftp:   ['ftp-honeypot'],
  mysql: ['mysql-honeypot'],
  port:  ['port-honeypot'],
  smb:   ['smb-honeypot'],
  // internos — misma imagen, distinto compose block con SENSOR_LAYER=internal
  'smb-internal':   ['smb-honeypot'],
  'mysql-internal': ['mysql-honeypot'],
  'ssh-internal':   ['cowrie', 'cowrie-beacon'],
  'http-internal':  ['web-honeypot'],
  deception:        ['opencanary-nodes'], // el bundle OpenCanary lite existente
}
```
(añadir también los `SENSOR_ID_*` que falten en `redeemProvisionToken`.)

### T3. Deception repo/service filtra por `layer`, no por `source`
[deception.repository.ts:3](../../apps/ingest-api/src/modules/deception/deception.repository.ts) —
generalizar:

```ts
// antes:  data->>'source' = 'opencanary'
// después: (data->>'layer' = 'internal' OR data->>'source' = 'opencanary')
```
Mantener el OR para compatibilidad con los eventos OpenCanary viejos que solo
tienen `source`. Nuevos honeypots internos mandan `layer=internal`.

### T4. Alerta de deception se dispara por `layer`
[protocol.ts:64](../../apps/ingest-api/src/routes/protocol.ts) —
`if (d.data?.source === 'opencanary')` → `if (d.data?.layer === 'internal' || d.data?.source === 'opencanary')`.

---

## 4. Sensores (Python) — añadir `SENSOR_LAYER`

Patrón idéntico en los 4 honeypots reutilizables. Ejemplo SMB
([config.py](../../sensors/smb-honeypot/honeypot/config.py) +
[ingest.py:80](../../sensors/smb-honeypot/honeypot/ingest.py)):

### T5. `config.py` de cada honeypot
```python
SENSOR_LAYER = os.getenv("SENSOR_LAYER", "external")
```

### T6. `ingest.py` — heartbeat y eventos
- `send_heartbeat`: si `SENSOR_LAYER == "internal"`, mandar
  `"protocol": "deception"`, `"realProtocol": "smb"`, `"layer": "internal"`.
  Si no, comportamiento actual.
- `send`/`_emit` (eventos): añadir `"layer": SENSOR_LAYER` dentro de `data`
  cuando sea internal.

Aplicar a: `smb-honeypot`, `mysql-honeypot`, `port-honeypot`, `ftp-honeypot`.
Para **cowrie** el heartbeat es `heartbeat.py` (ya lee `SENSOR_PROTOCOL` de env)
— añadir `SENSOR_LAYER` y la lógica equivalente en
[cowrie/heartbeat.py:21](../../sensors/cowrie/heartbeat.py). El web-honeypot
igual en su `ingest`.

> Nota DRY: los cuatro `ingest.py` comparten casi el mismo `send_heartbeat`. No
> se refactoriza aquí (fuera de alcance) pero el cambio es mecánico y idéntico;
> aplicarlo verbatim en cada uno. Ver [SENSOR_REALISM.md](SENSOR_REALISM.md) para
> la unificación futura.

---

## 5. Generador de compose/script — dashboard

### T7. `ServiceKey` y catálogo de bloques
[sensor-compose-blocks.ts:1](../../apps/dashboard/lib/sensor-compose-blocks.ts) —
limpiar el tipo (sacar `"internal-canary"` muerto) y añadir las claves internas:

```ts
export type ServiceKey =
  | "ssh" | "http" | "ftp" | "mysql" | "port" | "smb"     // external
  | "smb-internal" | "mysql-internal" | "ssh-internal" | "http-internal"  // internal single
  | "deception"                                            // opencanary lite bundle
```

- Borrar `INTERNAL_CANARY_TEMPLATE`, `internalCanaryBlock`, y toda la rama
  `internal-canary` de [sensor-compose-builder.ts](../../apps/dashboard/lib/sensor-compose-builder.ts)
  (código muerto tras el borrado del catálogo).
- Cada bloque interno = el bloque externo correspondiente + `SENSOR_LAYER: internal`
  + sin publicar puertos al host público (se exponen dentro de `deception_net` o
  directo en la VM interna). Reutilizar el template externo con un fill extra en
  vez de duplicar (DRY).

### T8. `parseServices` / filename
[install/route.ts:14](../../apps/dashboard/app/api/sensor/install/route.ts) —
`ALL_SERVICES` y `parseServices` deben conocer las claves internas. El sufijo de
archivo distingue `-internal` para que el cliente sepa qué VM recibe qué.

---

## 6. UI — rediseño del modal (el pedido visual)

[client-sensor-catalog.tsx](../../apps/dashboard/components/clients/client-sensor-catalog.tsx).

### T9. Modal más ancho + dos secciones
- `DialogContent`: `max-w-2xl` → **`max-w-4xl`** (más ancho, como pediste).
- Reestructurar el `CATALOG` con un campo `category: "external" | "deception"`.
- Renderizar **dos bloques** con encabezado:
  - **External Sensors** — SSH, HTTP, FTP, MySQL, Port, SMB. Multi-select →
    bundle `.sh` (comportamiento actual).
  - **Deception Sensors** — SMB interno, MySQL interno, SSH interno, HTTP interno,
    y "Deception Network (OpenCanary lite)". Cada uno se puede seleccionar para
    su propia VM; el bundle multi-servicio arma una sola VM con `deception_net`.
- Grid a `lg:grid-cols-3` dentro de cada sección para aprovechar el ancho.
- Un hint por sección explicando dónde se instala (DMZ vs LAN interna).

### T10. i18n
Todas las strings nuevas → `apps/dashboard/lib/i18n/dicts/` (English primero, luego
español). Archivo objetivo: `clients-detail.ts` / `sensors-core.ts` (mantener
<150 líneas por archivo; si crece, split `sensors-deception.ts`).

### T11. `DeceptionNetworkCard` muestra el protocolo real
Usar `real_protocol` (T1) para etiquetar cada nodo ("SMB", "MySQL") en vez de
mostrar todo como genérico.

---

## 7. Estado de implementación (2026-07-01)

Implementación completa en un único sprint. `tsc` pasa sin errores en ambos paquetes.

### Hecho

**Fase A — backend** (commit `a hacer`)
- [x] T1: `heartbeatSchema` acepta `layer` + `realProtocol`. `upsertHeartbeat` en el
  repo fuerza `protocol='deception'` y persiste `real_protocol` cuando `layer=internal`.
  Migración: `prisma/migrations/20260701000000_add_sensor_real_protocol/migration.sql`.
  Schema Prisma: `Sensor.realProtocol String? @map("real_protocol")`.
- [x] T3: `DECEPTION_FILTER` en `deception.repository.ts` ahora es
  `(data->>'layer' = 'internal' OR data->>'source' = 'opencanary')` — compatible
  con eventos OpenCanary legacy.
- [x] T4: `protocol.ts:64` — condición de alerta ampliada con `d.data?.layer === 'internal'`.

**Fase B — sensores Python**
- [x] T5+T6 para `smb-honeypot` y `mysql-honeypot`: `SENSOR_LAYER` leído de env
  en `config.py`; `send_heartbeat` manda `layer=internal` + `realProtocol`; `send`/`_emit`
  añade `"layer": "internal"` en `data` del evento.
  **Pendiente:** aplicar el mismo patrón a `ftp-honeypot` y `web-honeypot` (ver §8).

**Fase C — generador de compose**
- [x] T7: 4 bloques internos en `sensor-compose-blocks.ts`
  (`INT_SMB_TEMPLATE`, `INT_MYSQL_TEMPLATE`, `INT_SSH_TEMPLATE`, `INT_HTTP_TEMPLATE`)
  con `SENSOR_LAYER=internal`, red `deception_net`, sin port bindings al host.
  Funciones exportadas: `intSmbBlock`, `intMysqlBlock`, `intSshBlock`, `intHttpBlock`.
- [x] `ServiceKey` ampliado con `"int-smb" | "int-mysql" | "int-ssh" | "int-http"`.
- [x] T2: `SERVICE_MAP` en `sensors.service.ts` incluye `int-*` y `smb`/`deception`.
  `redeemProvisionToken` emite `SENSOR_LAYER=internal` y `SENSOR_ID_SMB` cuando
  algún servicio seleccionado es `int-*`.
- [x] T8: `parseServices` en `install/route.ts` usa `VALID_SERVICES` que incluye
  `int-*`; `sensor-compose-builder.ts` detecta `isInternal` y llama los bloques internos.

**Fase D — UI**
- [x] T9: `DialogContent` ampliado a `max-w-4xl`. Modal reestructurado con dos
  secciones separadas por `border-t`: **External Sensors** (grid `lg:grid-cols-3`,
  highlight cyan) y **Deception Sensors** (highlight fuchsia).
- [x] T10: 8 strings nuevas en `clients-detail.ts` (EN + ES):
  `clients.catalog.section.external`, `.external.hint`, `.section.deception`, `.deception.hint`.
- [x] T11: `real_protocol` threaded end-to-end (2026-07-02).
- [x] Cowrie `heartbeat.py`: `SENSOR_LAYER` añadido — heartbeat propaga `layer`/`realProtocol` cuando es interno (2026-07-02).
- [x] Toggle de capa en `/sensors` (2026-07-02): `SensorLayerFilter` + `searchParams.layer` en RSC.
- [x] T5+T6 ftp/web: `SENSOR_LAYER` aplicado a `ftp-honeypot` y `web-honeypot` (2026-07-02).
  - `ftp-honeypot/config.py`: `SENSOR_LAYER = os.getenv("SENSOR_LAYER", "external")`
  - `ftp-honeypot/ingest.py`: heartbeat añade `layer`/`realProtocol`; `send()` añade `layer` en `data`
  - `web-honeypot/app.py`: variable `SENSOR_LAYER`, heartbeat añade `layer`/`realProtocol`, evento añade `layer` vía spread condicional
  - `deception.repository.ts` `getNodes` SELECT incluye `real_protocol`, mapeado a `realProtocol`.
  - `DeceptionNode` type añade `realProtocol: string | null`.
  - `SensorRow` / `SensorResult` en `sensor-queries.ts` y `sensors.repository.ts` añaden el campo;
    `formatSensor` lo propaga; `sensors.repository.ts list()` SELECT incluye `s.real_protocol`.
  - `Sensor` interface en `services.ts` añade `realProtocol?: string | null`.
  - `DeceptionNetworkCard`: cada nodo muestra un badge de color con el protocolo real
    (`getMeta(node.realProtocol ?? node.protocol).label`).
  - `DeceptionNodesGrid`: badge de protocolo por card de nodo en la cabecera.

### Pendiente / deuda técnica → §8

---

## 7bis. Fix del instalador `int-*` (2026-07-28)

El instalador generado para `int-ssh`/`int-smb`/`int-mysql`/`int-http` **nunca
había producido un deploy que arrancara**. Salió a la luz al instalar la red
interna de un cliente real: `docker compose pull` moría con
`mapping key "vector" already defined`. Detrás de ese error había seis fallos
más encadenados — cada uno bloqueaba el arranque después de arreglar el
anterior:

1. **`vector` duplicado** — `INT_SSH_TEMPLATE` traía su propio servicio
   `vector` y `buildCompose` añadía otro a todo lo que no fuera
   `internal-canary`. YAML inválido: el compose ni se parseaba.
2. **`suricata` en un deploy LAN** — sin interfaz de internet que esnifar, y
   encima se enganchaba a la red `edge`.
3. **`deception_net` nunca declarada** — todos los servicios `int-*` la
   referencian, pero `buildNetworks` solo emitía `edge` salvo para
   `internal-canary`.
4. **Volúmenes sin declarar** — `cowrie_var`, `smb_share`, `smb_captures`, etc.
   se montaban sin existir en el bloque `volumes:` de nivel superior.
5. **`{{registry}}/cowrie-beacon:latest` no existe** — ninguna imagen con ese
   nombre se construyó ni publicó jamás (no hay `sensors/cowrie-beacon/`).
6. **Sin puertos publicados** — ningún `int-*` mapeaba puertos al host, así que
   los honeypots eran inalcanzables desde la LAN corporativa, que es su única
   razón de existir.
7. **Eventos que se perdían en silencio** — `int-smb`/`int-mysql`/`int-http` no
   montaban volumen de eventos y el `vector` de `int-ssh` no cargaba ninguna
   config. El fallo silencioso exacto que documenta
   [sensor-event-shipping.md](../../project-notes/sensor-event-shipping.md).

**Fix aplicado:**

- `vectorBlock(services, deployId, { internal })` es ahora el único generador de
  vector para ambas topologías: mismo cableado de shippers, pero sobre
  `deception_net` y sin suricata cuando es interno. Se borró el vector a medias
  de `INT_SSH_TEMPLATE`.
- `buildNetworks`/`buildVolumeLines` reconocen la topología `int-*` (bridge
  `deception_net` + los volúmenes que cada nodo monta de verdad).
- El beacon de `int-ssh` pasa a `python:3.12-alpine` + scripts montados, el
  mismo patrón del bloque `ssh` externo, con `SIGNAL_DIR`/`cowrie_signal` para
  que el auto-enroll de credencial sobreviva un recreate (era la deuda anotada
  en SENSOR_REMOTE_CONTROL para `ic-cowrie-beacon`).
- Puertos publicados: 22 (ssh), 445 (smb), 3306 (mysql), 80 (http). `int-ssh`
  ahora también dispara el paso de mover el sshd del host a 8022, igual que el
  `ssh` externo, o el contenedor no puede bindear el 22.
- Volúmenes de eventos + configs de shipper (`cowrie.toml`, `protocol.toml`,
  `web-honeypot.toml`) descargados y montados según los nodos elegidos.
- El instalador ya no anuncia "+ Suricata IDS" en deploys internos.

`smb-honeypot` se había agregado a `publish-sensor-images.yml` el mismo día
(Fase 0 de [SENSOR_FLEET_UPDATES](../SENSOR_FLEET_UPDATES.md)); `int-smb` lo
consume por registry, así que esa imagen ya existe.

**Verificación:** las 6 combinaciones (externa completa, externa+deception,
canary, y tres variantes `int-*`) generan compose que `docker compose config`
valida, y scripts que pasan `bash -n`. Tres tests nuevos en
`sensor-compose-builder.test.ts` blindan el vector único, las redes/volúmenes
declarados y la ausencia de la imagen fantasma. Suite del dashboard 77/77,
`tsc` limpio.

**Pendiente:** el control plane (`config.apply`) sigue fuera de alcance para
nodos internos.

### 2026-07-28 — primer deploy real `int-ssh + int-http + int-smb` (IST AMERICAS)

Primer `int-*` desplegado end-to-end en una VM. `int-ssh` levantó y apareció en
`/deception`; los otros dos crash-loopearon, cada uno por su causa:

- **`int-http`**: al `INT_HTTP_TEMPLATE` le faltaba el `cap_add`
  (CHOWN/SETUID/SETGID) que el bloque `http` externo sí tiene. `cap_drop: ALL`
  de `service-defaults` mata el `chown` + `gosu` de `entrypoint.sh`
  (`Operation not permitted` en loop). Arreglado + test de regresión que cubre
  `http` e `int-http` a la vez.
- **`int-smb`**: `ModuleNotFoundError: control_agent`. Causa raíz en
  `publish-sensor-images.yml`: el contexto de build es `sensors/<svc>`, así que
  `sensors/_shared/*.py` nunca entra a la imagen. Afecta a **todas** las
  imágenes publicadas de ftp/mysql/port/smb/web, no solo smb — los deploys por
  compose no lo notaban porque bind-montean `_shared` en runtime, y el bloque
  SMB externo lo esquivaba buildeando desde fuente con `ADD` explícitos. Fix:
  un step que copia `_shared/*.py` al contexto antes del build (se descartan
  los compose files intactos; el checkout de CI es desechable).

Requiere re-publicar imágenes. Ojo: el workflow filtra por `paths: sensors/**`,
así que un fix que no toca `sensors/` **no lo dispara** — hay que lanzarlo a
mano con `workflow_dispatch`.

Dos bugs más del instalador que salieron del mismo deploy, ambos en
`SSH_PORT_STEP`:

- **Lockout por IPv6-only.** El override de `ssh.socket` usaba
  `ListenStream=8022` pelado. En un host con `bindv6only=1` eso bindea solo
  IPv6: Cowrie se queda con el 22, sshd responde en `[::]:8022` y nada en
  `0.0.0.0:8022`, así que todo cliente IPv4 recibe "Connection refused". El
  host quedó accesible solo por consola del hipervisor. Ahora se declaran las
  dos familias explícitas.
- **La verificación no lo detectaba.** Buscaba `:8022 ` en `ss`, patrón que un
  listener IPv6-only matchea — el instalador imprimía "sshd is now on port
  8022" sobre una máquina inalcanzable, en vez de disparar el rollback. Ahora
  exige un listener IPv4 (`0.0.0.0:8022` o `*:8022`).
- **Backup pisado en la segunda corrida.** El guard era "¿hay algo en el 22?",
  y en un re-run ese algo es Cowrie, así que el paso corría de nuevo y copiaba
  el `sshd_config` ya modificado sobre `sshd_config.pre-honeypot`. El backup
  del original se perdía y `sensor-uninstall` no podía devolver el sshd al 22.

### 2026-07-28 — IP LAN de los nodos + borrado desde `/deception`

Con los tres nodos ya reportando salió que los tres mostraban **la misma IP
pública** (la del NAT del sitio): correcta, pero no distingue un nodo de otro
ni dice en qué máquina corre cada uno. El contenedor no puede averiguarla solo
— en `deception_net` únicamente se ve a sí mismo como `172.x`.

Solución: el instalador la resuelve de la ruta por defecto y la pasa como
`SENSOR_LOCAL_IP`; el heartbeat la manda como `localIp` **junto a** la pública,
no en su lugar. Columna nueva `sensors.local_ip` (migración
`20260728000000_add_sensor_local_ip`), y el upsert conserva el último valor
conocido cuando late un sensor anterior al campo. `sensor-update` también
exporta la variable, si no un update la borraba.

En el front: la tarjeta de `/sensors` reusa el par de celdas interna/externa
que ya existía para sensores con IP privada, y la de `/deception` suma una
línea `LAN`. Las tarjetas de `/deception` además ganaron el botón de borrado
(mismo diálogo que `/sensors`, extraído a `delete-sensor-dialog.tsx`), porque
un reinstall cambia el `deployId` y deja el nodo anterior colgado en offline.

Requiere: migración aplicada en el API, imágenes republicadas (web, smb, mysql)
y reinstalar el sensor para que el compose lleve la variable.

### 2026-07-28 — `sensor-update` ahora sí actualiza todo

Cerrada la deuda de arriba. El instalador escribe `/opt/honeypot-sensor/.sensor-meta`
(deployId, services, cliente, URL y secreto de ingest; `chmod 600`) y
`sensor-update` pide el compose regenerado **con ese mismo deployId** — uno
nuevo renombraría todos los sensores del host y dejaría las filas viejas
huérfanas.

El generador vive en el dashboard, al que los sensores no llegan (solo se
publica el ingest-api), así que `ingest-api` hace de puente por la red interna:
`GET /sensor/compose` → `DASHBOARD_INTERNAL_URL/api/sensor/compose/refresh`.
Autentica con el secreto compartido de ingest, que el que llama ya tiene y que
el propio compose contiene, así que no habilita nada nuevo.

Toda ruta de fallo conserva el compose que funciona: servidor caído, 401, o un
cuerpo que no pasa `docker compose config` avisan y siguen con el `pull`. Los
sensores instalados antes de esto imprimen una nota y no se rompen.

De paso, la búsqueda de la IP LAN lleva `|| true`: con `pipefail`, un host sin
ruta a 1.1.1.1 abortaba el script entero — justo la LAN aislada donde vive un
nodo `int-*`. Salió de ejercitar el `sensor-update` generado contra un servidor
de prueba, rama por rama (nuevo / igual / inválido / inalcanzable / sin meta).

Requiere `DASHBOARD_INTERNAL_URL` en el `ingest-api` (ya en
`docker-compose.prod.platform.yml`, default `http://honeypot-dashboard:4000`).

**Gotcha que costó una vuelta:** `proxy.ts` (el middleware de Next, renombrado)
redirige a `/login` todo lo que no traiga cookie de sesión. La ruta nueva no
estaba en `PUBLIC_PATHS`, el `fetch` del ingest-api siguió el redirect, y el
sensor recibió la página de login como 200 y se la pasó a `docker compose
config`. **Toda ruta nueva que consuman los sensores tiene que ir a esa lista.**
Ahora el proxy no sigue redirects y un cuerpo que arranca con `<` se rechaza.

### 2026-07-28 — `sensor-update` cubre la instalación entera

El compose era solo una parte de lo que el instalador deja en el host. Los
archivos que se montan dentro de los contenedores quedaban congelados en la
versión instalada —incluido `heartbeat.py` de cowrie, que **es** el sensor
`int-ssh`— y lo mismo los helpers, así que un `sensor-update` mejorado no podía
instalarse a sí mismo.

El servidor ahora sirve además un manifiesto (`kind=files`) de todo lo demás que
la instalación posee, y cada helper bajo demanda (`kind=helper&name=`), por la
misma ruta. `sensor-update` lo recorre: descarga a un staging, valida (`bash -n`
para los helpers, no-vacío para el resto), reemplaza **con `mv`** y reinicia los
contenedores solo si cambió un bind-mount — `up -d` no ve ese cambio. El `mv` no
es cosmético: `sensor-update` está en esa lista y bash lee el script mientras lo
ejecuta.

Los configs siguen viniendo del host público y los helpers del ingest-api; el
token se aplica por URL, así que el host público nunca lo ve (verificado).

**Lo que todavía pide reinstalar:** cambiar qué servicios corren en un host
(`SERVICES` es fijo en `.sensor-meta`), y los pasos de host (sshd, docker, ufw).
Un archivo *nuevo* agregado al manifiesto también necesita una reinstalación,
porque el `sensor-update` viejo no lo conoce — pero a partir de ahí se
autoactualiza.

## 8. Deuda técnica y fuera de alcance

| Ítem | Descripción |
|------|-------------|
| **Refactor DRY `send_heartbeat`** | Cada sensor duplica el bloque de `send_heartbeat`. Extraer a una función compartida en `sensors/lib/ingest_base.py` (→ iniciativa SENSOR_REALISM). |
| ~~**Toggle External/Internal/All en `/sensors`**~~ | ✅ Implementado 2026-07-02: `SensorLayerFilter` (client component, botones segmentados) + `searchParams.layer` en `SensorsPage` filtra `external` / `internal` / all. Strings en `sensors-core.ts`. |
| **macvlan real** | Hoy "1 VM = 1 servicio" da IP LAN real. macvlan permitiría N servicios por VM con IPs distintas; dejado para cuando la demanda de densidad lo justifique. |
| **Migración en prod** | La migración `20260701000000` debe aplicarse con `prisma migrate deploy` o el SQL directo en el ambiente de prod/pgbouncer. `DIRECT_DATABASE_URL` debe estar seteado en el entorno CI/CD. |
