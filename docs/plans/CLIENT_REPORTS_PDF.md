# Reportería por Cliente (PDF)

Estado: **Fase 1 completa** (2026-06-30). Todos los archivos implementados; `tsc --noEmit` pasa limpio.

## Contexto

Necesitamos un módulo de reportería **por cliente**: un PDF de buen aspecto que
resuma la actividad de las honeypots de UN cliente (nunca mezclando datos de otros
tenants), con rango semanal/mensual, y a futuro envío automatizado
(semanal/diario/mensual). El interés principal es **el reporte en sí** (contenido y
diseño en PDF); el canal de envío es secundario.

El repo ya tiene casi toda la infraestructura:

- **Multi-tenant scope** maduro: `effectiveSensorScope()`
  ([apps/dashboard/lib/tenant-scope.ts](../../apps/dashboard/lib/tenant-scope.ts))
  resuelve el tenant activo → sus `sensorIds`, y `parseSensorScope()`
  ([apps/ingest-api/src/lib/sensor-scope.ts](../../apps/ingest-api/src/lib/sensor-scope.ts))
  los aplica en el backend. ~85% de los endpoints de stats ya aceptan `?sensorIds=`
  y los fetchers de [apps/dashboard/lib/api/stats.ts](../../apps/dashboard/lib/api/stats.ts)
  ya reciben `sensorIds?: string[]` (helper `sensorScopeParam`).
- **Cron** ya montado (`node-cron`) con un reporte periódico a Discord
  ([apps/ingest-api/src/lib/weekly-report.ts](../../apps/ingest-api/src/lib/weekly-report.ts)
  → `sendPeriodicReport`, programado en
  [apps/ingest-api/src/lib/cron.ts](../../apps/ingest-api/src/lib/cron.ts)). Es el molde
  para la fase de automatización.
- **i18n** English-first con dicts por feature
  ([apps/dashboard/lib/i18n/dicts/](../../apps/dashboard/lib/i18n/dicts/)). El item de
  sidebar `sidebar.item.reports` ya existe en el dict.
- **Auth/roles**: `requireRole`
  ([apps/dashboard/lib/roles.ts](../../apps/dashboard/lib/roles.ts)) +
  `resolveScopeClientId` / `SCOPE_NONE`
  ([apps/dashboard/lib/roles-shared.ts](../../apps/dashboard/lib/roles-shared.ts)).
  Patrón de route handler scopeado en
  [apps/dashboard/app/api/alerts/route.ts](../../apps/dashboard/app/api/alerts/route.ts).

## Decisiones de diseño (confirmadas)

1. **Motor PDF: `@react-pdf/renderer`** — componentes React → PDF nativo en Node,
   sin Chromium, sin deps del sistema. Charts con `<Canvas>` (API 2D imperativa).
   Playwright fue descartado: binario de +150 MB, problemático en Alpine/VPS chicos.
2. **Entrega: botón de descarga on-demand primero** (página `/reports`); cron
   automatizado después.
3. **Aislamiento: estricto**, reusando `effectiveSensorScope` + `parseSensorScope`
   — cero queries de agregación nuevas, cero riesgo de fuga entre tenants.
4. **La generación corre en el dashboard** (Next.js route handler), no en el
   ingest-api. El route handler ya tiene `requireRole` + `effectiveSensorScope` +
   fetchers scopeados; así no duplicamos el resolver de scope ni metemos dependencias
   pesadas en el ingest-api en fase 1.

---

## Fase 1 — Reporte on-demand descargable ✅ (2026-06-30)

### 1.1 Dependencias
- `@react-pdf/renderer` (añadido a `apps/dashboard`). Sin Chromium, sin deps del sistema.
- Playwright descartado: binario de +150 MB, problemático en Alpine/VPS chicos.
- No tocar `apps/ingest-api` en esta fase.

