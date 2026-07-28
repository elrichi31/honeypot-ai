# SENSOR_FLEET_UPDATES - Actualización remota del software de sensores

## Estado actual (2026-07-28)

**Fase 0 implementada** (pendiente de desplegar y de verificar E2E en prod):

- `publish-sensor-images.yml` pasa `GIT_SHA=${{ github.sha }}` como build-arg,
  y **se agregó `smb-honeypot` a la matriz de publicación** (gap preexistente:
  el compose del instalador referencia `{{registry}}/smb-honeypot:latest` pero
  el workflow nunca lo publicaba).
- Los 8 Dockerfiles de sensores propios (cowrie, web, ftp, mysql, port, smb,
  suricata, opencanary) hornean `ENV SENSOR_IMAGE_VERSION=$GIT_SHA`
  (default `dev` en builds locales).
- Heartbeat reporta `imageVersion` en los 4 sensores con heartbeat in-image:
  **ftp, mysql, port, smb** (`honeypot/ingest.py` de cada uno, omitido si el
  env no está — imágenes viejas siguen funcionando).
- **cowrie y web NO reportan** (decisión): su heartbeat corre en un beacon
  (`python:3.12-alpine` stock) que no puede ver el env de la imagen del
  honeypot; el volumen `signal` va en dirección beacon→honeypot (en web es
  `:ro` del lado honeypot) y exponer la versión por HTTP delataría el
  honeypot. Los cubre el updater de Fase 1, que inspecciona digests reales
  via docker.sock — fuente más autoritativa que cualquier env.
- ingest-api: columna `sensors.image_version` (migración
  `20260728120000_add_sensor_image_version`, ADD COLUMN con default, segura),
  `imageVersion` en `heartbeatSchema` (`max(128)`, default `''`), upsert y
  `GET /sensors` lo exponen (`SensorRow.image_version` → `SensorResult.imageVersion`).
- Dashboard: la tarjeta de sensor muestra `image <sha7>` (sha completo en
  tooltip) junto al `v{version}` existente; clave i18n `sensors.card.image`.
- Verificado: `tsc --noEmit` limpio en ingest-api y dashboard, suite de
  ingest-api 190/190 en verde, `py_compile` de los 4 ingest.py.

Ajuste de alcance vs el borrador original de Fase 0: el semáforo
verde/amarillo ("al día con master") se movió a Fase 1 — requiere conocer el
último sha publicado (GHCR/GitHub API), que es exactamente la fuente de
"versiones disponibles" que Fase 1 construye. Fase 0 muestra el sha crudo.

**Para desplegar Fase 0:** aplicar la migración (`prisma migrate deploy`) y
republicar imágenes (el próximo push a `sensors/**` lo hace solo). Los
sensores ya desplegados muestran versión vacía hasta que su host haga pull
de la imagen nueva — hoy eso sigue siendo manual, es justo lo que Fase 1
automatiza.

**Siguiente paso:** Fase 1 (tabla `sensor_releases`, `GET /fleet/manifest`,
updater de host, endpoints de promoción, página Fleet updates).

## Contexto y problema

Hoy los sensores en clientes se instalan con el script generado por
`/api/sensor/install` (`lib/sensor-install-script.ts` + `lib/sensor-compose-builder.ts`):
un `docker-compose.yml` que referencia imágenes `ghcr.io/elrichi31/honeypot-ai/<svc>:latest`
publicadas por `publish-sensor-images.yml` (tags `:latest` + `:<sha>`).

**Actualizar hoy = SSH manual a cada host cliente y `docker compose pull && up -d`.**
Eso no escala: al lanzar una feature nueva de sensores no hay forma de subirla
a toda la flota.

El control plane existente (`SENSOR_REMOTE_CONTROL.md`) resuelve *config*
remota, no *software*: el `control_agent.py` corre **dentro** del contenedor y
no puede recrear su propio contenedor con una imagen nueva. La actualización de
software necesita un componente en el **host**, fuera de los contenedores.

## Por qué "actualización remota" daba miedo, y cómo se hace segura

El riesgo real es que "el dashboard puede ejecutar código en máquinas de
clientes" = RCE por diseño / supply chain. Se vuelve aceptable con estas reglas
(mismas que ya rigen el control plane):

1. **Pull, nunca push.** El host cliente solo hace conexiones salientes
   (registry + ingest-api). Cero puertos de entrada, igual que hoy.
