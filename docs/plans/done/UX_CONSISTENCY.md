# UX Consistency Audit

Auditoría de UX (distinta de performance/loading-states/error-handling, ya
cubiertas en `DB_QUERY_PERF.md`, `FRONTEND_PERF_UX.md`, `ERROR_HANDLING.md`).
Hecha el 2026-07-05 con un agente de exploración sobre 7 áreas: empty
states, confirmaciones destructivas, validación de formularios, breadcrumbs,
responsive de tablas, consistencia de diálogos, y accesibilidad básica.

## Hallazgos

### 1. Modal casero en `app/users/page.tsx` — RESUELTO

`CreateUserDialog` y `DeleteConfirmDialog` implementaban su propio overlay
(`fixed inset-0 ... bg-black/60 backdrop-blur-sm` + `<div>` a mano) en vez
del `Dialog` compartido (shadcn/Radix) que usa el resto de la app
(`components/clients/create-client-dialog.tsx`,
`components/clients/delete-client-dialog.tsx`). Consecuencias:
- Botón de cerrar (`<button onClick={onClose}><X /></button>`) sin
  `aria-label` — un lector de pantalla solo anuncia "button".
- Todo el texto (títulos, labels, placeholders, botones) hardcodeado en
  inglés, violando la convención "English first vía i18n dict" del
  proyecto — `clients.create.*`/`clients.delete.*` ya seguían el patrón
  correcto, `users.*` no.
- Inputs planos (`<input className="...">` repetido) en vez de los
  componentes `Input`/`Label` del design system.

**Fix aplicado** (2026-07-05): migrados ambos diálogos a
`Dialog`/`DialogContent`/`DialogHeader`/`DialogFooter` (mismo patrón que
`delete-client-dialog.tsx`), reemplazados los inputs planos por
`Input`/`Label`, agregadas ~35 keys nuevas a
`lib/i18n/dicts/users.ts` (EN+ES) para todos los textos que antes estaban
hardcodeados, incluidos el título/descripción/empty-state/hint de la página
`UsersPage` misma (no solo los diálogos). El `Dialog` compartido ya incluye
`<span className="sr-only">Close</span>` en su botón de cerrar, así que la
migración resuelve el gap de accesibilidad sin cambios adicionales. También
se agregó `aria-label` al botón de icono "eliminar" en cada fila de la
tabla (antes solo tenía `title`, insuficiente para lectores de pantalla).

Verificado: `tsc --noEmit` limpio, 33/33 tests, rebuild en Docker sin
errores.

### 2. Único `confirm()` nativo del navegador — RESUELTO (2026-07-05)

