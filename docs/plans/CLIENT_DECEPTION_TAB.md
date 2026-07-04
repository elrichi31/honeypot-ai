# CLIENT_DECEPTION_TAB — Viana de Deception por cliente + atribución + alerta

**Estado:** Fases 1-2 implementadas (2026-07-04). Fase 3 (alertas) y parte de
Fase 4 (tests) pendientes — ver "Deuda técnica" al final.

## Objetivo

Que dentro del apartado de un cliente exista una **viana (tab) de Deception**
de primera clase, que muestre **de quién es el sensor / honeypot interno** que
alguien tocó, y que **avise** cuando un atacante interactúa con un nodo interno
(señal de que se pasó del honeypot SSH). Hoy la información existe pero está mal
expuesta y sin atribución de cliente/sensor.

## Contexto — lo que YA existe (no rehacer)

| Pieza | Ubicación | Estado |
|---|---|---|
| Página global agregada | [`app/deception/page.tsx`](../../apps/dashboard/app/deception/page.tsx) | ✅ con filtro `?clientSlug=` |
| Página deception **por cliente** | [`app/clients/[slug]/deception/page.tsx`](../../apps/dashboard/app/clients/[slug]/deception/page.tsx) | ✅ ya scopeada al slug |
| Endpoints API per-client | [`lib/api/deception.ts`](../../apps/dashboard/lib/api/deception.ts) | ✅ `fetchClientDeception*` |
| Resolución sensores↔cliente (backend) | [`lib/client-helpers.ts` · `resolveClientSensors`](../../apps/ingest-api/src/lib/client-helpers.ts) | ✅ |
| Tabla de eventos | [`components/deception/deception-events-table.tsx`](../../apps/dashboard/components/deception/deception-events-table.tsx) | ✅ pero **sin cliente/sensor real** |
| Enlace de entrada | [`app/clients/[slug]/page.tsx:82`](../../apps/dashboard/app/clients/[slug]/page.tsx) | ⚠️ botón suelto, condicional, texto ES hardcodeado |

## Brechas (el "no sirve de mucho")

1. **No es una viana.** El detalle de cliente es una sola columna larga sin tabs;
   la deception es un botón `"Ver deception"` que solo aparece si el cliente tiene
   un sensor `protocol === "deception"`. No hay navegación por pestañas (a
   diferencia de [`web-attacks-nav.tsx`](../../apps/dashboard/components/web-attacks-nav.tsx)).
2. **La tabla no muestra atribución.** [`DeceptionEvent`](../../apps/dashboard/lib/api/deception.ts)
   trae `node_id`/`node_name` pero **no** `client_slug`/`client_name` ni el
   `sensor_id`/nombre del honeypot interno tocado. En la vista global es
   justamente el dato que falta.
3. **Texto hardcodeado en español** (`"Ver deception"`) — viola English-first + i18n.
4. **Sin aviso.** No hay badge ni integración con el motor de alertas por cliente
   ([`ClientAlerts`](../../apps/dashboard/components/clients/client-alerts.tsx)) que
   diga "alguien tocó un honeypot interno".
5. **Sin tests** en toda la cadena de deception (CodeGraph: ⚠️ no covering tests).

## Decisiones tomadas (2026-07-04)

- **Navegación:** tabs en `/clients/[slug]` (patrón `web-attacks-nav`). Deception
  como pestaña de primera clase, siempre visible.
- **Atribución:** cliente + sensor real. Extender la API con `client_slug`/
  `client_name` y `sensor_id`/nombre del honeypot interno; columna **Cliente** en
  la vista global y **Sensor** en ambas.
- **Alerta:** toda interacción con un nodo interno alimenta un **badge + alerta
  por cliente** (integra con `ClientAlerts` y el stream en vivo). Es la señal de
  "se pasó del SSH".

---

## Plan por fases

### Fase 1 — Tabs en el detalle de cliente ✅ (2026-07-04)

- [x] Crear [`components/clients/client-detail-nav.tsx`](../../apps/dashboard/components/clients/client-detail-nav.tsx)
  (patrón de [`web-attacks-nav.tsx`](../../apps/dashboard/components/web-attacks-nav.tsx)):
  tabs `Overview | Deception`, `active` prop, `t` inyectado desde el server
  (`getServerT()`) — labels vía i18n (`clients.detail.nav.*`).
- [x] Refactor [`app/clients/[slug]/page.tsx`](../../apps/dashboard/app/clients/[slug]/page.tsx):
  el contenido actual es la tab **Overview**; la nav se renderiza arriba del
  bloque de stats.
- [x] [`app/clients/[slug]/deception/page.tsx`](../../apps/dashboard/app/clients/[slug]/deception/page.tsx)
  monta la misma nav con `active="deception"`; se quitó el `<Link back>`
  duplicado (la navegación ahora es solo por tabs + el link "Back to clients"
  que ya vive en Overview).
- [x] Eliminado el botón condicional `"Ver deception"` (hardcodeado en
  español) de la Overview — la tab lo reemplaza. `Ghost` icon y el import de
  `Link`/`ArrowLeft` sobrantes también se limpiaron de esa página.
- [x] Estado vacío: si el cliente no tiene sensores `protocol === "deception"`
  asignados, la tab Deception muestra un empty-state
  (`clients.detail.deception.empty.title/desc`) con la nav visible, en vez de
  intentar cargar overview/killchain/eventos contra un cliente sin red.

### Fase 2 — Atribución cliente + sensor en los eventos ✅ (2026-07-04)

