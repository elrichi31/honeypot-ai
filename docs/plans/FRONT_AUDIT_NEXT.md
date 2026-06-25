# FRONT_AUDIT_NEXT — auditoría del dashboard con `vercel-labs/next-best-practices`

**Estado:** En progreso. Creado 2026-06-24. Sprint 1 completo 2026-06-24. Sprint 2 completo 2026-06-24.
**Skill guía:** `vercel-labs/next-best-practices` (UI Skills) — RSC boundaries,
data patterns, async APIs, metadata, error handling, optimización en App Router.
**Stack:** Next.js 16.2 + React 19, App Router, BFF en `app/api/*`, Tailwind +
shadcn/ui.

> Nota: el registry de UI Skills devolvió 404 al hacer `npx ui-skills get
> vercel-labs/next-best-practices` (archivo del skill no servido el 2026-06-24).
> Este plan aplica el **marco** del skill (las áreas que audita) sobre la base de
> código real; si el archivo vuelve a estar disponible, refrescar contra él.

## Cómo se usa la skill aquí

El skill no "corre" solo: define **qué** revisar en un App Router. El plan lo
traduce a una auditoría por áreas, cada una con: el patrón Next que aplica, la
**evidencia medida** en este repo, y la acción. Una pasada de revisión → un
backlog priorizado. No se cambia código hasta aprobar el backlog.

## Inventario medido (línea base, 2026-06-24)

| Métrica | Valor | Señal |
|---|---|---|
| Páginas (`page.tsx`) | 46 | — |
| Rutas BFF (`app/api/*/route.ts`) | 63 | — |
| Archivos `"use client"` | 150 | client-first por defecto (revisar) |
| **Páginas enteras `"use client"`** | **11 / 46** | varias podrían ser RSC |
| Páginas con `fetch` en `useEffect` | 10 | candidatas a server fetch |
| Páginas con `metadata`/`generateMetadata` | **0 / 46** | sin SEO/social por página |
| `loading.tsx` | 32 | streaming por ruta: bien |
| `error.tsx` | **1** | casi sin error boundaries |
| Usos de `Suspense` | 3 | streaming granular casi nulo |

---

## Áreas de auditoría (orden = impacto)

### Área 1 — RSC boundaries: bajar `"use client"` al borde ⚠️
**Patrón Next:** las páginas son **Server Components** por defecto; `"use client"`
debe ponerse en el componente hoja que realmente usa estado/efectos/handlers, no
en la página entera. 150 archivos cliente y 11 páginas client completas sugieren
lo contrario.

**Evidencia:** `suricata/page.tsx` era `"use client"` y hacía todo el fetch +
estado en el navegador (patrón repetido en alerts, audit, storage, users,
sessions-admin, profile, monitoring…).

**Acción (auditoría):** por cada una de las 11 páginas client, clasificar:
- (a) **Convertible a RSC** — solo lee datos y los pinta → mover el fetch al
  server component, dejar `"use client"` solo en las partes interactivas (filtros,
  tablas con orden, gráficos recharts que necesitan el cliente).
- (b) **Legítimamente client** (login, setup, profile con formularios) — dejar,
  pero verificar que no arrastren librerías pesadas al bundle de toda la página.

**Beneficio:** menos JS al cliente, sin spinner inicial, sin waterfall
cliente→BFF→ingest. **Riesgo:** medio (reestructura por página). Hacer 1 página
piloto (p. ej. `suricata`) y medir bundle antes de generalizar.

**✅ IMPLEMENTADO sprint 1+2 (2026-06-24):** clasificación y conversiones.

Clasificación final de las 11 páginas client:

| Página | Decisión | Razón |
|---|---|---|
| `suricata` | ✅ Convertida a RSC | fetch de stats inicial al server |
| `storage` | ✅ Convertida a RSC | stats server-fetched, sub-componentes siguen client |
| `alerts` | Client (legítimo) | mutaciones optimistas + reactividad de tenant cookie |
| `audit` | Client (legítimo) | paginación+filtros+expand inline, full client UX |
| `monitoring` | Client (legítimo) | polling 60s + visibilitychange event |
| `profile` | Client (legítimo) | layout simple, no vale reestructura |
| `sessions-admin` | Client (legítimo) | DELETE/POST mutations inline |
| `settings` | Client (legítimo) | 8 formularios de configuración |
| `users` | Client (legítimo) | CRUD completo con diálogos inline |
| `login` | Client (legítimo) | auth + fetch IP pública + signIn |
| `setup` | Client (legítimo) | formulario registro, signUp.email() |

