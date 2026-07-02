# CORRELATION_ALERTS.md

Plan para **tres alertas correlacionadas nuevas** que detectan comportamiento
de reconocimiento/campaña de una misma IP a lo ancho de la superficie de
honeypots, dentro de una ventana corta:

1. **`sensorSweep`** — una IP tocó **≥N sensores** distintos **y/o ≥N familias
   de protocolo** en poco tiempo (barrido de superficie).
2. **`portScanFanout`** — una IP tocó **≥N puertos** distintos en la ventana
   (escaneo de puertos / recon).
3. **`credReuseCrossSensor`** — las **mismas credenciales** aparecen probadas en
   **≥N sensores** distintos (credential stuffing dirigido, no un solo servicio).

Estado: **implementado** (backend + config + UI + tests unitarios), pendiente
de deploy/observación en prod. Diseño original: 2026-07-02. Implementación:
2026-07-02 (mismo día, sin commit todavía — ver §8 "Estado de implementación"
para detalle y deuda técnica).

---

## 0. Contexto: cómo funcionan las alertas hoy

Dos motores conviven en [`apps/ingest-api/src/lib/threat-alerts.ts`](../../apps/ingest-api/src/lib/threat-alerts.ts):

### Motor por-IP (cola + cron drain) — donde entran estas 3 alertas
- El hot-path de ingest llama `scheduleThreatAlert(prisma, ip)` → mete la IP en
  un `Set` (`pendingThreatIps`), O(1), sin I/O. Lo llaman ingest de eventos SSH,
  web y protocolo (`kafka-consumer.ts`, `routes/ingest.ts`, `routes/web.ts`,
  `routes/protocol.ts`).
- Un cron (`cron.ts`) llama `drainThreatQueue(prisma)`, que toma hasta
  `MAX_DRAIN_BATCH=60` IPs y evalúa hasta `MAX_CONCURRENT_EVALUATIONS=3` a la vez.
- `evaluateThreatAlert(prisma, ip)` corre **~11 queries agregadas** en paralelo
  (`querySshAggregate`, `queryProtocolAggregate`, `queryRecentProtocolAggregate`,
  etc.) y arma un `AlertContext`, luego pasa por una lista de `checks`.
- Cada check es una función pura en
  [`threat-checks.ts`](../../apps/ingest-api/src/lib/threat-checks.ts) que
  devuelve `AlertPayload | null`. Si no-null y pasa el filtro de nivel/config,
  se envía con `sendAlertOnce`.
- `sendAlertOnce` → `shouldSendAlert` (cooldown en tabla `threat_alert_cooldown`,
  keyed por `payload.key`) → `persistAlert` (fila en tabla `alert` + emit SSE) →
  Discord + CrowdStrike.

### Alertas per-evento (fuera de este plan)
`canaryReplay`, `deceptionInteraction`, `sensorOffline` — se disparan directo
sin cola. No las tocamos.

### El gap central
Las queries de agregación agrupan por **`protocol`**, **nunca por `sensor_id`**.
La alerta `multiService` cuenta *familias de protocolo* (`ssh`, `http`,
`mysql`…), no *sensores físicos*. Por eso:

- Dos sensores del **mismo protocolo** (p. ej. dos `cowrie` en dos VPS, o dos
  `mysql-honeypot`) que reciben la misma IP → **hoy no disparan nada** de
  correlación de superficie.
- `credentialReuse` se calcula "misma cred en ≥2 **protocolos**", nunca "misma
  cred en ≥2 **sensores**".

Estas tres alertas cierran ese gap operando sobre `sensor_id`.

---

## 1. De dónde sale `sensor_id` (verificación de esquema)

`sensor_id` está presente en las tres tablas de actividad que la evaluación ya
consulta por `src_ip`. Confirmar con Prisma schema antes de escribir SQL, pero
según los shippers y las queries existentes:

- **`sessions`** (cowrie ssh/telnet) → tiene `sensor_id` (lo usa
  `resolveClientId`: `JOIN sensors sen ON sen.sensor_id = s.sensor_id`).
