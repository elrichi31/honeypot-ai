# Frontend Perceived Performance & Loading States

Auditoría del dashboard enfocada en dos cosas que el usuario pidió
explícitamente: (1) que toda interacción dé feedback visual inmediato —
"si no damos respuesta a una interacción el usuario piensa que todo falló
o está dañado" — y (2) cuellos de botella reales de carga de página.
Hecha el 2026-07-05 con un agente de exploración + verificación manual.
Buena noticia del diagnóstico: la mayoría del feedback de interacción ya
está bien resuelto (herencia de la sesión de manejo de errores anterior).
Quedan 3 focos concretos.

## Diagnóstico

### Ya está bien (confirmado, no tocar)

- Los 12 componentes arreglados en la sesión de manejo de errores
  (`edit-client-dialog.tsx`, `client-sensor-catalog.tsx`,
  `client-forwarding-settings.tsx`, `create-client-dialog.tsx`,
  `delete-client-dialog.tsx`, `client-sensor-assignment.tsx`,
  `sensor-card.tsx`, `sensor-config-dialog.tsx`, `client-ova-download.tsx`,
  `discord-form.tsx`, `alerts-form.tsx`, `setting-card.tsx`'s `save()`) ya
  muestran botón deshabilitado + spinner mientras la acción está en vuelo.
  No se tocan en este plan.
- `app/alerts/page.tsx`: `markRead`/`deleteOne` ya son optimistas (la fila
  cambia antes de que vuelva la respuesta). `markAllRead`/`deleteAll` no lo
  son, pero sí muestran spinner — inconsistente dentro del mismo archivo,
  pero no roto. Prioridad baja, no incluido en este plan.
- ~15 acciones mutantes revisadas (`defense-allowlist.tsx`,
  `retention-settings.tsx`, `users/page.tsx`, sensor delete dialog) todas
  tienen estado pending correcto por fila/acción.
- Home (`app/page.tsx`): patrón de referencia — 9 secciones cada una en su
  propio `<Suspense>`, gráficos de recharts cargados con `next/dynamic`.
  Sessions, threats, credentials, web-attacks, clients list: todas ya usan
  `Promise.all` para sus fetches paralelos independientes, sin waterfall.
- `sessions/[id]`, `threats/[ip]`: sus awaits secuenciales son
  dependientes de verdad (necesitan el primer resultado para el segundo
  fetch) — no es un waterfall arreglable.

### 1. `clear()`/`clearKey()` en formularios de secretos — sin feedback ni manejo de error

[`components/settings/setting-card.tsx:235-244`](../../apps/dashboard/components/settings/setting-card.tsx#L235-L244)
(`useConfigField`'s `clear`) y su duplicado en
[`components/settings/enrichment-form.tsx:195-203`](../../apps/dashboard/components/settings/enrichment-form.tsx#L195-L203)
(`clearKey`) comparten el mismo problema:

```ts
function clear() {
  setValue("")
  setHasValue(false)
  setDirty(false)
  apiFetch("/api/config", { method: "POST", ... })  // sin await, sin catch, sin estado
}
```

- No es `async`, no hace `await` del fetch — dispara la petición y sigue.
- No pasa por ningún estado `saving`/`pending` — el botón "Clear" no se
  deshabilita ni muestra spinner.
- Si el POST falla, no hay ningún rastro: la UI ya vació el campo
  optimísticamente (`setValue("")`), así que el usuario ve "borrado" aunque
  el backend haya rechazado el cambio — inconsistencia silenciosa, el
  peor de los casos que el usuario pidió evitar.

**Afecta a 4 formularios de configuración crítica**: `discord-form.tsx:80`
(webhook de Discord), `ingest-secret-form.tsx:59` (secreto compartido de
ingesta — tocar esto mal puede desconectar todos los sensores),
`openai-form.tsx:35` (API key de OpenAI), y los 4 campos de
`enrichment-form.tsx` (AbuseIPDB, ipinfo, Spectra Analyze, VirusTotal).

**Fix**: hacer `clear`/`clearKey` async, usar el mismo `assertOk` +
`status`/`error` que ya usa `save()` en el mismo archivo — es literalmente
copiar el patrón vecino, no inventar uno nuevo. El botón "Clear" en
`setting-card.tsx:158` debe deshabilitarse mientras `status === "saving"`,
igual que el botón "Save".

### 2. 4 rutas sin `loading.tsx` que sí hacen fetch de datos real

De las 10 rutas de primer nivel sin `loading.tsx`, la mayoría son
livianas/estáticas (`login`, `profile`, `setup`, `install`) — no priorizar.
Estas 4 sí buscan datos y se benefician de un skeleton inmediato al hacer
clic en el nav, en vez de que la página se vea "congelada":

- `app/alerts/` (fetch client-side, pero la navegación inicial a la ruta sí
  se beneficia del skeleton mientras el bundle/JS carga)
- `app/reports/`
- `app/sessions-admin/`
- `app/web-attacks/sessions/[fingerprint]/`

**Fix**: agregar `loading.tsx` a cada una usando el componente compartido
`RouteLoadingShell` (`components/route-loading-shell.tsx`, ya usado por
~20 rutas existentes) con `variant="overview"` para las 3 primeras y
`variant="detail"` para la de `[fingerprint]` (es una vista de detalle de
una sesión web puntual, igual que `clients/[slug]/loading.tsx`).

### 3. Componentes de recharts sin code-splitting fuera de la home

Solo la home (`app/page.tsx`) usa `next/dynamic` para sus 3 gráficos
pesados. El resto de la app (~13 componentes que importan `recharts`) los
importa de forma estática, inflando el JS de primera carga de esas rutas
específicas sin necesidad — el usuario paga el costo del bundle del
gráfico incluso antes de que sea visible.

Confirmado con mayor certeza:
[`components/clients/client-activity-chart.tsx`](../../apps/dashboard/components/clients/client-activity-chart.tsx)
importado estáticamente en
[`app/clients/[slug]/page.tsx`](../../apps/dashboard/app/clients/[slug]/page.tsx).
Candidatos adicionales a revisar con el mismo patrón (no confirmados
individualmente, mencionados por el agente como "probablemente iguales"):
`components/monitoring/container-stats-chart.tsx`,
`components/monitoring/resource-timeline-chart.tsx`,
`app/suricata/timeline-chart.tsx`.

**Fix**: aplicar el mismo patrón `nextDynamic(() => import(...).then(m =>
({ default: m.X })))` que ya usa `app/page.tsx`.

Verificados los 3 candidatos adicionales antes de tocarlos, como pedía el
plan — **ninguno necesitaba el fix**:
- `components/monitoring/container-stats.tsx` ya importa su propio
  `next/dynamic` internamente (línea 3) — ya está code-split.
- `app/suricata/suricata-client.tsx:16` ya envuelve `TimelineChart` con
  `dynamic(() => import("./timeline-chart"), { ssr: false })` — ya está
  code-split.
- Solo `client-activity-chart.tsx` en `clients/[slug]/page.tsx` tenía el
  import estático real.

## Plan de acción

1. **[x] Arreglar `clear()`/`clearKey()`** — hecho 2026-07-05.
   `setting-card.tsx`'s `clear()` ahora es `async`, limpia el input
   optimísticamente y reusa `save("")` (mismo `assertOk`, mismo estado
   `saving`/`error` que ya tenía `save`). `enrichment-form.tsx`'s
   `clearKey()` ahora recibe `setStatus`/`setError` y reusa `saveField`
   (que de paso se migró a `assertOk` — antes hacía `throw new Error()`
   sin mensaje, mismo bug de la sesión de manejo de errores que no se
   había migrado en este archivo). El botón "Clear" en
   `setting-card.tsx`'s `SecretField` ahora se deshabilita mientras
   `status === "saving"`.
2. **[x] Agregar `loading.tsx`** — hecho 2026-07-05, a `alerts/`,
   `reports/`, `sessions-admin/` (variant="overview") y
   `web-attacks/sessions/[fingerprint]/` (variant="detail"), todos usando
   `RouteLoadingShell` con label/título/descripción específicos de cada
   vista.
3. **[x] Code-split `client-activity-chart.tsx`** — hecho 2026-07-05, en
   `clients/[slug]/page.tsx` con el mismo patrón `nextDynamic` de la home.
   Los 3 candidatos restantes no necesitaron cambios (ver arriba).

No incluido en este plan (documentado como decisión consciente, no
descuido): inconsistencia optimista de `alerts/page.tsx`
(`markAllRead`/`deleteAll`), `next.config.js` sin `optimizePackageImports`
para `lucide-react`/`recharts` (mejora de bundle global, más riesgo/esfuerzo
que los 3 ítems de arriba, evaluar aparte si el bundle real lo justifica).

## Estado

Ítems 1–3 implementados y verificados el 2026-07-05: `tsc --noEmit` limpio
(solo ruido preexistente no relacionado: `@react-pdf/renderer` no instalado,
un artefacto de `.next/types/validator.ts`).