- [x] **Backend:** [`DeceptionRepository.getEvents`](../../apps/ingest-api/src/modules/deception/deception.repository.ts)
  extiende el `LEFT JOIN sensors sn ON sn.sensor_id = ph.data->>'node_id'`
  existente con `LEFT JOIN clients c ON c.id = sn.client_id`, seleccionando
  `client_id`, `client_slug`, `client_name` (mismo patrón que
  [`sensors.repository.ts`](../../apps/ingest-api/src/modules/sensors/sensors.repository.ts)).
  SQL sigue solo en el repository.
- [x] **Tipo:** [`DeceptionEvent`](../../apps/dashboard/lib/api/deception.ts)
  ahora incluye `client_id`, `client_slug`, `client_name`.
- [x] **Tabla:** [`DeceptionEventsTable`](../../apps/dashboard/components/deception/deception-events-table.tsx)
  acepta `showClient?: boolean` (default `true`); añade columna **Client**
  (colspan de vacío/expandido ajustado dinámicamente) y el campo **Client** en
  el `EventDetail` expandido.
- [x] Vista per-client pasa `showClient={false}` explícitamente; vista global
  ([`app/deception/page.tsx`](../../apps/dashboard/app/deception/page.tsx))
  no necesitó cambios — usa el default `true`.
- [ ] **No hecho:** `getKillchain`/`getPortscans` no tienen el mismo join
  (el plan original solo pedía eventos; el kill-chain view y la tabla de
  portscans siguen sin columna Cliente). Ver deuda técnica.

### Fase 3 — Aviso "tocaron un honeypot interno"

- [ ] Definir la señal: interacción con nodo interno = evento de deception con
  `event_type` de interacción (auth / command / etc.).
- [ ] **Badge/contador** en la tab de deception del cliente: "N interacciones
  internas en 24h", destacado (color de alerta) cuando > 0.
- [ ] Integrar con el motor de alertas por cliente
  ([`ClientAlerts`](../../apps/dashboard/components/clients/client-alerts.tsx)) y el
  stream en vivo (ver [`REALTIME_STREAM.md`](REALTIME_STREAM.md)) para que salga
  como alerta cuando ocurre, no solo en la tabla.
- [ ] Revisar si conviene una alerta correlacionada nueva en el motor por-IP
  (ver [`CORRELATION_ALERTS.md`](CORRELATION_ALERTS.md)): "internal node touched".

### Fase 4 — i18n + tests + docs

- [x] Texto nuevo de Fase 1 (nav, empty-state) va por los dicts
  `clients-detail.ts` (en/es). `"Ver deception"` retirado por completo (era un
  `<Link>` suelto, no una clave i18n existente).
- [ ] **No hecho:** el resto del texto de deception (`DeceptionEventsTable`,
  `DeceptionOverview`, `KillChainView`, las páginas `/deception` y
  `/clients/[slug]/deception`) sigue hardcodeado en inglés directo en el JSX,
  no vía `useT()`/dicts. Es consistente con el estado previo (English-first ya
  se cumple, pero no hay traducción a otros locales) — no se tocó para no
  ampliar el alcance de esta sesión.
- [ ] **No hecho:** tests. Sigue sin cobertura el join de atribución en
  `DeceptionRepository.getEvents` y el render condicional de `showClient` en
  `DeceptionEventsTable`.
- [x] Actualizar [`docs/plans/README.md`](README.md) y este plan (este commit).

## Deuda técnica dejada (2026-07-04)

1. **Fase 3 completa sin implementar.** No hay badge/contador de
   interacciones internas en la tab de deception del cliente, ni integración
   con `ClientAlerts` o el stream en vivo. Nota importante para quien retome
   esto: `ClientAlerts` (`/api/clients/:slug/threats`) y el motor de alertas
   `alerts`/`AlertRepository` (`alert_key`, `deception:${nodeId}:${ip}` vía
   `checkDeceptionInteraction` en `threat-checks.ts`) son **dos pipelines
   distintos hoy** — la Fase 3 tiene que decidir explícitamente cuál extender
   (o ambos) antes de tocar código.
2. **`getKillchain` y `getPortscans` sin atribución de cliente.** Solo
   `getEvents` recibió el join a `clients`. Si se quiere columna Cliente en el
   Kill-chain view o en `DeceptionPortscansTable`, hay que repetir el mismo
   `LEFT JOIN clients c ON c.id = sn.client_id` ahí.
3. **Sin tests** en toda la cadena (repository, tabla, nav). Pre-existía antes
   de esta sesión: no se agregó cobertura nueva.
4. **i18n parcial.** Solo las strings de Fase 1 (nav + empty state) están en
   dicts; el resto de la UI de deception sigue con texto inglés hardcodeado
   (no bloqueante para English-first, pero bloquea traducción a otros locales
   el día que se pida).

## Archivos que se tocan (mapa)

- **Front nav:** `components/clients/client-detail-nav.tsx` (nuevo),
  `app/clients/[slug]/page.tsx`, `app/clients/[slug]/deception/page.tsx`
- **Atribución:** `lib/api/deception.ts` (tipo), deception repository/service en
  `apps/ingest-api` (query), `components/deception/deception-events-table.tsx`
- **Alerta:** tab de deception, `components/clients/client-alerts.tsx`,
  motor de alertas ingest-api
- **i18n:** `apps/dashboard/lib/i18n/dicts/clients-*.ts` (+ deception)

## Riesgos / notas

- El join sensor→cliente ya está resuelto por `resolveClientSensors`; reusar esa
  lógica en el repository de eventos, no duplicar (DRY).
- La vista global agrega **todos** los clientes: la columna Cliente es la que le
  da sentido; sin ella la página global "no sirve" (queja original).
- No romper el filtro `?clientSlug=` existente de la página global.