### 1.2 Recolección de datos (módulo puro, server-only)
**Nuevo:** `apps/dashboard/lib/reports/collect.ts`
- `collectClientReport({ sensorIds, range, timezone }): Promise<ClientReportData>`.
- Reusa los fetchers existentes de `lib/api/stats.ts` y `lib/api/*`, todos con `sensorIds`:
  - `fetchHoneypotOverview(sensorIds)` — KPIs base (sessions, IPs únicas, logins, web hits).
  - `fetchKpiTrends(sensorIds)` — tendencias vs periodo previo (deltas %).
  - `fetchCrossSensorTimeline({ range, timezone, sensorIds })` — serie temporal del chart.
  - `fetchMitreMatrix(sensorIds)` — tácticas/técnicas MITRE.
  - `fetchBotRatio(sensorIds)` — bot vs humano.
  - `fetchGeoSummary(sensorIds)` — top países (agregar conteo por país en el módulo).
  - `fetchDashboardInsights(sensorIds)` — funnel, IPs recurrentes, command patterns, profundidad.
  - Credenciales/threats/web vía sus fetchers (aceptan `sensorId`/`clientSlug`); para el
    reporte basta el top-N que ya devuelven.
- Tipo `ClientReportData` nuevo en `apps/dashboard/lib/reports/types.ts`, agregando los
  tipos ya existentes de `lib/api/types.ts` (`HoneypotOverview`, `KpiTrends`,
  `CrossSensorTimeline`, `MitreMatrix`, `BotRatio`, `DashboardInsights`,
  `CredentialsAnalytics`, `ThreatSummary`, etc.).
- **Gotcha conocido (RSC):** corre en server; no pasar funciones ni iconos a componentes,
  solo data serializable.
- **Rango → fechas:** helper `rangeToWindow(range)` (`week` = 7d, `month` = 30d); mapear a
  `days`/`hours` donde el endpoint lo pida (mitre usa `days`).

### 1.3 Plantilla del reporte
**Nuevo:** `apps/dashboard/lib/reports/template.tsx` — componente React `<ReportDocument>`
usando `@react-pdf/renderer`. Secciones:
  1. Portada / resumen ejecutivo — totales y deltas (overview + kpi-trends).
  2. Línea de tiempo de actividad — chart de barras con `<Canvas>`.
  3. Inteligencia de amenazas — tabla MITRE tácticas/técnicas.
  4. Credenciales — tabla top pares usuario/clave.
  5. Reconocimiento y profundidad — funnel de barras + tabla IPs recurrentes.
  6. Geo — chart de barras + tabla top países.
  7. Clasificación — dona bot/humano con `<Canvas>` + leyenda.
  8. Web (condicional) — KPIs web si hay actividad.
- Texto vía i18n. **English first**; nada de español hardcodeado.

### 1.4 Charts en el PDF
- Charts dibujados con `<Canvas>` de react-pdf (API 2D imperativa, tipo `canvas` del browser).
- Barras (timeline, geo) y dona (bot/humano). Sin recharts, sin SVG, sin browser.

### 1.5 Generación del PDF + route handler
**Nuevo:** `apps/dashboard/lib/reports/pdf.ts`
- `generatePdf(data, t): Promise<Buffer>` — `renderToBuffer` de `@react-pdf/renderer`.
  Puro Node, ~2 MB de dep, sin Chromium.

**Nuevo:** `apps/dashboard/app/api/reports/route.ts` (patrón de `app/api/alerts/route.ts`):
- `GET ?range=week|month` (+ `timezone`).
- `const auth = await requireRole("viewer"); if (!auth.ok) return auth.response`.
- `const scope = await effectiveSensorScope()`:
  - `clientId === SCOPE_NONE` → 403 (usuario fail-closed, sin tenant).
  - `clientId === null` (superadmin global) → **exigir** `?clientId=` explícito y resolver
    sus sensors (un PDF "de todos los clientes" no tiene sentido); si falta → 400.
  - scoped → usar `scope.sensorIds`.
