# SENSOR_IDENTITY — IDs únicos de sensor + enlace Application/Client

> Estado: **implementado fases 0-3** (2026-06-27), Fase 0 verificada 2026-07-07.
> Fase 4 (verificación E2E en producción) pendiente — ver nota de cierre abajo.
>
> Reestructura cómo se identifican los sensores y a quién pertenecen. Reemplaza
> el `SENSOR_ID` derivado por-protocolo por un UUID único por instalación, e
> introduce la **Application** como dueño por defecto cuando un sensor no se
> enlaza a un cliente.

---

## Problema actual

Hoy el `SENSOR_ID` se **hornea** en el redeem del token de provisión
([sensors.service.ts:163-174](../../apps/ingest-api/src/modules/sensors/sensors.service.ts#L163-L174))
como `cowrie-01-${code}`, `web-01-${code}`, etc. — protocolo + un `01` fijo + el
`code` del cliente. Tres consecuencias:

1. **No se pueden tener dos sensores del mismo protocolo en un cliente.** Dos SSH
   del mismo cliente generan el mismo `sensor_id` y el `ON CONFLICT (sensor_id)
   DO UPDATE` del upsert
   ([sensors.repository.ts:50-59](../../apps/ingest-api/src/modules/sensors/sensors.repository.ts#L50-L59))
   los fusiona en una sola fila.
2. **Provisión siempre exige `clientId`.** `POST /sensor/tokens`
   ([sensor-provision.ts:14-18](../../apps/ingest-api/src/routes/sensor-provision.ts#L14-L18))
   requiere `clientId`; no existe el camino "instalar sin cliente todavía".
3. El sensor no está enlazado a **nada** si no hay cliente; queda `client_id NULL`
   sin un dueño explícito.

Lo que **sí** sirve y se conserva: `assignClient`
([sensors.service.ts:79-113](../../apps/ingest-api/src/modules/sensors/sensors.service.ts#L79-L113))
ya permite enlazar `null → cliente` tarde y **bloquea** mover entre clientes
(delete + recreate). Esa regla se mantiene, adaptada al nuevo modelo.

---

## Decisiones de diseño (cerradas)

| Decisión | Elección |
|---|---|
| **Identidad del sensor** | `sensor_id` = **UUID/ULID puro**, único por instalación. La legibilidad la lleva el `name` (display name) del sensor. |
| **Dueño por defecto** | Una sola **Application** (este deployment), con `application_id` **fijo por env/seed**. Es el dueño cuando no hay cliente. |
| **Pertenencia** | Un sensor pertenece a la **Application** O a un **Client** (exclusivo, nunca ambos). Mover a Client lo saca de Application; reasignable más tarde. |
| **Instalación** | El instalador **pregunta el ClientID** para enlazar. Si no se da, enlaza a la Application automáticamente. |
| **Compatibilidad** | Los `sensor_id` viejos derivados (`cowrie-01-CODE`) **se quedan intactos**. El esquema único aplica solo a instalaciones nuevas. Sin backfill de datos históricos. |

### Modelo mental

```
Application (1, fija por deployment: APPLICATION_ID)
  └── sensores sin cliente  (owner_type=application)
Client (N, tenants reales)
  └── sensores del cliente  (owner_type=client, client_id=...)

Un sensor: owner_type ∈ {application, client}
  - nace en application (si install no recibe ClientID)
  - se puede reasignar application → client (una vez; mover client→client sigue bloqueado)
```

---

## Cambios de datos

### Nueva tabla `applications` (singleton lógico)

```sql
CREATE TABLE applications (
  id          TEXT PRIMARY KEY,           -- el APPLICATION_ID fijo del deployment
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- Se **seedea** una fila en la migración usando el valor de `APPLICATION_ID`
  (env del deployment). Si el env no está, se usa un default estable documentado.
- Una sola fila esperada; no se expone CRUD de applications en esta fase.

### `sensors`: dueño explícito

```sql
ALTER TABLE sensors
  ADD COLUMN application_id TEXT REFERENCES applications(id),
  ADD COLUMN owner_type     TEXT NOT NULL DEFAULT 'application';
                            -- 'application' | 'client'
```

- Invariante: `owner_type='client'  ⟺ client_id IS NOT NULL`,
  `owner_type='application' ⟺ application_id IS NOT NULL AND client_id IS NULL`.
- **`client_id` sigue siendo la fuente de scoping de tenant** (todo el roadmap
  multi-tenant filtra por `sensor_id` → `client_id`; no cambia). La Application
  no participa del scoping de clientes: un sensor en Application simplemente no
  pertenece a ningún tenant todavía (igual que el `client_id NULL` de hoy, pero
  ahora con dueño explícito).
- Filas viejas: las que ya tienen `client_id` → `owner_type='client'` en la misma
  migración; las de `client_id NULL` → `owner_type='application'` +
  `application_id = APPLICATION_ID`.

### `sensor_provision_tokens`: cliente opcional

```sql
ALTER TABLE sensor_provision_tokens
  ALTER COLUMN client_id DROP NOT NULL;
```

- Token con `client_id` → el sensor nace enlazado a ese cliente.
- Token sin `client_id` → el sensor nace enlazado a la Application.

> Nota: confirmar el `NOT NULL` real de `client_id` en la migración
> `20260511100000_add_sensor_provision_tokens` antes de alterarla.

---

## Cambios de backend (`ingest-api`)

Todo SQL en repositorios (regla del repo). Capas: route (HTTP/zod) → service
(lógica) → repository (SQL).

### 1. Generación de `sensor_id` único
- En el **redeem** del token (`redeemProvisionToken`,
  [sensors.service.ts:149-177](../../apps/ingest-api/src/modules/sensors/sensors.service.ts#L149-L177)):
  dejar de emitir `SENSOR_ID_SSH=cowrie-01-CODE`. En su lugar **generar un UUID
  por cada servicio habilitado** del token y emitirlos:
  ```
  SENSOR_ID_SSH=<uuid>
  SENSOR_ID_HTTP=<uuid>
  ...
  ```
- Decisión de implementación: el UUID puede generarse en el redeem (servidor) y
  persistirse junto al token redimido, **o** dejar que el sensor lo genere en la
  primera ejecución y lo reporte en el heartbeat. **Preferido: generarlo en el
  servidor en el redeem** para que el operador/dashboard ya conozca el ID y el
  enlace (client/application) quede registrado desde el minuto cero, antes incluso
  del primer heartbeat. (Cierra el caso de "el sensor nunca llegó a latir".)

### 2. Provisión sin cliente
- `POST /sensor/tokens` (`sensor-provision.ts`): `clientId` pasa a **opcional**.
  - Con `clientId`: validar que el cliente existe (como hoy).
  - Sin `clientId`: el token queda asociado a la Application.
- `createProvisionToken` (`sensors.service.ts`): rama sin cliente → no busca
  cliente; marca el token como "application-owned".

### 3. Registro del sensor con dueño
- En el upsert del heartbeat (`upsertHeartbeat` /
  [sensors.repository.ts](../../apps/ingest-api/src/modules/sensors/sensors.repository.ts)):
  setear `owner_type` y `application_id`/`client_id` según el origen.
  - Si el sensor ya existe (heartbeat repetido), **no** revertir un enlace a
    cliente: `COALESCE` para no pisar `client_id` (ya lo hace hoy en L55).

### 4. Reasignación Application → Client (conservar regla actual)
- `assignClient` (`sensors.service.ts:79`): adaptar a `owner_type`.
  - `application → client`: permitido (set `client_id`, `owner_type='client'`,
    `application_id=NULL`).
  - `client → otro client`: **bloqueado** (igual que hoy, 409 "delete & recreate").
  - `client → application` (desenlazar): decidir si se permite. **Propuesta: sí**,
    para "sacar de un cliente" sin borrar el sensor (vuelve a Application).
- La UI de `/sensors` ya tiene el flujo de asignar cliente; solo cambia el estado
  "Unassigned" por "Application" como dueño explícito.

### 5. Listado de sensores
- `SensorRow` / `list()` (`sensors.repository.ts`): incluir `owner_type` y, si
  aplica, el nombre de la application, para que el dashboard distinga
  **Application** vs **Client X**.

---

## Cambios de instalación (sensores)

Hoy el flujo es: dashboard crea token → operador corre el sensor con el `.env`
generado por el redeem. El `SENSOR_ID` venía horneado; ahora viene como UUID.

- **`install.sh`** de cada sensor (`sensors/*/install.sh`): el flujo de copiar
  `vector.toml` + `docker compose up` no cambia. Lo que cambia es el **origen del
  `SENSOR_ID`**: ya no se deriva, se toma del `.env` que produjo el redeem.
- **Pregunta del ClientID en la instalación**: el ClientID se fija al **crear el
  token** (en el dashboard), no en el host del sensor. El instalador "pregunta"
  el cliente en el sentido de que el token lo lleva embebido. Si el operador
  quiere instalar sin cliente, crea el token sin `clientId` y el redeem enlaza a
  la Application.
  - (Alternativa futura, no en esta fase: un instalador interactivo que pida el
    ClientID por stdin y llame al API. Por ahora el token es el portador.)
- **`ingest.py.template`** ya lee `SENSOR_ID` por env
  ([ingest.py.template:22-23](../../sensors/_shared/ingest.py.template#L22-L23)) y
  lo manda en cada evento (`sensorId`). **No requiere cambios**: es agnóstico al
  formato del ID.

---

## Cambios de dashboard

- **`/sensors`**: mostrar el dueño como **Application** o **Client X** (no
  "Unassigned"). Acción "Asignar a cliente" disponible para sensores en
  Application; "Quitar de cliente" (→ Application) para sensores en Client.
- El **display name** del sensor cobra importancia (el ID ya no es legible):
  asegurar que la UI muestra el `name` como identificador primario y el `sensor_id`
  (UUID) como secundario/copiable.
- Strings nuevas: **inglés primero**, traducción vía dicts i18n
  (`apps/dashboard/lib/i18n/dicts/`). No hardcodear español.

---

## Fases

### Fase 0 — Schema ✅ (2026-06-27)
- [x] Migración `20260627000000_add_applications`: tabla `applications` + seed.
- [x] Migración `20260627000100_add_sensor_owner`: `sensors.owner_type` + `application_id`, backfill.
- [x] Migración `20260627000200_provision_tokens_optional_client`: `client_id` → nullable.
- [x] `schema.prisma` actualizado (modelo `Application`, relaciones, `clientId?` en tokens).
- [x] Aplicar migraciones en DB local y verificar backfill (2026-07-07).

### Fase 1 — Backend provisión + identidad ✅ (2026-06-27)
- [x] `clientId` opcional en `POST /sensor/tokens` (ruta + service).
- [x] Redeem genera UUID independiente por protocolo (`randomUUID()`), sin derivar del código.
- [x] `redeemProvisionToken` en repo usa `LEFT JOIN` a clients (soporta token sin cliente).

### Fase 2 — Registro y reasignación ✅ (2026-06-27)
- [x] `upsertHeartbeat` setea `owner_type` y `application_id` automáticamente.
- [x] `assignClient`: application→client (ok), client→client diferente (409), client→application (desenlazar, ok).
- [x] `list()` expone `owner_type`, `application_id`, `application_name` via LEFT JOIN.
- [x] `SensorResult` y `SensorRow` actualizados con los nuevos campos.

### Fase 3 — Dashboard ✅ (2026-06-27)
- [x] Tipo `Sensor` en `lib/api/services.ts` incluye `ownerType`, `applicationId`, `applicationName`.
- [x] `/sensors`: sensores sin cliente se agrupan como "Application" (con el nombre real de la app).
- [x] i18n: clave `sensors.application` en `sensors-core.ts` (EN + ES).

### Fase 4 — Verificación E2E
- Crear token sin cliente → instalar sensor → aparece bajo **Application**.
- Reasignarlo a un Client → aparece bajo ese cliente; su telemetría queda scopeada
  al tenant (verificar con el patrón del [MULTI_TENANT_ROADMAP](MULTI_TENANT_ROADMAP.md)).
- Crear dos tokens SSH para el mismo cliente → dos tarjetas de sensor distintas,
  sin fusión de sesiones.

**Nota de cierre (2026-07-07):** verificado en DB local que las migraciones
están aplicadas (`sensors.application_id`, `sensors.owner_type` con FK a
`applications`, índice `sensors_owner_type_idx`) y que el backfill es
consistente: 8 sensores `owner_type='client'` con `client_id` seteado y
`application_id` nulo, 1 sensor `owner_type='application'` con `application_id`
seteado y `client_id` nulo, sin filas huérfanas; `applications` tiene
exactamente el seed esperado (`default-application`); `sensor_provision_tokens.client_id`
es nullable a nivel de esquema. Esto satisface Fase 0 a nivel estructural.
Los 3 escenarios de Fase 4 requieren instalar sensores reales y observar
comportamiento end-to-end (creación de token, reasignación, no-fusión de
sesiones) — no son verificables contra el dataset sintético de este entorno
local. Quedan pendientes de producción; no bloquean el resto del plan.

---

## Verificación

- `cd apps/ingest-api && npm test` verde.
- `npx tsc --noEmit` en `ingest-api` y `dashboard` sin errores.
- DB local `honeypot_full`: backfill correcto, dos SSH del mismo cliente conviven.
- `docker compose -f docker-compose.prod.single-host.yml config --quiet`.

## Deploy

Cambios de **backend** → rebuild `ingest-api`; de **front** → `dashboard`. Como
hay **migración**, aplicar migraciones antes de levantar el API nuevo. Ver
[deploy-single-host-update](../../../) en memoria/notas.

---

## Relación con otros planes

- **Multi-tenant** ([MULTI_TENANT_ROADMAP.md](MULTI_TENANT_ROADMAP.md)): el scoping
  de tenant sigue derivando de `client_id` vía `sensor_id`. La Application **no**
  introduce un tenant nuevo; un sensor en Application simplemente no pertenece a
  ningún cliente (estado pre-asignación). No rompe el enforcement existente.
- **Remote control** ([SENSOR_REMOTE_CONTROL.md](SENSOR_REMOTE_CONTROL.md)): los
  comandos y configs se direccionan por `sensor_id`. Con IDs únicos, el direccionar
  un comando a "un SSH específico" entre varios del mismo cliente **por fin es
  posible** — antes era ambiguo.

## Decisiones abiertas (resolver al implementar)
- ¿`client → application` (desenlazar sin borrar) se permite? Propuesta: sí.
- ¿El UUID se genera en redeem (servidor) o en el sensor? Propuesta: en redeem.
- Default del `APPLICATION_ID` si el env no está en un deployment viejo.