- **`protocol_hits`** (dionaea, mysql, smb, ftp, port-honeypot) → tiene
  `sensor_id`, `dst_port`, `protocol`, `username`, `password`, `event_type`,
  `timestamp`.
- **`web_hits`** (vector/web) → verificar si tiene `sensor_id`; si no, su
  contribución a "sensores tocados" se cuenta como un sensor lógico `web` (ver
  §3.1, decisión de fallback).
- **`events`** (cowrie, ligado a `sessions` por `session_id`) → `src_ip`,
  `event_ts`, `event_type`, `username`, `password`, `command`. El `sensor_id`
  se obtiene vía la `session`.

> ⚠️ **Acción previa obligatoria**: leer
> `apps/ingest-api/prisma/schema.prisma` y confirmar los nombres exactos de
> columna (`sensor_id` vs `sensorId`, presencia en `web_hits`). El SQL de este
> plan asume snake_case porque el resto de `threat-queries.ts` usa `$queryRaw`
> con snake_case. Ajustar si difiere.

---

## 2. Principio de diseño (KISS / DRY)

- **Una sola query nueva** que devuelva, por IP y ventana, las tuplas
  `(sensor_id, protocol, dst_port)` + credenciales, y derivar en TS las tres
  señales. Evita 3 queries redundantes que recorren las mismas tablas.
- **Reusar** la infraestructura existente: mismo `AlertContext`, mismo
  `contextFields`, mismo `sendAlertOnce`, mismo patrón `check*` → `AlertPayload`.
  No inventar un motor nuevo.
- **Reusar** el mecanismo de config toggle (`alertEnabledTypes`) para poder
  activar/desactivar cada alerta desde Settings, igual que las 6 actuales.
- Umbrales como **constantes nombradas** en `threat-checks.ts` (junto a
  `deriveMultiServiceLevel`), no mágicos inline.

---

## 3. Diseño por alerta

### 3.1 `sensorSweep` — barrido de sensores (ambas señales)

**Señal**: en la ventana reciente, `COUNT(DISTINCT sensor_id) ≥ SWEEP_MIN_SENSORS`
**O** `COUNT(DISTINCT protocol_family) ≥ SWEEP_MIN_FAMILIES`. La severidad es el
**mayor** de los dos ejes (una IP en 5 sensores es peor que en 2).

**Ventana**: 10 minutos (consistente con `multiService`).

**Derivación de nivel** (nueva función `deriveSweepLevel` en `threat-checks.ts`):

```
sensorsSeen  familiesSeen   → nivel
≥5           o ≥4           → CRITICAL
≥3           o ≥3           → HIGH
≥2 (2 sensores distintos)   → HIGH   (2 honeypots ya es correlación real)
si no                       → null
```

Nota: `≥2 sensores` dispara aunque sean el mismo protocolo — ese es el caso que
`multiService` **no** cubre y la razón de que exista esta alerta. Ajustar los
números tras ver datos reales (arrancar conservador para no floodear).

**Relación con `multiService`** (evitar ruido duplicado): `multiService` seguirá
existiendo tal cual. Para no mandar dos Discord casi idénticos cuando la señal es
puramente "varias familias, un solo sensor", `sensorSweep` **solo aporta valor
nuevo cuando `sensorsSeen ≥ 2`**. Decisión: `sensorSweep` dispara si
`sensorsSeen ≥ 2` (independiente de familias); el eje de familias solo **eleva la
severidad**, no es condición suficiente por sí solo (esa parte ya la cubre
`multiService`). Esto mantiene las dos alertas complementarias, no solapadas.

**Cooldown key**: `sensor_sweep:${ip}`.

**Campos del payload** (`AlertPayload.fields`):
- IP, Sensors hit (`sensorsSeen`), Service families (`familiesSeen`), Window
  ("Last 10 minutes"), `...contextFields(ctx)`.