- `data = await collectClientReport({ sensorIds, range, timezone })`.
- `html = renderReportHtml(data, t, { clientName, range, generatedAt })`.
- `pdf = await htmlToPdf(html)`.
- `return new Response(pdf, { headers: { "Content-Type": "application/pdf",
  "Content-Disposition": 'attachment; filename="report-<slug>-<range>-<date>.pdf"' } })`.
- Resolver `clientName`/`slug` desde `clientId` (query directa a `clients` como en
  `tenant-scope.ts`, o fetcher de clientes existente).

### 1.6 i18n
**Nuevo dict:** `apps/dashboard/lib/i18n/dicts/reports.ts` (`en` + `es`, <150 líneas),
registrado en `apps/dashboard/lib/i18n/dictionaries.ts`. Keys para títulos de secciones,
labels de KPIs y leyendas.

### 1.7 Página `/reports` (UI de descarga)
**Nuevo:** `apps/dashboard/app/reports/page.tsx` (Server Component) +
`components/report-download.tsx` ("use client"):
- Selector de rango (semana/mes). Superadmin: selector de cliente (reusar patrón de
  `tenant-switcher` / lista de clientes); usuario scoped: fijo a su tenant.
- Botón "Generate PDF" → `GET /api/reports?range=...&clientId=...` y dispara descarga del blob.
- Entrada en el sidebar (item `sidebar.item.reports` ya existe), visible según rol (viewer+).

---

## Fase 1.5 — Preview en pantalla + rango de fechas (custom + presets)

Estado: **implementada** (2026-07-13). `tsc --noEmit` limpio; test de presets
(`lib/reports/shared/format.test.ts`, 6 casos) en verde. Falta verificación E2E
contra la DB local (pasos abajo).

### Objetivo
1. **Ver el reporte antes de exportarlo**, con exactamente la misma data que sale al PDF.
2. **Elegir el período**: presets (últimos 7 días, últimos 30 días, este mes, mes
   anterior) **y** rango de fechas custom (desde/hasta).

### Decisión de diseño (la importante): el preview ES el PDF

La plantilla (`lib/reports/template.tsx`) usa `@react-pdf/renderer` — primitivas de
PDF (`<Document>/<Page>/<Canvas>`), **no** DOM. No se renderiza en el browser como
HTML. Por lo tanto:

- **El preview se hace embebiendo el propio PDF en un `<iframe>`** (el visor de PDF
  nativo del browser). Es byte-idéntico al export por construcción.
- **Rechazado:** construir un render HTML/React paralelo desde `ClientReportData`.
  Duplicaría toda la plantilla (viola DRY), y preview y PDF divergirían para siempre.
- **Una sola generación por click.** Flujo: "Generate/Preview" → `fetch` al endpoint
  → blob PDF → `URL.createObjectURL` → `iframe.src`. El botón "Download" guarda **el
  mismo blob en memoria** (no re-genera, no segundo request). El PDF es la única
  fuente de verdad; preview y descarga comparten el mismo Buffer.

### Contrato del endpoint: de `range` enum a ventana explícita

Hoy `/api/reports?range=week|month` mapea a una ventana relativa a `now` vía
`buildPeriodStart(range)`. Se cambia a **fechas explícitas**:

- `GET /api/reports?startDate=<ISO>&endDate=<ISO>&timezone=&locale=&clientId=`
- El **cliente** resuelve preset/custom → `startDate`/`endDate` concretos y los manda.
  El servidor deja de interpretar presets (KISS: una sola forma de expresar la ventana).
- Validación nueva en el route: ambas fechas presentes, parseables, `start < end`,
  y `end - start ≤ 92 días` (techo para no reventar el `maxDuration = 30`). Si falta o
  es inválida → 400. Se elimina la validación `range !== week|month`.
- Auth/scope/isolation **sin cambios** (`requireRole` + `effectiveSensorScope` +
  `clientId` obligatorio para superadmin siguen igual).

### Cambios en la recolección (`lib/reports/`)

