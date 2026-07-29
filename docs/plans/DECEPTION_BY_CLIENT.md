# DECEPTION_BY_CLIENT — rediseño de `/deception` como índice por cliente

**Estado:** en progreso (2026-07-28). Backend B1-B4 implementado; frontend pendiente.
**Objetivo:** que `/deception` deje de mezclar datos de todos los clientes y pase
a ser un **índice de tarjetas, una por red deception de cliente**. Click en una
tarjeta → vista completa de esa red (alertas, movimiento lateral, nodos,
eventos, portscans).

Relacionado: [PLAN_DECEPTION.md](PLAN_DECEPTION.md) (infraestructura de la red),
[CLIENT_DECEPTION_TAB.md](CLIENT_DECEPTION_TAB.md) (la vista de detalle que ya
existe y que aquí se completa).

---

## El problema

`/deception` ([app/deception/page.tsx](../../apps/dashboard/app/deception/page.tsx))
hoy agrega **todos los clientes en un mismo overview, killchain, grid de nodos y
tabla de eventos**, con dos dropdowns (`DeceptionFilter`) para ir filtrando. Es
decir: por defecto muestra datos cruzados de clientes distintos, y para ver "la
red de un cliente" hay que filtrar a mano. Con >2 clientes deja de leerse.

## La decisión

| Ruta | Antes | Después |
|---|---|---|
| `/deception` | Overview global mezclado + filtros | **Grid de cards, una por cliente con red deception** |
| `/clients/[slug]/deception` | Vista por cliente (ya existe, incompleta) | **La vista de detalle** — se completa, no se duplica |

**No se crea una ruta de detalle nueva.** La vista por cliente ya existe y ya
está scopeada; la card enlaza ahí. Crear `/deception/[slug]` sería una segunda
página que renderiza exactamente lo mismo.

**Lo que se borra:** el cuerpo agregado de `/deception` y
[`deception-filter.tsx`](../../apps/dashboard/components/deception/deception-filter.tsx)
(los dropdowns dejan de tener sentido: el índice ya es el selector de cliente).

**Lo que NO cambia:** los endpoints per-client
(`/clients/:slug/deception/{overview,nodes,killchain,events,portscans}`) ya
existen y funcionan — el detalle no necesita backend nuevo salvo el punto B3.

---

## Reparto entre las dos personas

- **Persona A — Backend** (`apps/ingest-api`): tareas **B1–B4**. Entrega el
  endpoint del índice. Sin dependencias del frontend.
- **Persona B — Frontend** (`apps/dashboard`): tareas **F1–F6**. Puede arrancar
  ya con **F1 (tipos + fetcher) mockeado contra el contrato de B1**, y con
  **F4/F5/F6** (detalle, i18n, limpieza) que no dependen de nada nuevo.

**Contrato acordado primero** (B1 ↔ F1): la respuesta de
`GET /deception/networks` está fijada abajo. Persona B codea contra ese shape
desde el minuto 0; persona A no lo cambia sin avisar.

**Orden sugerido:** A hace B1–B2 mientras B hace F4–F6 (detalle completo, que es
independiente). Cuando B1 esté en `master`, B hace F1–F3 (el índice) contra el
endpoint real.

---

# Backend — Persona A

### B1 — Endpoint `GET /deception/networks`

Una sola llamada devuelve **una fila por cliente que tenga sensores
`protocol = 'deception'`**. Es el único endpoint nuevo del rediseño.

Ruta: [`deception.controller.ts`](../../apps/ingest-api/src/modules/deception/deception.controller.ts),
junto a los otros `GET /deception/*`. Sin `:clientSlug` — es la vista de flota.

**Contrato (congelado — F1 depende de esto):**

```ts
type DeceptionNetworkSummary = {
  clientId: string
  clientSlug: string
  clientName: string
  nodesTotal: number
  nodesOnline: number
  hits24h: number
  hits7d: number
  authAttempts24h: number
  uniqueSrcIps24h: number
  activeChains24h: number      // sesiones distintas con ≥1 hit interno en 24h
  lastEvent: string | null     // ISO
  status: "quiet" | "active" | "breached"
}

// GET /deception/networks  →  DeceptionNetworkSummary[]
```

`status` se calcula en el servicio, no en SQL ni en el frontend (una sola fuente
de verdad, la card solo pinta):

- `breached` — `hits24h > 0` **y** ≥2 nodos distintos tocados en 24h
  (movimiento lateral confirmado).
- `active` — `hits24h > 0`.
- `quiet` — resto.

Orden de la respuesta: `breached` → `active` → `quiet`, y dentro de cada grupo
por `lastEvent DESC`. Así la card que importa queda arriba sin ordenar en el
cliente.

### B2 — Query agregada en el repositorio