- "Sensors" → lista de `sensor_id` (hasta ~8, truncar).
- "Families" → lista de protocolos.
- Si `credentialReuse` cross-sensor → línea de refuerzo.

**Título/descripción**:
- title: `"Sensor sweep detected"`
- desc: ``Attacker `${ip}` touched ${sensorsSeen} sensors across ${familiesSeen} service families in the last 10 minutes.``

### 3.2 `portScanFanout` — barrido de puertos

**Señal**: `COUNT(DISTINCT dst_port) ≥ FANOUT_MIN_PORTS` en la ventana. Los
puertos salen de `protocol_hits.dst_port` (+ puerto web/ssh si aplica). Hoy
`uniquePorts` ya se calcula en `summarizeProtocols` pero **solo alimenta el risk
score**; esto lo promueve a alerta propia.

**Ventana**: 10 minutos.

**Derivación** (`derivePortFanoutLevel`):
```
distinctPorts ≥ 15 → CRITICAL
distinctPorts ≥ 8  → HIGH
si no              → null
```

**Cooldown key**: `port_fanout:${ip}`.

**Campos**: IP, Distinct ports (`distinctPorts`), Window, `contextFields`, lista
de puertos (hasta 15, truncada, ordenada). Si además `sensorsSeen > 1`, añadir
"Across N sensors".

**Título**: `"Port-scan fan-out detected"` / desc con nº de puertos.

**Cuidado con el ruido**: un solo sensor multi-puerto (dionaea escucha ~10
puertos, port-honeypot ~10) puede inflar `distinctPorts` con un solo `connect`
por puerto. Por eso el umbral HIGH arranca en 8 y **debería exigir señal de
escaneo real** (varios `connect_events`), no un único toque. Decisión: contar un
puerto solo si tuvo `connect`/`auth`/`command` (ya es el caso, son las filas de
`protocol_hits`). Revisar con datos reales si hay que subir el umbral o exigir
`≥2 sensores` para descartar el "un escaneo normal a un dionaea".

### 3.3 `credReuseCrossSensor` — reutilización de credenciales cross-sensor

**Señal**: existe al menos **una** tupla `(username, password)` que aparece en
`≥ CRED_REUSE_MIN_SENSORS` sensores distintos dentro de la ventana. Distinto del
`credentialReuse` actual, que es "misma cred en ≥2 **protocolos**".

**Fuente de credenciales**: `protocol_hits` (`username`/`password` con
`event_type='auth'`) + `events` (auth de cowrie, `sensor_id` vía join a
`sessions`). Unificar en la query nueva.

**Ventana**: se puede usar una ventana un poco más amplia que sweep (p. ej. 20
min) porque credential stuffing dirigido se despliega más lento. Decisión:
**20 minutos**, alineado con `postAuth`.

**Derivación** (`deriveCredReuseLevel`):
```
maxSensorsForOneCred ≥ 4 → CRITICAL
maxSensorsForOneCred ≥ 2 → HIGH
si no                    → null
```

**Cooldown key**: `cred_reuse:${ip}`.

**Campos**: IP, "Credential reused on N sensors", el par cred ofensor
(username visible, password **enmascarado**: mostrar solo longitud o primeros
2 chars — no volcar passwords en Discord/SIEM), lista de sensores, Window,
`contextFields`.

> 🔒 **Privacidad/seguridad**: no incluir passwords en claro en el mensaje de
> alerta. Mostrar `user=admin pass=(8 chars)` o hash corto. Los otros checks ya
> evitan volcar passwords; mantener la consistencia.

**Título**: `"Credential reuse across sensors"`.

---

## 4. Cambios de código (archivos concretos)

### 4.1 Backend — nueva query
**`apps/ingest-api/src/lib/threat-queries.ts`**
- Añadir `queryRecentSensorActivity(prisma, ip, since)` que devuelva filas
  `(sensor_id, protocol, dst_port, event_type, username, password, ts)` uniendo:
  - `protocol_hits` filtrado por `src_ip` + `timestamp >= since`.
  - `events` join `sessions` (para SSH/cowrie) filtrado por `src_ip` +
    `event_ts >= since`, proyectando `sessions.sensor_id`.
  - `web_hits` si tiene `sensor_id` (si no, emitir sensor lógico `web`).
  - `UNION ALL` con columnas normalizadas.
