# Reportería por Cliente (PDF)

Estado: **Fase 1.9 completa** (2026-08-03). Fase 1 completa desde 2026-06-30. Todos los archivos implementados; `tsc --noEmit` pasa limpio.

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

## Fase 1.5 — Rango de fechas (custom + presets)

Estado: **implementada** (2026-07-13, contrato de fechas + presets). El preview
se rehízo en la Fase 1.6 (ver abajo) tras aclarar el requerimiento.

### Objetivo
- **Elegir el período**: presets (últimos 7 días, últimos 30 días, este mes, mes
  anterior) **y** rango de fechas custom (desde/hasta).

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

### Selector de período (UI)

Reemplaza el toggle week/month:
- Botones de preset: **Last 7 days / Last 30 days / This month / Last month / Custom**.
  Cada preset resuelve `{startDate, endDate}` en el cliente (`resolvePresetWindow`,
  testeado). Custom → dos `<input type="date">` nativos, sin librería de date-picker.

---

## Fase 1.6 — Reporte HTML on-page + progreso real + PDF por print

Estado: **implementada** (2026-07-13). `tsc --noEmit` limpio; unit test en verde.
Falta verificación E2E contra la DB local.

### Pivote de diseño (reemplaza el "preview = PDF en iframe" de la 1.5)

El requerimiento aclarado: ver el reporte **pintado como componentes HTML en la propia
página**, que el PDF **se vea igual**, y una **barra de progreso real** durante la
generación. Decisión:

- **El HTML es la fuente única de verdad.** El reporte se renderiza como componentes
  (`components/reports/report-view.tsx`) desde `ClientReportData`, y **el PDF sale de ese
  mismo HTML** vía `window.print()` + CSS de impresión (`@media print` en `globals.css`).
  Native platform feature: **sin Chromium en el server, sin librería nueva, sin deps.**
  Por construcción página == PDF (la 1.5 tenía dos capas; el iframe-PDF se descartó).
- **react-pdf queda como legacy/fallback** (`/api/reports` GET sigue existiendo). Se
  borra `template.tsx` + `sections/*` + `sensors/*` (PDF) + `pdf.ts` cuando el camino
  HTML esté verificado en prod. <!-- ponytail: deuda de borrado pendiente -->
- **Progreso real vía SSE.** `collectClientReport` acepta `onProgress(done, total)` que
  dispara al resolver cada una de las ~9 tareas. Endpoint nuevo
  `GET /api/reports/stream` (`text/event-stream`) emite `progress` por cada tarea, luego
  `result` con el `ClientReportData` completo, luego cierra (`failed` en error). El
  cliente usa **`EventSource` nativo** (evento de app = `failed` para no chocar con el
  `error` nativo de conexión). La barra refleja `done/total` real.
- **Resolver compartido** (`lib/reports/resolve-request.ts`): auth + tenant-scope + parse
  de fechas + `clientId` extraídos de `route.ts`; los usan tanto el endpoint PDF como el
  de stream (DRY). Isolation intacto.

### CSS de impresión (`globals.css`)

`@media print` aísla `#report-print-root` (patrón visibility+absolute), mantiene la
paleta dark real y fuerza `print-color-adjust: exact` para que el PDF sea idéntico a la
pantalla. <!-- ponytail: el usuario puede necesitar activar "Background graphics" en el
diálogo de impresión según el browser -->

### Alcance del ReportView
Secciones principales (= primeras páginas del PDF viejo): KPIs+deltas, timeline de
actividad, fuentes de tráfico, MITRE, credenciales (summary + top pares), funnel de
reconocimiento + IPs recurrentes, geo, clasificación bot/humano. **Pendiente:** páginas
de deep-dive por sensor (siguen el mismo patrón; página == PDF se mantiene a cada paso).

### Fase 1.7 — Identidad visual empresarial + idioma y tema elegibles (2026-07-31)

Feedback del primer PDF real entregado: salía **negro entero, sin color y con
bordes blancos alrededor**, que no es un documento presentable a un cliente.