- `collect.ts`: `collectClientReport` recibe `{ startDate, endDate }` en vez de
  `range`. Se elimina `buildPeriodStart(range)`; `startDate`/`endDate` vienen dados.
  Las piezas basadas en SQL ya aceptan `startDate`/`endDate` y se re-ventanan **gratis**:
  `collectReportKpis`, `collectGeoSummary`, `fetchCredentialsAnalytics`,
  `collectSensorProfiles`. El período previo (deltas) se sigue derivando del span actual.
- `shared/format.ts`: `buildPeriodLabel` se reescribe para tomar `startDate`/`endDate`
  explícitos (hoy toma `range`). `rangeToDays`/`buildPeriodStart` quedan sin uso → borrar.
- **Timeline (`fetchCrossSensorTimeline`)**: su parámetro `range: day|week|month` es
  **granularidad de buckets**, no una ventana; el backend no acepta fechas explícitas.
  Se mapea el span custom → el enum más cercano: `≤ 2d → day`, `≤ 10d → week`, `else month`.
  <!-- ponytail: buckets del timeline no se recortan a las fechas custom exactas; si se
  necesita precisión, agregar start/end al endpoint /stats/cross-sensor-timeline -->
- `types.ts`: `ClientReportMeta` reemplaza `range: ReportRange` por `startDate`/`endDate`
  (o un `{ startDate, endDate }`). `ReportRange` queda solo como tipo de granularidad
  del timeline (renombrar a `TimelineGranularity` si aporta claridad; opcional).

### Límite conocido y honesto (pre-existente, NO se arregla aquí)

Varias piezas del reporte **ya hoy** ignoran la ventana y usan la ventana por defecto
de su endpoint: `fetchHoneypotOverview`, `fetchBotRatio`, `fetchDashboardInsights`,
`fetchMitreMatrix`. Cambiar a fechas custom **no** las re-ventana (no aceptan ventana).
Se re-ventanan solo KPIs, geo, credenciales y perfiles de sensor (las SQL-based). Hay
que dejarlo explícito en el copy/UI o asumirlo; ampliar esos endpoints a `startDate/endDate`
es trabajo aparte (candidato a fase futura, no bloquea esto).

### UI (`components/report-download.tsx` + `app/reports/page.tsx`)

Selector de período nuevo, reemplaza el toggle week/month:
- Botones de preset: **Last 7 days / Last 30 days / This month / Last month / Custom**.
  Cada preset resuelve `{startDate, endDate}` en el cliente (mismo patrón que
  `campaigns/page.tsx`, ampliado con "this/last month" y custom).
- Custom → dos `<input type="date">` nativos (desde/hasta). **Feature nativa del
  browser, sin librería de date-picker.** Validación cliente: `start ≤ end`.
- Layout: [ selector de período ] · [ selector de cliente (superadmin) ] ·
  [ botón **Generate preview** ] → al resolver, `<iframe>` con el PDF a ancho completo +
  botón **Download PDF** (guarda el blob ya generado) arriba del iframe.
- Estados: loading (spinner mientras genera), error (mensaje existente), vacío
  (sin preview aún → placeholder).
- El `<iframe>` puede ir alto (~80vh) dentro del `PageShell`.

### i18n (`lib/i18n/dicts/reports.ts`, en + es)

Keys nuevas: `reports.range.last7`, `reports.range.last30`, `reports.range.thisMonth`,
`reports.range.lastMonth`, `reports.range.custom`, `reports.range.from`,
`reports.range.to`, `reports.preview` ("Generate preview"), `reports.download` ("Download PDF"),
`reports.preview.empty` ("Choose a period and generate a preview"),
`reports.range.invalid` ("Start date must be before end date"). Reusar
`reports.generating`. Las viejas `reports.range.week/month` quedan sin uso → borrar.

### Verificación
1. `cd apps/dashboard && npx tsc --noEmit` limpio.
2. Test `tsx` de la resolución de presets → `{startDate,endDate}` (this month / last month
   en bordes de mes; span → granularidad de timeline). Assert-based, un archivo.
3. Contra DB local `honeypot_full`: generar preview de un cliente, confirmar que el
   iframe muestra el PDF; "Download" baja **el mismo** PDF (mismos números).