- Devolver crudo; **la agregación (DISTINCT sensors/ports/cred-map) se hace en
  TS**, no en SQL, para poder derivar las tres señales de un solo recorrido
  (KISS). Alternativa si el volumen preocupa: hacer los `COUNT(DISTINCT)` en SQL
  y devolver escalares — decidir según cuántas filas típicas hay en 10-20 min
  por IP (probablemente pocas). **Recomendado empezar con agregación en TS**.
- Tipo `RecentSensorActivityRow`.

### 4.2 Backend — helpers de resumen
**`apps/ingest-api/src/lib/threat-alerts.ts`** (o un `threat-correlation.ts`
nuevo si `threat-alerts.ts` ya es grande — respetar segmentación):
- `summarizeSensorActivity(rows): { sensorsSeen, familiesSeen, distinctPorts, ports[], sensors[], credReuse: { cred, sensors[] } | null }`.
  Un solo `for` sobre las filas construyendo `Set`s y un `Map<credKey, Set<sensorId>>`.

### 4.3 Backend — checks puros
**`apps/ingest-api/src/lib/threat-checks.ts`**
- `deriveSweepLevel`, `derivePortFanoutLevel`, `deriveCredReuseLevel`
  (exportadas, testeables aisladas).
- `checkSensorSweep(ip, summary, cooldownMs, ctx): AlertPayload | null`.
- `checkPortScanFanout(ip, summary, cooldownMs, ctx): AlertPayload | null`.
- `checkCredReuseCrossSensor(ip, summary, cooldownMs, ctx): AlertPayload | null`.
- Constantes de umbral arriba del archivo:
  `SWEEP_MIN_SENSORS`, `SWEEP_MIN_FAMILIES`, `FANOUT_MIN_PORTS`,
  `CRED_REUSE_MIN_SENSORS`, y los cortes de CRITICAL.

### 4.4 Backend — cablear en la evaluación
**`apps/ingest-api/src/lib/threat-alerts.ts` → `evaluateThreatAlert`**
- Añadir `queryRecentSensorActivity(db, ip, tenMinAgo)` (y otra con `twentyMinAgo`
  para cred-reuse, o reusar la de 20 min filtrando en TS) al `Promise.all`
  existente.
- Calcular `summary = summarizeSensorActivity(rows)`.
- Añadir tres entradas nuevas al array `checks`, cada una guardada por su toggle:
  ```ts
  alertCfg.types.sensorSweep     ? checkSensorSweep(...)        : null,
  alertCfg.types.portScanFanout  ? checkPortScanFanout(...)     : null,
  alertCfg.types.credReuse       ? checkCredReuseCrossSensor(...) : null,
  ```
- El loop `for (const payload of checks)` + filtro `levelPasses` ya existente los
  envía. **No** hay que tocar `sendAlertOnce`/`persistAlert`/cooldown/SSE:
  funcionan por `payload.key`.

### 4.5 Backend — config toggle
**`apps/ingest-api/src/lib/runtime-config.ts`**
- Añadir a `AlertEnabledTypes`: `sensorSweep?`, `portScanFanout?`, `credReuse?`.
- Añadir sus defaults (`?? true`) en `getAlertConfig().types`.

### 4.6 Dashboard — toggle UI (English-first + i18n)
**`apps/dashboard/lib/server-config.ts`** — añadir los 3 campos a su
`AlertEnabledTypes` (mantener en sync con el backend).