`app/alerts/page.tsx:161` — `if (!confirm(...)) return` para "delete all
alerts". Era el único call site de `confirm()` en toda la app; el resto de
~10+ acciones destructivas ya usan `Dialog`/`AlertDialog` (ver
`sensor-header.tsx`'s `DeleteSensorDialog`, `delete-client-dialog.tsx`).

**Fix aplicado**: migrado a `AlertDialog` (mismo patrón que
`DeleteSensorDialog`), con 5 keys i18n nuevas en `dicts/alerts.ts` (en/es):
`alerts.deleteAll.{button,title,descScoped,descAll,cancel}`. `deleteAll()`
ya no llama `confirm()` — la confirmación ahora vive en el render del
`AlertDialog`. Verificado: `grep -rn "confirm(" apps/dashboard/app
apps/dashboard/components` → cero resultados.

### 3. Sin validación inline en formularios de diálogo — RESUELTO (2026-07-05)

`create-client-dialog.tsx`, `edit-client-dialog.tsx`,
`client-forwarding-settings.tsx`: el único feedback de "falta un campo" era
que el botón Submit quedaba deshabilitado (`disabled={creating ||
!name.trim()}`), sin decirle al usuario *por qué*.

**Fix aplicado**: no hizo falta diseñar un patrón nuevo — `FieldError` ya
existía en [`components/ui/field.tsx`](../../apps/dashboard/components/ui/field.tsx)
(parte del kit shadcn instalado) pero tenía **cero usos reales** en todo el
código. Adoptado en los 3 archivos: un flag `xTouched` por campo requerido
(seteado en `onBlur` y al intentar submit con el campo vacío), gateando
`aria-invalid` en el `Input` y un `<FieldError>` debajo que solo aparece
tras ese primer touch/intento — no es agresivo con un formulario recién
abierto. `sensor-config-dialog.tsx` se revisó y **no necesitaba el fix**:
todos sus campos tienen defaults o ya validan en vivo (`TagInput`).
`i18n`: `clients.create.nameRequired`, `clients.edit.codeRequired` (en/es);
`client-forwarding-settings.tsx` usa texto plano en inglés directo,
consistente con el resto del archivo (no tiene `useT()`).

### 4. Empty states — mayormente buenos, algunos solo texto plano — RESUELTO (2026-07-05)

Patrón bueno y repetido (icono + título + a veces hint) en:
`app/alerts/page.tsx`, `app/audit/page.tsx`, `app/sensors/page.tsx`,
`app/sessions-admin/page.tsx`, `web-attacks/geo/web-geo-map.tsx`,
`web-attacks/attackers-table.tsx` (componente `EmptyState` dedicado), y un
helper compartido `EmptyRow` usado en `services/page.tsx`,
`protocol-detail-page.tsx`, `protocol-hits-table.tsx`.

Gap identificado: varios lugares mostraban solo texto centrado sin ícono ni
CTA, pese a que a veces hay una acción disponible justo arriba.

**Fix aplicado**, reusando el `EmptyState` compartido de
[`components/ui/data-states.tsx`](../../apps/dashboard/components/ui/data-states.tsx)
(ya existía, solo faltaba adoptarlo):
- `components/clients/client-manager.tsx:59-60` → `<EmptyState
  title={t("clients.none")} icon="shield" />`.
- `web-attacks/timeline/timeline-charts.tsx:43-44` → `<EmptyState
  title="No data yet" />` (reemplaza el chart cuando no hay días).
- `web-attacks/[ip]/page.tsx:425-429` y `web-attacks/bursts/page.tsx:225-229`:
  estos viven dentro de un `<tr><td colSpan>` de una tabla HTML cruda, no
  dentro de un `<div>` — mezclar los primitivos `TableRow`/`TableCell` de
  shadcn (que usa `EmptyRow`) ahí habría cambiado el padding/hover del resto
  de filas ya construidas con `<tr>`/`<td>` planos. En vez de forzar
  `EmptyState`/`EmptyRow`, se agregó el mismo ícono (`SearchX`, el default de
  `EmptyState`) dentro del `<td>` existente, manteniendo la estructura de
  tabla intacta pero con la misma jerarquía visual (ícono + texto).
- `suricata/suricata-client.tsx:191,213`: revisado y **no se tocó a
  propósito** — no son filas de tabla ni cards standalone, son mini-listas
  compactas ("top signatures"/"top attackers") dentro de una card más
  grande; el ícono de 12px/py-16 de `EmptyState` rompería la proporción del
  widget. Documentado como excepción deliberada, no un olvido.

### 5. Breadcrumbs / navegación — ya consistente, sin gaps

Los 6 pages de detalle revisados (`clients/[slug]`, `sessions/[id]`,
`threats/[ip]`, `web-attacks/[ip]`, `web-attacks/sessions/[fingerprint]`,
`services/protocol-detail-page.tsx`) todos tienen un link "Back to X" con
ícono `ArrowLeft` justo debajo del header — patrón sólido y repetido, sin
huecos. Existe un componente `components/ui/breadcrumb.tsx` (shadcn) sin
uso real en ningún lado — no es un problema hoy (la app solo anida un
nivel), pero no escalaría si en el futuro se agregara un tercer nivel
(cliente → sensor → sesión). Anotado para cuando/si eso pase.

### 6. Responsive de tablas — CONFIRMADO Y RESUELTO (2026-07-05)

`components/table-shell.tsx` da `overflow-auto` centralizado a las tablas
que lo usan (sessions, malware, etc.) — patrón compartido bueno. Se
confirmaron individualmente las 3 tablas con `<table>` crudo fuera de
`TableShell`:

- **`web-attacks/bursts/page.tsx`**: ya estaba bien — su wrapper usa
  `overflow-auto` (ambos ejes) + `min-w-[920px]` en la tabla, mismo patrón
  que `TableShell`. No necesitó cambios.
- **`web-attacks/[ip]/page.tsx`**: sí tenía el gap real — el wrapper solo
  tenía `overflow-y-auto` (vertical), sin eje horizontal. Con 6 columnas
  (toggle, Method, Path, Type, Count, Last seen) el contenido se recortaba
  silenciosamente en mobile sin poder scrollear. **Fix**: `overflow-y-auto`
  → `overflow-auto` + `min-w-[720px]` en la tabla.
- **`protocol-detail-page.tsx`**: no usa `<table>` crudo (delega a un
  componente ya envuelto) — el hallazgo original no aplicaba, confirmado.

### 7. Accesibilidad — icon-only buttons sin aria-label

Solo ~15 archivos en toda la app usan `aria-label` (mayormente
nav/sidebar/búsqueda). El único gap concreto confirmado eran los 2 botones
de cerrar del modal casero de `/users` (ya resuelto en el punto 1) y el
botón de eliminar de cada fila (también resuelto). No se encontraron otros
icon-only buttons sin ningún tipo de label (`title` o `aria-label`) en el
resto de la app.

## Plan de acción

1. **[x] Migrar `app/users/page.tsx`** — hecho 2026-07-05 (ver punto 1).
2. **[x] Reemplazar el `confirm()` de `alerts/page.tsx:161`** por
   `AlertDialog` — hecho 2026-07-05.
3. **[x] Validación inline en formularios de diálogo** — hecho 2026-07-05,
   adoptando el `FieldError` ya existente en `components/ui/field.tsx`.
4. **[x] Consolidar empty states** en el `EmptyState` compartido ya
   existente — hecho 2026-07-05.
5. **[x] Confirmar overflow de tablas fuera de `TableShell`** en mobile —
   hecho 2026-07-05, 1 de 3 tablas tenía el gap real y se arregló.

## Estado

Todos los ítems (1–6) implementados y verificados el 2026-07-05. Plan sin
tareas abiertas. Verificado: `tsc --noEmit` limpio en ambas pasadas, 37/37
tests del dashboard, `grep -rn "confirm(" apps/dashboard` → 0 resultados.