4. Custom range acotado (p.ej. 3 días con datos) → KPIs/geo/creds cuadran con ese rango;
   confirmar que overview/mitre/bot NO cambian con el rango (límite conocido, esperado).
5. Isolation sin regresión: superadmin con dos clientes → números distintos; scoped user
   pidiendo otro `clientId` → sus datos o 403, nunca cruzados.

### Archivos
**Modificados:** `app/api/reports/route.ts` (contrato dates), `lib/reports/collect.ts`,
`lib/reports/shared/format.ts`, `lib/reports/types.ts`, `components/report-download.tsx`,
`lib/i18n/dicts/reports.ts`. **Nuevo:** test de presets (`lib/reports/*.test.ts`).
Sin dependencias nuevas. `app/reports/page.tsx` casi no cambia (solo props si hiciera falta).

---

## Fase 2 — Automatización (cron) — tras validar el diseño

Reusar el patrón de `weekly-report.ts` + `cron.ts`; el PDF se arma con la MISMA lógica de
contenido de fase 1. Opciones (decidir al llegar):
- **A (reuso máximo):** el cron del ingest-api llama por HTTP a un endpoint interno del
  dashboard que genera el PDF por `clientId` (con token de servicio). Chromium queda solo
  en el dashboard.
- **B:** mover `collect`/`template`/`pdf` a un paquete compartido y correr Playwright en
  el ingest-api (imagen más pesada).
- Iterar sobre `clients`, generar uno por cliente respetando un campo de frecuencia.
  Entregar según el canal que se elija más tarde.

**Cambios de schema candidatos (solo en fase 2):** modelo `Client` en
[apps/ingest-api/prisma/schema.prisma](../../apps/ingest-api/prisma/schema.prisma) —
añadir `reportFrequency` (`off|weekly|monthly`), `contactEmail?`, opcional `logoUrl?`.
Migración idempotente.

---

## Deudas/limitaciones a tener en cuenta
- `/stats/novelty` **no** respeta `sensorIds` (devuelve global) → excluir del reporte hasta arreglarlo.
- `/malware/artifacts` **no** está scopeado por sensor → excluir hasta arreglarlo.
- `TimelineRepository.getOverviewStats/getSessionTimeline` posiblemente sin scope → no
  usar esas; usar `cross-sensor-timeline` (sí scopeado).
- `Attacker Intel` (enrichment) es global → solo para enriquecer IPs que ya salieron del
  set scopeado, nunca como fuente de listado.

---

## Archivos (resumen)
**Nuevos (dashboard):** `lib/reports/{types,collect,template,pdf}.ts(x)`,
`app/api/reports/route.ts`, `app/reports/page.tsx`, `components/report-download.tsx`,
`lib/i18n/dicts/reports.ts`. ✅
**Modificados (dashboard):** `lib/i18n/dictionaries.ts` (registrar dict), navegación del
sidebar (`sidebar.item.reports` en intelligence section), `package.json` (+ playwright). ✅
**Fase 2 (backend):** `apps/ingest-api/src/lib/cron.ts`, nuevo `client-pdf-report.ts`,
migración de `Client`.

---

## Verificación (fase 1)
1. `cd apps/dashboard && npx tsc --noEmit` + tests con `tsx` del repo.
2. Levantar el dashboard contra la DB local `honeypot_full` (puerto 55432) con datos de 3
   clientes ("Test Client", "Decption Client", "Cooperativa Pastaza").
3. **Aislamiento (lo crítico):** como superadmin, generar PDF de dos clientes distintos —
   los números deben diferir y cuadrar con lo que el dashboard muestra para ese tenant.
   Como usuario scoped, pedir `?clientId=` de OTRO cliente → debe salir con SUS datos o
   403, nunca cruzados.
4. Abrir el PDF: portada con nombre + rango, charts renderizados, secciones con datos,
   textos en inglés (y cambiar locale → español).
5. Cliente sin sensores → PDF "sin actividad", no error ni datos globales.