**`apps/dashboard/components/settings/alerts-form.tsx`**
- Añadir los 3 al `interface AlertEnabledTypes`, a `DEFAULT_CONFIG.alertEnabledTypes`,
  y a `ALERT_TYPE_LABELS` con sus keys i18n:
  ```
  { key: "sensorSweep",    label: "set.alerts.typeSensorSweep",    description: "set.alerts.typeSensorSweepDesc" },
  { key: "portScanFanout", label: "set.alerts.typePortFanout",     description: "set.alerts.typePortFanoutDesc" },
  { key: "credReuse",      label: "set.alerts.typeCredReuse",      description: "set.alerts.typeCredReuseDesc" },
  ```

**i18n**: añadir esas 6 keys al dict de `settings-alerts.ts` (o el fichero que
corresponda) en **inglés (source of truth)** y su traducción al español. Ver
regla English-first en CLAUDE.md. Verificar que existan en ambos locales o el
build de tipos i18n falla.

### 4.7 Tests
**`apps/ingest-api/tests/threat-alerts.test.ts`** (ya existe, cubre el motor)
- Unit de las `derive*Level`: tablas de verdad (0/1/2/3/5 sensores → nivel).
- Unit de `summarizeSensorActivity`: filas mezcladas → sensores/puertos/cred-map
  correctos, incluyendo el caso "mismo protocolo, dos sensores".
- Unit de cada `check*`: devuelve null bajo umbral, payload con key correcta y
  nivel correcto sobre umbral; passwords enmascarados en cred-reuse.
- (Opcional) integración de `evaluateThreatAlert` con filas sembradas si el
  harness de test lo permite.

---

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **Flood de Discord** al activar en prod (umbrales muy bajos) | Arrancar con umbrales conservadores; respetar `alertCooldownMs` (ya aplica por `key`); dejar los toggles **on por default pero fáciles de apagar**. Revisar volumen tras 24-48h. |
| **Solapamiento con `multiService`** | `sensorSweep` exige `sensorsSeen ≥ 2`; el eje familias solo sube severidad. Documentado en §3.1. |
| **Ruido de `portScanFanout`** por sensores multi-puerto (dionaea/port) | Umbral HIGH en 8 puertos; considerar exigir `≥2 sensores` o `≥2 connect` por puerto tras ver datos. |
| **Costo DB**: una query más en un `Promise.all` que ya corre ~11 y va contra la réplica | Va al `readClient` (réplica) como el resto; ventana corta ⇒ pocas filas; índice por `(src_ip, timestamp)` ya requerido por las queries recientes existentes — verificar que cubre. |
| **`web_hits` sin `sensor_id`** | Fallback: contar `web` como un sensor lógico único; documentar la limitación; si más tarde se añade `sensor_id` a `web_hits`, la query lo aprovecha sin cambiar el resto. |
| **Passwords en claro en alertas** | Enmascarar en `checkCredReuseCrossSensor` (§3.3). |
| **Multi-tenant**: la alerta debe quedar scopeada al cliente correcto | `persistAlert` ya resuelve `clientId` vía `resolveClientId(key)` a partir de la IP en la key — funciona igual para las keys nuevas (`sensor_sweep:<ip>`, etc.) porque terminan en IP. Verificar. |

---

## 6. Orden de implementación sugerido

1. **Leer `schema.prisma`** y confirmar columnas (§1). Bloqueante.
2. `queryRecentSensorActivity` + tipo (§4.1).
3. `summarizeSensorActivity` + tests unit (§4.2, §4.7).
4. `derive*Level` + `check*` puros + tests unit (§4.3, §4.7).
5. Cablear en `evaluateThreatAlert` detrás de toggles **default-off** en un
   primer deploy de observación (o default-on con umbrales altos). (§4.4)
6. Config backend (§4.5) + UI toggle + i18n (§4.6).
7. Deploy, observar volumen 24-48h, **ajustar umbrales**, actualizar este plan
   con los valores finales y el commit.

---

## 7. Checklist de "listo"