**SQL solo en [`deception.repository.ts`](../../apps/ingest-api/src/modules/deception/deception.repository.ts)**
(regla del repo). Método `getNetworks()`, sin `Scope` — agrega por `client_id`.

Reutilizar lo que ya está en el archivo:
- `DECEPTION_FILTER` (`data->>'layer' = 'internal' OR data->>'source' = 'opencanary'`).
- El patrón de `getOverview`: dos queries en `Promise.all` (una de `sensors`,
  otra de `protocol_hits`) y merge en JS por `client_id`. **No** hacer un JOIN
  de `protocol_hits` contra `sensors` fila a fila.

```
Q1: FROM sensors WHERE protocol='deception' AND client_id IS NOT NULL
    JOIN clients ON clients.id = sensors.client_id
    GROUP BY client_id, slug, name
    → nodes_total, nodes_online (last_seen >= NOW() - INTERVAL '2 minutes')

Q2: FROM protocol_hits ph
    JOIN sensors s ON s.sensor_id = ph.sensor_id   -- para llegar a client_id
    WHERE <DECEPTION_FILTER> AND ph.timestamp >= NOW() - INTERVAL '7 days'
    GROUP BY s.client_id
    → hits_24h, hits_7d, auth_24h, unique_src_ips_24h,
      distinct_nodes_24h, distinct_sessions_24h, last_event
```

**Cuidado — `bigint`:** todos los `COUNT(*)` vuelven como `bigint` de Prisma raw
y hay que envolverlos en `Number(...)` como ya hace `getOverview`. Si no, salen
serializados como string y el frontend rompe al comparar
(ver commit `754f0df`, mismo bug en analytics).

`distinct_nodes_24h` es `COUNT(DISTINCT COALESCE(data->>'node_id', sensor_id))
FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours')` — mismo `COALESCE` que
`getNodes()`, no inventar otro.

Clientes con sensores deception pero **cero hits** deben salir igual (status
`quiet`): el merge parte de Q1 y rellena Q2 con ceros, no al revés.

### B3 — `getPortscans` ya existe; solo confirmar el per-client

`GET /clients/:slug/deception/portscans` ya está en el controller. F4 lo va a
consumir en el detalle. **Tarea real:** verificar con datos reales que devuelve
filas scopeadas (la tabla `deception_portscans` es nueva, migración
`20260613000000`) y, si no, arreglar el scope. Cero código si ya funciona.

### B4 — Servicio, cache y test

- `DeceptionService.getNetworks(cache)` usando `withCache(cache, 'deception:networks', 30, ...)`
  — mismo TTL de 30s que el resto del módulo.
- Test en [`tests/deception-service.test.ts`](../../apps/ingest-api/tests/deception-service.test.ts):
  **un** test sobre el cálculo de `status` + orden, con filas fake (misma forma
  que los tests de `buildKillchains`). No hace falta test de SQL.

Casos mínimos: cliente sin hits → `quiet`; hits en 1 nodo → `active`;
hits en 2 nodos → `breached`; el orden final es `breached, active, quiet`.

### Progreso backend — 2026-07-28

- [x] B1: añadido `GET /deception/networks` con el contrato acordado.
- [x] B2: añadidas las dos queries agregadas y el merge por cliente; todos los
  contadores `bigint` se convierten a `number`, incluyendo redes sin hits.
- [x] B3: confirmado con la base local que el endpoint per-client aplica el
  scope por `deception_portscans.sensor_id` y no devuelve filas de otro cliente.
- [x] B4: cache de 30 s, cálculo centralizado de `status`, orden y test unitario.

Verificación completada: test de deception (6/6), suite completa (191 tests),
build TypeScript y smoke test de las queries con la base local. Próximo:
implementar F1-F6. Cambios aún sin commit.

---

# Frontend — Persona B

### F1 — Tipos y fetcher

En [`lib/api/deception.ts`](../../apps/dashboard/lib/api/deception.ts):

```ts
export type DeceptionNetworkSummary = { /* el contrato de B1, tal cual */ }

export function fetchDeceptionNetworks(): Promise<DeceptionNetworkSummary[]> {
  return apiFetch(`${getApiUrl()}/deception/networks`, 30)
}
```

Exportar desde `lib/api/index.ts` como el resto. Nada más — sin capa de
adaptadores ni normalizadores; el backend ya entrega el shape final.

### F2 — `components/deception/deception-network-card.tsx`

**La card copia el layout de [`sensor-card.tsx`](../../apps/dashboard/components/sensors/sensor-card.tsx):
tile vertical en grid, NO una fila horizontal.**