2. **Catálogo cerrado.** El servidor nunca manda comandos ni scripts: solo un
   *manifiesto* declarativo ("la versión deseada de `cowrie` es el digest
   `sha256:...`"). El updater del host solo sabe hacer una cosa: `docker pull`
   de imágenes **dentro del namespace fijo** `ghcr.io/elrichi31/honeypot-ai/` y
   `docker compose up -d`. Un manifiesto que apunte fuera del namespace se
   rechaza.
3. **Digest pinning.** El manifiesto refiere digests inmutables (`@sha256:`),
   no `:latest`. Un tag puede ser re-apuntado por un atacante con acceso al
   registry; un digest no puede ser alterado sin cambiar el hash.
4. **Rollout controlado.** Publicar una imagen NO actualiza a nadie. El operador
   promueve una versión desde el dashboard, primero a un cliente canario y
   después al resto. Rollback = apuntar el manifiesto al digest anterior.
5. **Auditoría + confirmación.** Toda promoción queda auditada (quién, cuándo,
   qué digest, a qué clientes), y cada sensor reporta su versión corriendo en
   el heartbeat — el dashboard ve quién quedó desactualizado o falló.
6. **(Fase de hardening) Firma de imágenes.** `cosign` en CI firma cada imagen;
   el updater verifica la firma antes de correr. Cubre el escenario de registry
   comprometido.

Con esto el "botón de actualizar" no ejecuta nada arbitrario: mueve un puntero
versionado, auditado, dentro de un catálogo cerrado, que el cliente consume
por pull.

## Arquitectura

```
CI (publish-sensor-images.yml)
  push a master → build → push :latest, :<sha> (+ digest)
       |
       v
Dashboard: página "Fleet updates"
  ve versiones disponibles (GHCR) y versión corriendo por sensor (heartbeat)
  [Promote] → PUT /fleet/releases  (canario o todos)
       |
       v
ingest-api
  guarda release deseado por servicio (+ overrides por cliente)
  GET /fleet/manifest  → { cowrie: "ghcr.io/...@sha256:...", ... }  (autenticado)
       |
       ^ (pull, saliente)
       |
updater en host cliente (contenedor con docker.sock, o systemd timer)
  cada N min: fetch manifest → compara digests corriendo vs deseados
  → docker pull (solo namespace propio) → docker compose up -d <svc>
  → reporta resultado a ingest-api
```

## Fases

### Fase 0 — Versión visible en la flota (prerequisito, chica)

Sin esto no se puede operar ninguna actualización: hay que saber qué corre cada uno.

- `publish-sensor-images.yml`: pasar `GIT_SHA` como build-arg; los sensores lo
  exponen como env `SENSOR_IMAGE_VERSION`.
- Heartbeat reporta `imageVersion`; ingest-api lo persiste junto al sensor.
- Dashboard: columna de versión en la vista de sensores (verde = al día con
  `master`, amarillo = atrasado).

Criterio de salida: el dashboard muestra qué sha corre cada sensor de cada cliente.

### Fase 1 — Updater pull-based con manifiesto (el corazón)

- **Tabla `sensor_releases`**: servicio, image digest, canal (`canary`/`stable`),
  promovido por quién, cuándo. Overrides por cliente opcionales (columna
  `client_id` nullable).
- **`GET /fleet/manifest`** en ingest-api, autenticado con `INGEST_SHARED_SECRET`
  (mismo boundary que el resto de endpoints de sensores). Devuelve digests
  deseados para los servicios del deploy que pregunta.
- **Updater de host**: contenedor mínimo (`docker:cli` + shell script, o Python
  slim) con `/var/run/docker.sock` montado, agregado al compose del instalador
  (`sensor-compose-builder.ts`). Loop cada 10 min:
  1. fetch manifest;
  2. valida que toda imagen esté en el namespace `ghcr.io/elrichi31/honeypot-ai/`
     (rechaza y loggea si no);
  3. si el digest corriendo difiere: `docker compose pull <svc>` +
     `docker compose up -d <svc>`;
  4. POST resultado (ok/fail + digest) a ingest-api.
  - El updater se actualiza a sí mismo igual que a los demás (es un servicio
    más del manifiesto), con la salvedad de que Docker recrea el contenedor
    que lanzó el `up -d` — probar ese caso explícitamente.
- **Endpoints de promoción** (`PUT /fleet/releases`), rol `admin`, auditados
  con el patrón `ControlActor` ya existente del control plane.
- **UI**: página "Fleet updates" — versiones disponibles (últimos shas de
  master), versión deseada por canal, matriz cliente×servicio con la versión
  corriendo, botones Promote / Rollback (rollback = promote del digest anterior).

Criterio de salida: promover una versión desde el dashboard actualiza un
sensor de un cliente real sin SSH, y el dashboard confirma la nueva versión
vía heartbeat.

### Fase 2 — Rollout seguro

- **Canario**: la promoción por defecto va al canal `canary` (tus propios
  sensores o un cliente designado); promoción a `stable` es un segundo paso
  explícito.
- **Salud post-update**: si tras actualizar un servicio el contenedor no queda
  `running` (o no vuelve el heartbeat en N min), el updater revierte solo al
  digest anterior (guarda el último digest bueno localmente) y reporta `failed`.
  Mismo patrón heartbeat-confirma que ya usa `config.apply`.
- **Ventana de actualización** opcional por cliente (ej. solo de madrugada).

### Fase 3 — Hardening supply chain (cuando haya clientes de pago suficientes)

- `cosign` keyless en CI firmando cada imagen; el updater verifica firma antes
  de `up -d`.
- Alerta en el dashboard si un sensor lleva >24h sin poder aplicar el
  manifiesto (host caído, registry inaccesible, digest rechazado).

## Fuera de alcance

- Actualizar el `docker-compose.yml` en sí (puertos nuevos, servicios nuevos,
  env vars nuevas). Eso sigue siendo re-correr el instalador. El updater solo
  cambia **imágenes** de servicios ya desplegados. Si una feature necesita
  compose nuevo, se documenta como "requiere reinstalación" — aceptable y
  mucho más simple que un motor de migración de composes.
- Hosts sin Docker / la OVA (`build-sensor-ova.yml`): la OVA corre compose
  igual, el updater aplica; cualquier otra topología queda fuera.
- Push/SSH desde el servidor hacia clientes: nunca.

## Decisión descartada: Watchtower

Watchtower (contenedor off-the-shelf que auto-pullea `:latest`) daría
actualización con cero código, pero: (a) todos los clientes se actualizan en
cuanto CI publica, sin canario ni rollout controlado; (b) sigue tags mutables,
no digests; (c) no reporta al dashboard. Para una flota comercial el control
de rollout es el requisito, así que se va directo al manifiesto propio. Si se
quisiera un puente inmediato mientras se implementa Fase 1, Watchtower
etiquetado por-servicio es el atajo, pero es deuda que después hay que sacar.