- [x] Schema confirmado (`sensor_id` en las tablas usadas; estado de `web_hits`).
- [x] `queryRecentSensorActivity` + `summarizeSensorActivity` con tests.
- [x] 3 `derive*Level` + 3 `check*` con tests (incluye enmascarado de password).
- [x] Cableado en `evaluateThreatAlert` tras toggles.
- [x] `AlertEnabledTypes` extendido en backend **y** dashboard (sync).
- [x] UI Settings muestra los 3 toggles; i18n en inglés + español.
- [ ] Deploy de observación; umbrales ajustados con datos reales.
- [x] Este plan actualizado con umbrales finales (ver §8). Commit: `48fc5ee`.

---

## 8. Estado de implementación (2026-07-02)

Implementación completa siguiendo el diseño de §1-§7, con dos desviaciones
menores respecto al plan original y una decisión de umbral que el plan no
fijaba explícitamente. Todo el trabajo está **sin commitear** a la fecha de
esta entrada.

### 8.1 Qué se implementó, archivo por archivo

- **`apps/ingest-api/src/lib/threat-queries.ts`** — `RecentSensorActivityRow` +
  `queryRecentSensorActivity(prisma, ip, since)`: `UNION ALL` de
  `protocol_hits`, `events JOIN sessions` y `web_hits`. Confirmado en
  `schema.prisma` que **las tres tablas tienen `sensor_id`** — el fallback de
  "sensor lógico `web`" que el plan consideraba en §1/§3.1/§5 **no hizo falta**.
- **`apps/ingest-api/src/lib/threat-alerts.ts`** — `summarizeSensorActivity(rows)`
  agrega en un solo paso: `sensorsSeen`, `familiesSeen`, `distinctPorts`,
  `ports[]`, `reusedCredentials[]`. Cableado en `evaluateThreatAlert`: dos
  llamadas a `queryRecentSensorActivity` (10 min para sweep/fanout, 20 min para
  cred-reuse — ver §8.2), y tres entradas nuevas al array `checks`, cada una
  detrás de su toggle (`alertCfg.types.sensorSweep` /
  `.portScanFanout` / `.credReuse`).
- **`apps/ingest-api/src/lib/threat-checks.ts`** — `deriveSweepLevel`,
  `derivePortFanoutLevel`, `deriveCredReuseCrossSensorLevel` (funciones puras) +
  `checkSensorSweep`, `checkPortScanFanout`, `checkCredReuseCrossSensor`
  (constructores de `AlertPayload`) + helper privado `maskPassword()`. Keys:
  `sensor_sweep:${ip}`, `port_fanout:${ip}`, `cred_reuse_cross_sensor:${ip}` —
  las tres terminan en la IP, compatibles con `resolveClientId`/multi-tenant.
- **`apps/ingest-api/src/lib/runtime-config.ts`** — `sensorSweep?`,
  `portScanFanout?`, `credReuse?` añadidos a `AlertEnabledTypes`, default `true`
  en `getAlertConfig()`.
- **`apps/dashboard/lib/server-config.ts`** — mismos 3 campos en su
  `AlertEnabledTypes` + `defaultValue` del registro `CONFIG_FIELDS`.
- **`apps/dashboard/components/settings/alerts-form.tsx`** — 3 toggles nuevos en
  `ALERT_TYPE_LABELS` y `DEFAULT_CONFIG.alertEnabledTypes`.
- **`apps/dashboard/lib/i18n/dicts/settings-alerts.ts`** — 6 keys nuevas
  (`set.alerts.typeSensorSweep(Desc)`, `typePortScanFanout(Desc)`,
  `typeCredReuse(Desc)`) en inglés y español.
- **`apps/ingest-api/tests/threat-alerts.test.ts`** — 27 tests nuevos: tablas de
  verdad para los 3 `derive*Level`, `summarizeSensorActivity` (breadth de
  sensores/familias/puertos, detección de credencial reutilizada, y un caso
  específico verificando que usernames/passwords con espacios no colisionan
  falsamente — ver §8.3), y los 3 `check*` (null bajo umbral, payload/nivel
  correcto sobre umbral, password enmascarado en cred-reuse).