⚠️ **No confundir con** [`components/sensors/deception-network-card.tsx`](../../apps/dashboard/components/sensors/deception-network-card.tsx):
esa es la fila colapsable horizontal (`sm:col-span-2 lg:col-span-3`) de la página
de sensores. **No se reutiliza ni se extiende** — layout distinto, dato distinto
(agrupa nodos de una red; esta agrupa clientes). La de sensores se queda como
está. Para evitar el choque de nombres, el nuevo componente se llama
**`ClientDeceptionCard`** en `components/deception/`.

Estructura, calcada de `SensorCard` + `SensorStats`:

```
<div className="rounded-xl border bg-card p-4 flex flex-col gap-3 ...">   ← contenedor de SensorCard
  header:  punto de estado + <Ghost /> + nombre del cliente + chip de status
  <div className="grid grid-cols-2 gap-2">                                 ← rejilla de SensorStats
    StatCell "Nodes"        →  {nodesOnline}/{nodesTotal}
    StatCell "Hits 24h"     →  número, semibold (como el de events)
    StatCell "Auth attempts"→  authAttempts24h
    StatCell "Source IPs"   →  uniqueSrcIps24h
    StatCell "Lateral"      →  activeChains24h
    StatCell "Last event"   →  formatRelative(lastEvent)
  </div>
</div>
```

Reglas para que se vea igual que el resto y no como algo nuevo:

- **Borde reactivo al estado**, igual que `SensorCard` hace con
  `degraded/online/offline`: `breached` → `border-red-400/30`, `active` →
  `border-amber-400/30`, `quiet` → `border-border/40 opacity-70`.
- **`StatCell` se reutiliza, no se recrea.** Hoy es local a
  [`sensor-stats.tsx`](../../apps/dashboard/components/sensors/sensor-stats.tsx) —
  ponerle `export` y importarlo. Es la misma etiqueta uppercase de 10px; volver
  a escribirla es la duplicación que el repo prohíbe.
- `lastEvent` con `formatRelative` de `@/lib/sensor-display` — el mismo helper
  que usan las cards de sensores. Sin dependencias de fechas nuevas.
- La card entera envuelta en `<Link href={`/clients/${slug}/deception`}>`.
- El grid contenedor (F3) usa las mismas columnas que la página de sensores, así
  las cards salen del mismo tamaño.

### F3 — Reescribir `app/deception/page.tsx`

Queda una página corta:

1. Header (se conserva el copy actual, es bueno).
2. `fetchDeceptionNetworks()` — **una sola llamada**. Se van los seis
   `fetch*` del `Promise.all`, `fetchClients()` y `fetchSensors()`.
3. Grid responsive de `DeceptionNetworkCard`.
4. Empty state cuando el array viene vacío ("no client has a deception network yet").
5. `SectionError` en catch — igual que ahora.

Se borran de esta página: `DeceptionOverview`, `KillChainView`,
`DeceptionNodesGrid`, `DeceptionEventsTable`, `DeceptionPortscansTable`,
`DeceptionFilter`, el `searchParams` con `clientSlug`/`nodeId` y el filtrado
manual de `visibleNodes`. Todos esos componentes **siguen vivos** — los usa la
vista de detalle.

### F4 — Completar la vista de detalle `/clients/[slug]/deception`

[La página](../../apps/dashboard/app/clients/[slug]/deception/page.tsx) ya
trae overview + killchain + nodos + eventos. Falta:

- [ ] **Portscans**: añadir `fetchClientDeceptionPortscans(slug, { limit: 50 })`
  al `Promise.all` y montar `<DeceptionPortscansTable>` (hoy solo existe en la
  página global, que desaparece — si no se mueve, se pierde la vista).
- [ ] **Filtro por nodo**: `?nodeId=` en `searchParams` para las tablas de
  eventos y portscans. El backend ya acepta `nodeId`; los nodos del selector
  salen de `data.nodes`, que ya se está cargando. Un `<select>` nativo basta —
  no hace falta el `DeceptionFilter` de dos dropdowns.
- [ ] **Alertas**: mostrar las alertas de deception del cliente arriba del
  kill-chain, reutilizando el componente de alertas por cliente que ya existe
  (`components/clients/client-alerts.tsx`). Es el punto pendiente de
  [CLIENT_DECEPTION_TAB.md](CLIENT_DECEPTION_TAB.md) Fase 3/4.

### F5 — i18n

Todo string nuevo de la card y del índice va a los diccionarios, **inglés como
fuente de verdad**. Fichero: `lib/i18n/dicts/deception.ts` (nuevo — hoy no hay
uno de deception; los ficheros se mantienen bajo ~150 líneas). Claves bajo
`deception.networks.*` y `deception.status.*`.

Aprovechar para arrastrar los strings hardcodeados que ya están en la página de
detalle (header, títulos de sección) — es la deuda de i18n que
CLIENT_DECEPTION_TAB dejó abierta.

### F6 — Limpieza