- **Paleta propia del reporte, no la de la app.** La app es dark-only
  (`:root` == `.dark`), así que el reporte heredaba el negro. Ahora
  `#report-print-root[data-report-theme="light"|"dark"]` redefine las variables
  de color en su subárbol. **Cero cambios en los componentes**: `@theme inline`
  hace que las utilidades de Tailwind referencien `var(--card)` directo en vez
  de un valor resuelto en `:root`, así que redefinir las vars más abajo
  re-tematiza todo lo de adentro. Mismo mecanismo que el `[data-brand]` que ya
  existía. Acento **borgoña** (`#7a1c2b` claro / `#a82a3c` oscuro) en títulos,
  barras y el filete superior de cada sección.
- **Los bordes blancos eran `@page { margin: 8mm }`** — el margen de la hoja
  dejaba ver el papel alrededor del bloque oscuro. Ahora `margin: 0` con el
  padding adentro del reporte, que pinta su fondo de borde a borde. Además el
  print CSS pinta `html`/`body` según el tema, porque las vars del reporte
  están scopeadas a su root y no llegan a `<body>`; por eso la página espeja
  `data-report-theme` en `<html>` (solo en print — en pantalla re-tematizaría
  la app entera).
- **Selector de tema claro/oscuro**, default **claro**. Aplica igual a la
  vista en pantalla y al PDF, manteniendo la invariante "página == PDF".
- **Selector de idioma del reporte (EN/ES) independiente del idioma de la app.**
  Un analista en inglés le manda a un cliente hispanohablante un reporte en
  español sin cambiar su propia UI. Implementado con un `LocaleProvider`
  anidado en modo `pinned` (prop nueva): no reconcilia con localStorage ni
  escribe la cookie, así ninguna de las dos preferencias se filtra a la otra.
  El mismo idioma se manda al stream, así que la narrativa de IA sale en el
  idioma del reporte.
- **Insights por sección.** Además del bloque "Analysis" de arriba, cada
  sección lleva una observación de IA sobre sus propios números
  ("Lo que destaca"). El modelo devuelve un objeto `sections` con 8 claves
  conocidas; `pickSections()` (con tests) descarta claves inventadas, valores
  no-string y prosa vacía — una sección sin nada interesante no renderiza nota.

**Agregado 2026-07-31 — sección "Analysis" escrita por IA.** Párrafos generados
con OpenAI (misma plomería que `app/api/ai/*`: key de Settings vía
`getOpenAiKey()`, `gpt-4o-mini`, JSON mode, `temperature 0.2`) que abren el
reporte antes de los números: resumen ejecutivo, panorama de amenazas,
hallazgos de credenciales y recomendaciones.

- **`lib/reports/narrative.ts`** — `buildNarrativeDigest()` (puro, con tests)
  arma un resumen de texto compacto con las cifras del reporte; el modelo
  **nunca** ve el `ClientReportData` completo (los perfiles por sensor y los
  blobs de malware llenarían el contexto sin aportar nada).
  `generateReportNarrative()` hace la llamada y devuelve `null` si no hay key
  configurada — no tener IA es un estado válido, no un error.
- **Se emite como un evento SSE `narrative` *después* de `result`**, en el
  mismo stream de `/api/reports/stream`. Consecuencias buscadas: el reporte se
  pinta apenas están los datos, el texto llega después, los datos nunca salen
  del server en un POST extra, y una caída/lentitud de OpenAI cuesta la prosa
  pero jamás el reporte. `maxDuration` subió a 60 por la llamada al modelo.
- El prompt le prohíbe inventar cifras y le exige encuadrar los logins exitosos
  como lo que son —**accesos a un señuelo, no una brecha del cliente**— y
  explicar por qué una tasa de éxito cercana al 100% es esperable en un
  honeypot en vez de presentarla como alarma.
- La sección lleva un disclaimer visible de que el texto es generado por IA.

**Agregado 2026-07-31 — "12-Month History" (ClickHouse).** Sección final opcional
alimentada por `/analytics/report-summary` del lake, con rango fijo de 1 año: da el
contexto de largo plazo que las demás secciones (ventaneadas a Postgres) no pueden
dar barato. Se omite entera si ClickHouse no está disponible. Detalle e implementación
en [ANALYTICS_MODULE.md → Fase F](ANALYTICS_MODULE.md).

