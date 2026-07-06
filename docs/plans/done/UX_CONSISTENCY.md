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

### 2. Único `confirm()` nativo del navegador

`app/alerts/page.tsx:161` — `if (!confirm(...)) return` para "delete all
alerts". Es el único call site de `confirm()` en toda la app; el resto de
~10+ acciones destructivas ya usan `Dialog`/`AlertDialog` (ver
`sensor-header.tsx`'s `DeleteSensorDialog`, `delete-client-dialog.tsx`).
Inconsistente (el diálogo nativo del navegador rompe el estilo visual y no
se puede personalizar) pero acotado a 1 lugar — **no atacado en esta
pasada**, candidato para una próxima si se decide.

### 3. Sin validación inline en formularios de diálogo

`create-client-dialog.tsx`, `sensor-config-dialog.tsx`: el único feedback
de "falta un campo" es que el botón Submit queda deshabilitado
(`disabled={creating || !name.trim()}`), sin decirle al usuario *por qué*.
Único ejemplo de validación en vivo: `TagInput` en
`sensor-config-dialog.tsx` (muestra error por cada tag inválido mientras
se escribe). Gap compartido por varios formularios de diálogo — **no
atacado en esta pasada**, requeriría un patrón `FieldError` compartido.

### 4. Empty states — mayormente buenos, algunos solo texto plano

Patrón bueno y repetido (icono + título + a veces hint) en:
`app/alerts/page.tsx`, `app/audit/page.tsx`, `app/sensors/page.tsx`,
`app/sessions-admin/page.tsx`, `web-attacks/geo/web-geo-map.tsx`,
`web-attacks/attackers-table.tsx` (componente `EmptyState` dedicado), y un
helper compartido `EmptyRow` usado en `services/page.tsx`,
`protocol-detail-page.tsx`, `protocol-hits-table.tsx`.

Gap: varios lugares muestran solo texto centrado sin ícono ni CTA, pese a
que a veces hay una acción disponible justo arriba —
`components/clients/client-manager.tsx:59-60` (sin ícono, aunque el botón
"crear cliente" está ahí mismo), `web-attacks/[ip]/page.tsx:425-429`,
`web-attacks/bursts/page.tsx:225-229`, `suricata/suricata-client.tsx:191,213`,
`web-attacks/timeline/timeline-charts.tsx:43-44`. No roto, solo
visualmente inconsistente frente al resto de la app — **no atacado en
esta pasada**, candidato a consolidar en un solo `EmptyState` compartido.

### 5. Breadcrumbs / navegación — ya consistente, sin gaps

Los 6 pages de detalle revisados (`clients/[slug]`, `sessions/[id]`,
`threats/[ip]`, `web-attacks/[ip]`, `web-attacks/sessions/[fingerprint]`,
`services/protocol-detail-page.tsx`) todos tienen un link "Back to X" con
ícono `ArrowLeft` justo debajo del header — patrón sólido y repetido, sin
huecos. Existe un componente `components/ui/breadcrumb.tsx` (shadcn) sin
uso real en ningún lado — no es un problema hoy (la app solo anida un
nivel), pero no escalaría si en el futuro se agregara un tercer nivel
(cliente → sensor → sesión). Anotado para cuando/si eso pase.

### 6. Responsive de tablas

`components/table-shell.tsx` da `overflow-auto` centralizado a las tablas
que lo usan (sessions, malware, etc.) — patrón compartido bueno. Algunas
tablas construidas con `<table>` crudo fuera de `TableShell`
(`web-attacks/[ip]/page.tsx`, `web-attacks/bursts/page.tsx`,
`protocol-detail-page.tsx`) no se confirmaron con su propio wrapper de
scroll — riesgo de overflow silencioso en mobile. **No atacado en esta
pasada** — requiere confirmar cada tabla individualmente antes de tocar
para no romper el layout de escritorio.

### 7. Accesibilidad — icon-only buttons sin aria-label

Solo ~15 archivos en toda la app usan `aria-label` (mayormente
nav/sidebar/búsqueda). El único gap concreto confirmado eran los 2 botones
de cerrar del modal casero de `/users` (ya resuelto en el punto 1) y el
botón de eliminar de cada fila (también resuelto). No se encontraron otros
icon-only buttons sin ningún tipo de label (`title` o `aria-label`) en el
resto de la app.

## Plan de acción

1. **[x] Migrar `app/users/page.tsx`** — hecho 2026-07-05 (ver punto 1).
2. **[ ] Reemplazar el `confirm()` de `alerts/page.tsx:161`** por
   `AlertDialog` — bajo esfuerzo, pendiente.
3. **[ ] Validación inline en formularios de diálogo** — requiere diseñar
   un patrón `FieldError` compartido antes de aplicarlo, pendiente.
4. **[ ] Consolidar empty states** en un solo componente compartido —
   pendiente, bajo riesgo pero toca varios archivos.
5. **[ ] Confirmar overflow de tablas fuera de `TableShell`** en mobile
   real antes de decidir si necesitan wrapper — pendiente.

## Estado

Ítem 1 implementado y verificado el 2026-07-05. Ítems 2–5 documentados
como deuda, priorizados de menor a mayor esfuerzo — a decidir cuándo
atacarlos en una próxima pasada.