- [ ] Borrar `components/deception/deception-filter.tsx` y sus claves i18n si
  ningún otro sitio lo importa (`grep -rn deception-filter apps/dashboard`).
- [ ] Verificar el link del sidebar (`sidebar.item.deception → /deception`) — no
  cambia de ruta, solo de contenido.
- [ ] Revisar los enlaces a `/deception?clientSlug=...` que puedan quedar por
  el repo y repuntarlos a `/clients/[slug]/deception`.
  Empezar por `components/sensors/deception-network-card.tsx`.

### Progreso frontend — 2026-07-28

- [x] **F1** — `DeceptionNetworkSummary` + `fetchDeceptionNetworks()` en
  [`lib/api/deception.ts`](../../apps/dashboard/lib/api/deception.ts).
- [x] **F2** — [`components/deception/client-deception-card.tsx`](../../apps/dashboard/components/deception/client-deception-card.tsx):
  tile vertical con el contenedor de `SensorCard` y la rejilla de `SensorStats`.
  `StatCell` se exportó desde [`sensor-stats.tsx`](../../apps/dashboard/components/sensors/sensor-stats.tsx)
  y se reutiliza. La fila colapsable de `components/sensors/` no se tocó.
- [x] **F3** — [`app/deception/page.tsx`](../../apps/dashboard/app/deception/page.tsx)
  reescrita: un solo `fetchDeceptionNetworks()`, grid de cards con las mismas
  columnas que la página de sensores, empty state. Fuera el overview agregado,
  killchain, nodos, eventos y portscans globales.
- [x] **F4** — detalle: se añadieron portscans (`fetchClientDeceptionPortscans`),
  filtro `?nodeId=` que scopea eventos + portscans + grid de nodos, y **banner de
  brecha** cuando ≥1 cadena tocó ≥2 nodos en 24h.
- [x] **F5** — nuevo [`lib/i18n/dicts/deception.ts`](../../apps/dashboard/lib/i18n/dicts/deception.ts)
  (en+es) registrado en `dictionaries.ts`; se arrastraron los strings
  hardcodeados de ambas páginas.
- [x] **F6** — `deception-filter.tsx` se redujo a `DeceptionNodeFilter` (un solo
  dropdown, sin el de cliente). No quedaban links a `/deception?clientSlug=`.

**Desviación del plan (F4, alertas):** en vez de montar `ClientAlerts` en la tab,
que es la lista genérica de amenazas del cliente y ya se muestra en Overview
(sería el mismo contenido duplicado en dos tabs), la alerta es el **banner de
movimiento lateral** derivado del killchain que ya se carga: mismo criterio que
el `status: breached` de la card, cero fetch extra, y sí es específico de
deception. Si se quiere además el stream en vivo, sigue pendiente en
[CLIENT_DECEPTION_TAB.md](CLIENT_DECEPTION_TAB.md).

Verificado: `tsc --noEmit` limpio y `next build` completo. Falta comprobación
visual contra datos reales. Cambios aún sin commit.

---

## Verificación

**Backend:**
```bash
curl -s localhost:3001/deception/networks | jq '.[0]'
```
Comprobar: hay una entrada por cliente con sensores deception; los contadores son
números y no strings; un cliente sin hits aparece con `status: "quiet"`.

**Frontend:** `/deception` muestra N cards y **ninguna cifra agregada**;
click en una card lleva al detalle de ese cliente y ahí sí están killchain,
nodos, eventos, portscans y alertas.

Con la DB local (`honeypot_full`, puerto 55432) hay datos reales para probar.

---

## Fuera de alcance (decidido, no olvidado)

- **Comparar redes entre clientes** en el índice (sparklines, ranking) —
  primero que las cards se lean bien.
- **Ruta `/deception/[slug]`** — el detalle vive en `/clients/[slug]/deception`.
- **SSE en las cards del índice** — el TTL de 30s del cache es suficiente para
  una vista de flota; el tiempo real ya está en el detalle.
- **Sensores deception sin cliente asignado** — no aparecen en el índice. Si
  aparecen en producción es un fallo de asignación, se arregla en el sensor, no
  metiendo una card "Unassigned".

---

## Seguimiento — 2026-07-29

- [x] La lista de movimiento lateral muestra 5 cadenas por página, ordenadas
  por `lastSeen DESC`, reutilizando el paginador compartido sin cambiar el
  aspecto de las tarjetas.
- [x] Raw events usa los componentes compartidos de tabla y muestra 10 eventos
  por página, ordenados por `timestamp DESC`; el detalle expandible conserva
  el mismo layout.
- [x] El paginador compartido admite navegación local controlada y puede
  ocultar el selector de tamaño. Las tablas con paginación por URL mantienen
  su comportamiento anterior.
- Commit: pendiente.