### Archivos
**Nuevos:** `lib/reports/resolve-request.ts`, `app/api/reports/stream/route.ts`,
`components/reports/report-view.tsx`. **Modificados:** `lib/reports/collect.ts`
(`onProgress`), `app/api/reports/route.ts` (usa el resolver), `components/report-download.tsx`
(SSE + progreso + ReportView + print), `lib/i18n/dicts/reports.ts`, `app/globals.css`
(print CSS). Sin dependencias nuevas.

### Verificación (pendiente E2E)
1. `tsc --noEmit` limpio ✅ · unit test de presets/granularidad ✅.
2. Contra DB local `honeypot_full`: generar reporte de un cliente → barra avanza por
   etapas → el reporte aparece on-page; **Download PDF** (`window.print`) produce un PDF
   idéntico a lo que se ve.
3. Custom range acotado → KPIs/geo/creds cuadran; overview/mitre/bot NO cambian (límite
   conocido).
4. Isolation: superadmin dos clientes → números distintos; scoped pidiendo otro
   `clientId` → sus datos o 403.

### Fase 1.8 — Inteligencia de actores en el reporte (2026-08-03)

Estado: **implementada**. `tsc --noEmit` limpio; `npm test` 118/118 en verde.

Hasta aquí el reporte hablaba de agregados (MITRE, credenciales, geo) pero nunca de
**quién** atacó. Esta fase mete en el reporte la misma inteligencia que ya vive en
`/threats/[ip]`: score de riesgo, reputación externa cacheada y el análisis profundo
por actor del commit `f17e809` (modelo con búsqueda web, evidencia cruda en el prompt).

**Qué entra en el reporte**
- Tabla de los 6 actores de mayor score del período: IP, score/nivel, protocolos,
  actividad (sesiones SSH, comandos, hits web/servicio, si obtuvo shell), origen
  (país · org/ASN · usage type · hosting/VPN) y reputación (AbuseIPDB %, VT n/m).
- Ficha por actor con los factores del score, puertos sondeados, motores de VT que la
  marcan y —cuando hay análisis— perfil del actor, intención, sofisticación, tácticas
  clave, hallazgos de internet, IoCs extraídos, recomendación y fuentes citadas.
- Sección de IoCs agregados del período (`/iocs`): URLs de C2/payload, llaves SSH
  plantadas, indicadores de credenciales y fingerprints HASSH. Las familias vacías no
  se renderizan.
- El digest de la narrativa también recibe los actores y el conteo de IoCs, para que el
  resumen ejecutivo pueda nombrar la peor IP en vez de hablar de "los atacantes".

**Costo, que es la decisión de diseño real.** El análisis profundo es una llamada de
razonamiento + búsqueda web por IP. El colector lee primero `ai_threat_cache` (el mismo
que escribe la página de threats) y sólo genera los que falten, con presupuesto
`REPORT_AI_THREAT_LIMIT` (default 3, `0` lo desactiva). La reputación se lee **sólo de
`ip_enrichment_cache`**: el reporte nunca gasta cuota de AbuseIPDB/VT. Como preview y
descarga comparten caché, el PDF casi siempre lee lo que el preview ya generó; aun así
`maxDuration` de ambas rutas subió a 300.

**DRY:** la llamada al modelo salió del route handler a `lib/ai/threat-analyze.ts`
(`analyzeThreat`), que ahora usan tanto `/api/ai/threat-analysis` como el reporte —
una sola definición del prompt, del parseo y del write a caché. El formateo de
actores/IoCs vive en `lib/reports/shared/threat-intel-view.ts` y lo comparten el PDF y
la vista on-page, así no divergen.

**Archivos.** Nuevos: `lib/ai/threat-analyze.ts`, `lib/reports/threat-intel.ts`,
`lib/reports/shared/threat-intel-view.ts` (+ `.test.ts`),
`lib/reports/sections/threat-intel.tsx`, `lib/i18n/dicts/reports-threat-intel.ts`.
Modificados: `app/api/ai/threat-analysis/route.ts` (adelgazado), `lib/ai/threat-cache.ts`,
`components/ai-threat-summary.tsx` (import del tipo), `lib/reports/{collect,types,
template,narrative}.ts(x)`, `lib/reports/shared/format.ts` (`threatPeriod`),
`components/reports/report-view.tsx`, `app/api/reports/{route,stream/route}.ts`,
`lib/i18n/dictionaries.ts`.