Verificación: `vitest run` → 79/79 tests pasan (8 archivos) en `ingest-api`;
`tsc --noEmit` limpio en `ingest-api` y en `dashboard`; `npm test` del
dashboard (i18n, scope, botnet detection, etc.) sigue en verde.

### 8.2 Desviaciones respecto al diseño original

1. **`portScanFanout` key**: el plan (§3.2) no fijaba explícitamente el nombre
   de la key, y §4.6 la llamaba `typePortFanout` en el ejemplo de i18n; se usó
   `port_fanout:${ip}` (consistente con §3.2 texto) y la key i18n
   `typePortScanFanout` (consistente con el nombre del campo de config
   `portScanFanout`). Cosmético, no afecta comportamiento.
2. **Sin filtrado en TS de una sola query de 20 min**: el plan (§4.4) sugería
   como alternativa reusar una única query de 20 min y refiltrar a 10 min en
   TS para sweep/fanout, para ahorrar un round-trip. `RecentSensorActivityRow`
   no lleva timestamp por fila (deliberado, para mantener el shape simple), así
   que no es posible re-filtrar en memoria. Se optó por **dos llamadas** a
   `queryRecentSensorActivity` (10 min y 20 min) — mismo patrón que ya usa
   `evaluateThreatAlert` para `queryRecentProtocolAggregate` con ventanas
   distintas. Es el único costo extra de DB no explícitamente presupuestado en
   §5 (fila "Costo DB"), pero la ventana es corta y va contra la réplica.

### 8.3 Decisiones de umbral no explícitas en el plan

- **`deriveCredReuseCrossSensorLevel`**: el plan (§3.3) solo decía "≥2 sensores
  → HIGH" como señal definitoria, sin dar el corte de CRITICAL. Se eligió
  `≥4 sensores → CRITICAL` por simetría con `deriveSweepLevel` (que usa 5/2
  para sensores). **Sin datos reales de producción que lo validen** — es un
  valor de partida, no uno calibrado.
- **Bug corregido durante la implementación**: la primera versión de
  `summarizeSensorActivity` armaba la key de credencial con
  `` `${username} ${password}` `` (join por espacio), lo que puede colisionar
  falsamente si el username o password contienen un espacio (p. ej.
  `user="foo bar", pass="baz"` colisiona con `user="foo", pass="bar baz"`). Se
  corrigió a `JSON.stringify([username, password])` como key del `Map`. Hay un
  test específico (`"treats usernames and passwords containing spaces as
  distinct..."`) que cubre este caso.

### 8.4 Deuda técnica / pendiente

- **Sin verificación E2E en producción**: todo lo anterior está verificado con
  tests unitarios y typecheck, pero **no se ha desplegado ni observado tráfico
  real**. Los tres checks nunca se han disparado contra datos reales — el
  paso 7 del plan ("Deploy, observar volumen 24-48h, ajustar umbrales") sigue
  pendiente en su totalidad.
- **Umbrales no calibrados**: los tres (`sensorSweep`, `portScanFanout`,
  `credReuseCrossSensor`) usan los números del diseño original o la extensión
  de §8.3, ninguno validado contra volumen real. Riesgo concreto ya señalado
  en §5: sensores multi-puerto (dionaea, port-honeypot) pueden inflar
  `distinctPorts` con un único escaneo legítimo y disparar `portScanFanout` en
  falso-positivo. Revisar tras el deploy de observación.
- **Sin tests de integración de `evaluateThreatAlert`**: los tests cubren las
  funciones puras (`derive*`, `summarizeSensorActivity`, `check*`) de forma
  aislada, pero no hay un test que siembre filas en la DB de test y verifique
  el flujo completo `evaluateThreatAlert → checks → sendAlertOnce`. El plan
  (§4.7) lo marcaba como "(Opcional)"; sigue sin hacerse.
- **Commiteado**: `48fc5ee` (2026-07-02), pusheado a `master`. Pendiente real:
  deploy + observación (§8.4 arriba).