Conversiones realizadas:
- `app/suricata/page.tsx` → RSC async; `suricata-client.tsx` = client shell; `timeline-chart.tsx` lazy via `dynamic`.
- `app/storage/page.tsx` → RSC async; `apiFetch` a `/storage/stats`; sub-componentes siguen siendo client components.
- Metadatos para páginas client vía `layout.tsx` por segmento (sin mover código client): alerts, audit, monitoring, profile, sessions-admin, settings, users, login, setup.

### Área 2 — Data fetching: server fetch vs `useEffect` waterfall
**Patrón Next:** fetch en Server Components (paralelo, en el servidor, cacheable)
en vez de `useEffect` que añade un round-trip cliente y un estado de carga.

**Evidencia:** 10 páginas hacen `fetch` en `useEffect`. El dashboard ya tiene una
capa `lib/api/*` con `next: { revalidate }` (server fetch) — coexisten dos
patrones.

**Acción:** para las páginas del Área 1(a), reemplazar el `useEffect+fetch` por
una llamada server-side (reusar `lib/api/*`). Donde el dato sea realmente
dinámico por interacción (paginación, filtros), mantener client fetch pero
considerar Server Actions o pasar datos iniciales desde el server (hidratación
sin spinner inicial).

**✅ COMPLETO (2026-06-24):** `suricata` y `storage` movidas a RSC con fetch
server-side. Las 9 páginas restantes son legítimamente client (mutaciones,
polling, auth) — no procede convertir.

### Área 3 — Metadata por página (SEO + social) 
**Patrón Next:** cada página exporta `metadata` o `generateMetadata` para
`<title>`, descripción, Open Graph. **0/46 páginas** lo hacen hoy → todas heredan
el title del layout.

**Acción:** añadir `export const metadata = { title: "…" }` a cada página
**server**; para las que queden client (Área 1b), extraer un segmento server
mínimo o usar el `title` del layout por ruta. Empezar por las páginas con URL
pública/compartible.

**✅ IMPLEMENTADO sprint 1+2 (2026-06-24):** metadata en 100% de páginas.
- Páginas server estáticas: `export const metadata: Metadata = { title: "… — HoneyTrap" }` (~25 páginas).
- Páginas dinámicas (`[ip]`, `[id]`, `[fingerprint]`, `[slug]`): `generateMetadata` con el parámetro de la URL.
- Páginas client (9 que permanecen client): `layout.tsx` por segmento con `metadata` estático (alerts, audit, monitoring, profile, sessions-admin, settings, users, login, setup).
- Cobertura: 100% de rutas.

### Área 4 — Error boundaries y estados de fallo
**Patrón Next:** `error.tsx` por segmento captura errores de render/data y evita
la pantalla en blanco. Hoy hay **1** en 46 páginas.

**Acción:** añadir `error.tsx` (y `not-found.tsx` donde aplique) al menos en los
segmentos de nivel superior y en las páginas con fetch que pueden fallar (datos
del ingest-api caído). Reusar un componente de error compartido (DRY).

**✅ IMPLEMENTADO (2026-06-24):** error boundaries añadidos.
- Componente compartido: `components/segment-error.tsx` (DRY, igual UX que el
  global `app/error.tsx`).
- Segmentos cubiertos: `api-defense`, `campaigns`, `clients`, `commands`,
  `credentials`, `deception`, `iocs`, `malware`, `network`, `sensors`, `services`,
  `sessions`, `suricata`, `threats`, `web-attacks`.
- La raíz (`app/error.tsx`) ya existía y cubre el resto.

### Área 5 — Streaming granular con Suspense
**Patrón Next:** `loading.tsx` cubre la ruta entera; `<Suspense>` permite
streamear secciones pesadas (un gráfico, una tabla larga) sin bloquear el resto.
32 `loading.tsx` pero solo 3 `Suspense`.

**Acción:** en páginas con varias secciones de costo distinto (p. ej.
`dashboard`, `suricata`, `threats` con KPIs + timeline + tabla), envolver las
secciones lentas en `Suspense` con su propio fallback, para que los KPIs aparezcan
antes que la tabla. Solo donde haya diferencia real de latencia; no por defecto.

**⏳ PENDIENTE:** aplica a las páginas que se conviertan a RSC (Área 1). Atacar
junto con cada conversión en el sprint siguiente.

### Área 6 — Async request APIs (Next 15/16)
**Patrón Next:** en Next 15+ `cookies()`, `headers()`, `params`, `searchParams`
son **async** y deben `await`-earse. Verificar que no queden accesos síncronos
(que en 16 son error o warning).