**Límite conocido:** los actores salen de `/threats` con `period` en presets fijos
(24h/7d/30d/90d); un rango custom se redondea al preset que lo cubra, igual que ya pasa
con overview/mitre/bot. Mismo límite pre-existente de la fase 1.5.

---

### Fase 1.9 — Sensores, web y aislamiento por cliente en el entregable (2026-08-03)

Estado: **implementada**. `tsc --noEmit` limpio; `npm test` 124/124 en verde.

**El hallazgo que ordenó la fase.** Desde la 1.6 el entregable es `window.print()`
del `ReportView` (HTML), no el documento react-pdf. Toda la riqueza por sensor que
vive en `lib/reports/sensors/*.tsx` (páginas por sensor, web intelligence, protocol
intelligence, charts) **nunca llegaba al cliente**: el `ReportView` no tenía ni una
sección de sensores. La data ya se recolectaba y viajaba por el SSE; sólo faltaba
renderizarla en el HTML.

**Fuga entre tenants, corregida.** `credentialCampaigns` y `persistentAttackers` se
leían de `daily_credential_stats` / `daily_attacker_stats`, rollups que **no tienen
dimensión de sensor ni de cliente** — el reporte de un cliente mostraba credenciales
e IPs de las honeypots de otros. `credentialCampaigns` se eliminó (la sección de
credenciales del reporte ya trae lo mismo, y esa sí está scopeada);
`persistentAttackers` se reescribió en `lib/reports/persistent-attackers.ts` contando
días activos sobre `sessions`/`web_hits`/`protocol_hits` con `sensor_id = ANY(scope)`,
y pasó de repetirse en cada sensor a ser un dato de nivel cliente.

**Qué entra en el entregable**
- *Sensor Fleet*: KPIs (sensores desplegados, en línea, servicios emulados, eventos),
  barra de participación por sensor, tabla de **todos** los sensores del cliente —
  incluidos los que no vieron nada, marcados "sin eventos en este período", porque el
  silencio también es un resultado — y los atacantes que volvieron en varios días.
- *Web Attack Intelligence*: KPIs, mezcla de tipos de ataque como barra apilada,
  bloque "cómo leer esto" con canary hits, peticiones encadenadas, sesiones que rotan
  IP y profundidad media por sesión; tablas de rutas, métodos, canary tokens, sesiones
  dominantes y user agents. Los perfiles web de todos los sensores HTTP se suman en
  `lib/reports/shared/web-merge.ts` (los tipos de ataque se deduplican por etiqueta,
  no se suman dos veces).
- *Detalle por sensor* al cierre del reporte: KPIs, actividad diaria (barras) y por
  hora del día (heatmap), top de IPs atacantes con país/red/abuso, tipos de evento,
  credenciales, inteligencia de protocolo (Suricata, fingerprints SSH, SMB, FTP,
  bases de datos, puertos) y malware capturado. Los bloques vacíos no se renderizan.
- La narrativa IA recibe la flota completa y el bloque web, y gana tres observaciones
  nuevas por sección: `sensors`, `actors`, `web`.

**Charts sin dependencias.** El entregable se imprime; una librería de charts sobre
canvas sale en blanco o cortada. `components/reports/report-charts.tsx` son CSS/flex
puros: barras verticales diarias, heatmap de 24 celdas por opacidad (legible también
en escala de grises) y barra apilada de participación.

**Archivos.** Nuevos: `components/reports/{report-ui,report-charts,report-sensors,
report-web,report-threat-intel}.tsx`, `lib/reports/persistent-attackers.ts`,
`lib/reports/shared/web-merge.ts` (+ `.test.ts`), `lib/i18n/dicts/reports-sensors.ts`.
Modificados: `components/reports/report-view.tsx` (adelgazado a composición),
`lib/reports/{collect,types,narrative}.ts` (+ tests), `lib/reports/sensors/collect.ts`,
`lib/reports/sensors/protocols/collect.ts` (queries cross-tenant fuera),
`lib/reports/sensors/protocol-intelligence.tsx`, `lib/i18n/dictionaries.ts`.

**Deuda que queda:** el documento react-pdf (`lib/reports/template.tsx` + `sensors/`)
sigue existiendo en paralelo al HTML y ya divergen. O se borra, o se declara el
camino de PDF server-side; hoy nadie lo descarga.

---

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