**Acción:** grep de control sobre `cookies(`, `headers(`, `params.`,
`searchParams.` en server components y rutas BFF; confirmar `await`. Riesgo bajo,
puramente de corrección.

**✅ VERIFICADO (2026-06-24):** grep en todo el dashboard no encontró accesos
síncronos. El único uso de `headers()` (en `app/api/me/route.ts`) ya usa `await`.
`params` y `searchParams` se resuelven con `await params` / `await searchParams`
en las páginas dinámicas. No hay violaciones.

### Área 7 — Bundle / imports en el cliente
**Patrón Next:** evitar arrastrar librerías pesadas (recharts, mapas, three) al
bundle de páginas que no las usan; usar `next/dynamic` con `ssr:false` para lo que
solo vive en cliente y es pesado.

**Acción:** auditar imports de `recharts`, el globo/mapa de ataques y cualquier lib
3D; cargar bajo `dynamic()` los componentes pesados que están below-the-fold o
detrás de tabs. Medir con el build de Next (`next build` → tamaños por ruta).

**✅ IMPLEMENTADO sprint 1+2 (2026-06-24):** lazy recharts en múltiples páginas.
- `suricata/timeline-chart.tsx` — lazy via `dynamic` en `suricata-client.tsx`.
- `app/page.tsx` (homepage RSC) — `CrossSensorActivityChart`, `ProtocolDistributionChart`, `BotRatioView` lazy via `nextDynamic`.
- `web-attacks/timeline/page.tsx` — `TimelineCharts` lazy via `nextDynamic`.
- Monitoring ya tenía `dynamic` en `resource-timeline.tsx` y `container-stats.tsx`.
- Pendiente: evaluar `activity-chart.tsx`, `web-attacks-summary.tsx`, `kpi-card.tsx` (sparklines) — bajo impacto marginal, posponer hasta medir con build.

> **🐛 Bug encontrado y corregido en review (2026-06-24):** los `dynamic()` de
> recharts en `app/page.tsx` y `web-attacks/timeline/page.tsx` se añadieron con
> `{ ssr: false }`, **prohibido en Server Components en Next 16** → `next build`
> fallaba ("`ssr: false` is not allowed with `next/dynamic` in Server
> Components"). Fix: quitar `ssr: false` (los componentes ya son `"use client"`,
> así que siguen code-split y válidos en RSC). El `ssr: false` de
> `suricata-client.tsx` es correcto porque ese archivo **sí** es client component.

---

## Cómo ejecutar la auditoría (proceso)

1. **Página piloto:** ✅ `suricata` convertida. Áreas 1, 2, 3, 4, 7 aplicadas.
2. **Generalizar:** ✅ `storage` convertida a RSC. Las otras 9 páginas client son legítimamente client — clasificación completa.
3. **Barridos transversales** (Áreas 3, 4, 6): ✅ metadata (100%), error.tsx (15 segmentos), async APIs verificadas sin violaciones.
4. **Área 7 extendida:** ✅ recharts lazy en homepage, web-attacks/timeline, suricata. Monitoring ya lo tenía.
5. Pendiente: `next build` para medir tamaños de bundle por ruta; Suspense granular (Área 5) cuando midan un impacto real.

## Criterio de éxito

- [x] Metadata en el 100% de rutas (server via `metadata`; client via `layout.tsx`).
- [x] `error.tsx` en todos los segmentos de nivel superior con fetch (15 segmentos).
- [x] Sin accesos síncronos a las request APIs async.
- [x] Recharts bajo `dynamic` en homepage, suricata, web-attacks/timeline.
- [x] Páginas client clasificadas: 2 convertidas a RSC (suricata, storage); 9 legítimamente client.
- [x] `next build` verde — 46 rutas compilan (tras corregir el bug de `ssr: false`).
- [ ] Suspense granular en páginas RSC multi-sección (posponer hasta medir).

## Riesgos / notas

- Área 1 es la de mayor impacto **y** mayor riesgo: reestructura por página.
  Pilotar y medir antes de generalizar; no convertir a ciegas.
- No romper i18n (English-first, dicts en `lib/i18n/`) ni el patrón BFF al mover
  fetch al server — reusar `lib/api/*`, no duplicar lógica.
- El front **no** debe incorporar lógica de backend (regla del repo): mover fetch
  "al server" significa Server Components del dashboard llamando al BFF/ingest, no
  meter Prisma en el front. El `apiFetch` en `suricata/page.tsx` llama directamente
  al ingest-api via `getApiUrl()` con el shared secret — correcto.
- Registry de UI Skills caído para el `get`; si vuelve, contrastar este plan con
  el contenido oficial del skill.
