# Error Handling & Traceability

Objetivo del usuario: cuando algo falla, el toast/mensaje que ve el usuario
debe dar una pista real de qué falló (no necesariamente técnico, pero sí
específico — no un "Something went wrong" genérico), y del lado del
servidor debe quedar suficiente contexto en los logs para rastrear la causa
real sin tener que reproducir el bug. Auditado el 2026-07-05 con un agente
de exploración + verificación manual de los hallazgos clave. Plan no
implementado — priorizado por apalancamiento (arreglar un helper compartido
vale más que arreglar un componente a la vez).

## Diagnóstico

### Hay DOS funciones distintas llamadas `apiFetch` — primera fuente de confusión

- [`apps/dashboard/lib/api/client.ts:7`](../../apps/dashboard/lib/api/client.ts#L7)
  — **server-side**, usada dentro de Server Components y en los
  data-fetchers de `lib/api/*.ts` (`credentials.ts`, `deception.ts`,
  `malware.ts`, `services.ts`, `sessions.ts`, `stats.ts`, `threats.ts`,
  `web.ts`). Firma: `apiFetch<T>(url, revalidate?, timeoutMs?): Promise<T>`.
- [`apps/dashboard/lib/client-fetch.ts:44`](../../apps/dashboard/lib/client-fetch.ts#L44)
  — **client-side** (`"use client"` components), inyecta el header
  `x-client-public-ip` en mutaciones. Firma: `apiFetch(input, init?):
  Promise<Response>` — devuelve la `Response` cruda, sin parsear nada.

Mismo nombre, comportamiento y contrato completamente distintos. Cualquier
fix debe dejar esto más claro (renombrar una de las dos, o al menos
documentarlo bien en el JSDoc de cada una) para que quien toque el código
después no las confunda.

### 1. `lib/api/client.ts`'s `apiFetch` descarta el mensaje de error del backend

```ts
// apps/dashboard/lib/api/client.ts:23
if (!res.ok) throw new Error(`API error ${res.status}: ${url}`)
```

El backend (`ingest-api`) ya construye un body `{ error: "mensaje real" }`
en casi todos sus fallos (ver `app.ts`'s `setErrorHandler`), pero esta
función nunca lee el body — solo el status code sobrevive. Cualquier
Server Component que haga `try { await fetchX() } catch (err) { ... }` solo
puede mostrar `"API error 500: http://..."`, nunca la causa real.

**Comparar con el patrón bueno que ya existe**: `proxyRaw` en
[`lib/api/proxy.ts:64-70`](../../apps/dashboard/lib/api/proxy.ts#L64-L70)
sí extrae `data.error` del body JSON antes de construir su resultado, y
distingue timeout (504) vs. inalcanzable (502) vs. no-JSON (502) vs. error
real del upstream. Este es el estándar a seguir — no hay que inventar nada
nuevo, solo replicar este patrón en `apiFetch`.

### 2. `lib/client-fetch.ts`'s `apiFetch` no parsea nada — cada componente reinventa el parseo

Devuelve la `Response` cruda a propósito (es solo un wrapper de
`x-client-public-ip`), así que cada uno de los ~26 archivos que la usan
tiene que manejar `!res.ok` a mano. Encontré al menos 3 variantes distintas
del mismo problema:

- **Variante A — parseo manual del body, mensaje real preservado** (la
  mejor de las tres, pero repetida):
  [`components/clients/edit-client-dialog.tsx`](../../apps/dashboard/components/clients/edit-client-dialog.tsx)
  ```ts
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Error ${res.status}`)
  }
  ```
  Mismo patrón, copiado con variaciones menores, en
  `client-sensor-catalog.tsx`, `client-forwarding-settings.tsx`,
  `create-client-dialog.tsx`, `delete-client-dialog.tsx`,
  `client-sensor-assignment.tsx`, `sensor-card.tsx`,
  `sensor-config-dialog.tsx`.

- **Variante B — solo status code, sin leer el body**:
  [`components/clients/client-ova-download.tsx`](../../apps/dashboard/components/clients/client-ova-download.tsx)
  ```ts
  .then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json() as Promise<OvaConfig & { error?: string }>
  })
  ```
  El body sí tiene `data.error` pero solo se lee en el `.then` de éxito, no
  en el branch de error — información tirada a la basura de nuevo.

- **Variante C — mensajes i18n fijos por status code, sin ningún detalle
  del servidor**:
  [`components/settings/discord-form.tsx`](../../apps/dashboard/components/settings/discord-form.tsx)
  ```ts
  if (res.status === 401 || res.status === 403) setTestError(t("set.discord.testAdmin"))
  else if (!res.ok) setTestError(t("set.discord.testFailed"))
  ```
  Aceptable para des-diferenciar "no tenés permiso" de "algo falló", pero
  el segundo caso podría incluir el detalle real del backend además del
  texto i18n genérico.

### 3. Los únicos 5 toasts reales de error son genéricos porque el catch descarta el mensaje

Todo en [`app/alerts/page.tsx`](../../apps/dashboard/app/alerts/page.tsx):
líneas 106, 128, 142, 155, 171 — `toast.error("Could not load alerts")`,
etc. En cada caso el fetch que falla hace `throw new Error()` **sin
argumento** unas líneas antes (126, 137, 153, 166), así que aunque
alguien quisiera hacer `toast.error(err.message)` no hay ningún mensaje
que mostrar — se perdió en el momento del throw, no en el toast.

Este es el único lugar de toda la app que usa `sonner`/`toast.error` para
errores reales (`alerts-bell.tsx` usa `toast.warning` para notificar una
alerta nueva, no un error). El resto de la UI usa estado inline
(`setError`/`setSaveError` + render condicional) en vez de toast — funciona
mejor para mensaje descriptivo, pero es inconsistente con la UX de
`alerts/page.tsx`. Fuera de alcance decidir "toast vs inline" como
estándar único en este plan — el fix aplica igual a ambos: preservar el
mensaje real, sea cual sea el widget que lo muestre.

### 4. El error handler global del backend ya está bien — el problema es aguas abajo

[`apps/ingest-api/src/app.ts:43-57`](../../apps/ingest-api/src/app.ts#L43-L57):

```ts
app.setErrorHandler((error: FastifyError, request, reply) => {
  if (error instanceof ZodError) {
    request.log.warn({ url: request.url }, 'Validation error')
    return reply.status(400).send({ error: 'Invalid request', details: error.flatten() })
  }
  const statusCode = error.statusCode ?? 500
  if (statusCode >= 500) {
    request.log.error({ err: error, url: request.url }, 'Unhandled route error')
    return reply.status(statusCode).send({ error: 'Internal server error' })
  }
  request.log.warn({ err: error, url: request.url }, 'Client error')
  return reply.status(statusCode).send({ error: error.message })
});
```

Esto ya es correcto: loguea con stack completo + URL antes de responder,
oculta el detalle interno en 5xx (por seguridad — no queremos filtrar SQL o
stacks al cliente), y sí devuelve el mensaje real en 4xx. **Lo único que le
falta es un identificador de correlación** (ver ítem 6) — hoy, para
encontrar el log de un error puntual reportado por un usuario, hay que
buscar por URL + rango de tiempo aproximado, no por un ID exacto.

El problema real está en dos lugares aguas abajo de este handler:

- **Controllers que responden error sin loguearlo primero.** Ejemplo
  concreto: [`ingest.controller.ts:70-73`](../../apps/ingest-api/src/modules/ingest/ingest.controller.ts#L70-L73)
  ```ts
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return reply.status(500).send({ error: msg });
  }
  ```
  Esto pasa por su propio `catch`, nunca llega al `setErrorHandler` global,
  y nunca llama `fastify.log.error`. El mensaje sí llega al cliente, pero
  si el cliente no reporta el toast exacto en el momento, no hay rastro en
  los logs del servidor para reconstruir qué pasó. Comparar con el patrón
  bueno ya existente en `web.controller.ts` (según el agente de
  exploración, líneas ~92-96), que sí loguea `srcIp`/`path`/`attackType`
  antes de responder.

- **Un caso de fallo silencioso presentado como éxito.**
  `malware.controller.ts` (líneas ~46-51 según el agente) captura un error
  de directorio faltante, hace `log.warn`, y responde
  `reply.send({ items: [], pagination: {...} })` — un **200 con lista
  vacía**. Desde la UI esto se ve idéntico a "no hay malware capturado
  todavía", no a "el disco de Dionaea no está montado". Es un caso legítimo
  de "degradar con gracia" mal aplicado: la intención (no romper el
  dashboard si el volumen de malware no está montado en este deployment) es
  válida, pero debería distinguirse de "no hay datos" con algún flag en la
  respuesta, no dejar que se vean igual.

### 5. Ninguna de las ~65 rutas API del dashboard loguea antes de responder error

Muestreado en `app/api/ai/threat-analysis/route.ts` (confirmado: cero
`console.error` en todo el archivo) y `app/api/sensors/[sensorId]/control/route.ts`.
Ambas sí devuelven un `message` real al cliente en el catch, pero si el
usuario nunca reporta el toast exacto, no hay ningún rastro server-side de
que el error ocurrió — Vercel/Next solo captura errores no atrapados
(`throw` sin catch), y estas rutas sí atrapan el error antes de que llegue
ahí. No existe un helper compartido para esto; cada ruta reinventa su
try/catch.

### 6. Sin identificador de correlación end-to-end

Ningún error trae un ID que conecte "lo que ve el usuario en el toast" con
"la línea exacta del log del servidor". Fastify ya asigna un `reqId`
interno por request (visible en los logs como `"reqId":"req-N"`), pero (a)
ese contador se reinicia en cada restart del proceso, no es único
globalmente, y (b) nunca se devuelve al cliente. El dashboard, al ser un
proceso Next.js separado, no comparte ese `reqId` — necesitaría generar el
suyo propio y pasarlo como header al hacer el proxy hacia ingest-api si se
quiere una traza completa navegador→dashboard→ingest-api.

## Plan de acción (orden de implementación)

### Fase 1 — Centralizar el parseo de error client-side (mayor apalancamiento)

1. **`lib/client-fetch.ts`**: agregar una función nueva (no modificar la
   firma de `apiFetch`/`apiFetchAudited` para no romper los ~26 call
   sites que ya esperan una `Response` cruda) — algo como:

   ```ts
   export class ApiError extends Error {
     constructor(message: string, public status: number) { super(message) }
   }

   /** Throws ApiError with the server's real error message on a non-ok response. */
   export async function assertOk(res: Response, fallback = "Request failed"): Promise<Response> {
     if (res.ok) return res
     const body = await res.json().catch(() => null) as { error?: string } | null
     throw new ApiError(body?.error || `${fallback} (${res.status})`, res.status)
   }
   ```

   Uso: `const res = await assertOk(await apiFetch(url, init))`. Esto
   reemplaza las 3 variantes duplicadas (A/B/C de arriba) por una sola
   línea, preservando el mensaje real del backend siempre que exista.

2. Migrar, uno por uno, los ~10 componentes que hoy reimplementan el
   parseo manual (`edit-client-dialog.tsx`, `client-sensor-catalog.tsx`,
   `client-forwarding-settings.tsx`, `create-client-dialog.tsx`,
   `delete-client-dialog.tsx`, `client-sensor-assignment.tsx`,
   `sensor-card.tsx`, `sensor-config-dialog.tsx`, `client-ova-download.tsx`,
   `discord-form.tsx` y el resto de `components/settings/*-form.tsx`) a
   usar `assertOk`. Cada migración es mecánica y de bajo riesgo — no cambia
   comportamiento cuando el body ya trae `error`, solo cuando no lo trae
   (ahí mejora, de "HTTP 500" a un mensaje con más contexto).

3. **`lib/api/client.ts`**'s `apiFetch` (server-side): aplicar el mismo
   principio que ya usa `proxyRaw` — leer el body de texto, intentar
   parsear JSON, y si trae `.error`, usarlo en el `throw`:

   ```ts
   if (!res.ok) {
     const text = await res.text().catch(() => "")
     let msg = `API error ${res.status}`
     try { const body = JSON.parse(text); if (body?.error) msg = body.error } catch {}
     throw new Error(msg)
   }
   ```

4. Documentar en el JSDoc de ambas `apiFetch` (client.ts y client-fetch.ts)
   que son funciones distintas con el mismo nombre, y por qué — para que
   nadie las confunda en un import futuro. Considerar (fuera de este plan,
   a discutir) renombrar una de las dos si se toca ese código de nuevo.

### Fase 2 — Arreglar los 5 toasts de `alerts/page.tsx`

Con `assertOk` ya disponible (Fase 1), cambiar los 5 call sites
(líneas 106/128/142/155/171 aprox.) para que el `catch` reciba el error
real y el toast lo interpole:

```ts
} catch (err) {
  toast.error(err instanceof Error ? err.message : "Could not load alerts")
}
```

En vez de descartar el error con `throw new Error()` sin argumento antes
del catch, propagar el mensaje real (o el `ApiError.message` de `assertOk`
si ya se ve algo descriptivo del backend).

### Fase 3 — Logging consistente en las rutas API del dashboard

Crear un helper compartido, por ejemplo `lib/api-error.ts`:

```ts
export function logAndRespond(err: unknown, context: Record<string, unknown>): NextResponse {
  const message = err instanceof Error ? err.message : String(err)
  console.error("[api]", context, err)
  return NextResponse.json({ error: message }, { status: 500 })
}
```

Adoptarlo en las rutas que hoy hacen `catch` sin loguear —
`app/api/ai/threat-analysis/route.ts`,
`app/api/sensors/[sensorId]/control/route.ts`, y el resto que el agente de
exploración detectó con el mismo patrón. No es necesario tocar las rutas
que ya solo relayan `proxyGet`/`proxyJson` (esas heredan el logging del
backend).

### Fase 4 — Backend: loguear antes de responder en los controllers que no pasan por el error handler global

- `ingest.controller.ts` (líneas 70-73, 107-110, 150-152): agregar
  `fastify.log.error({ err, ... }, 'mensaje')` antes de cada `return
  reply.status(500)` / antes de empujar a `errors[]`, siguiendo el patrón
  ya usado en `web.controller.ts`.
- `malware.controller.ts`: distinguir "directorio no montado" (fallo real
  de infraestructura, debería verse distinto en la UI) de "no hay
  artefactos" (0 resultados legítimos) — por ejemplo agregar un campo
  `degraded: true` a la respuesta cuando el directorio no está disponible,
  para que el dashboard pueda mostrar un aviso distinto de "sin datos".
  Requiere tocar también el componente que consume `/malware/artifacts`
  para leer ese flag.
- Barrer el resto de controllers buscando el patrón `catch (err) { ...
  return reply.status(5xx)... }` sin una llamada a `fastify.log.*` antes,
  y agregarla.

### Fase 5 (opcional, mayor esfuerzo) — Request-id de correlación end-to-end

Si se quiere trazabilidad completa navegador→dashboard→ingest-api:

1. En `ingest-api`, Fastify ya trae `request.id` — exponerlo en el body de
   error 5xx: `reply.status(500).send({ error: '...', requestId:
   request.id })`.
2. En el dashboard, cuando se muestra un toast de error, incluir ese
   `requestId` si viene en el body (formato corto, ej. al final del
   mensaje: `"No se pudo guardar (ref: req-42)"`), para que el usuario
   pueda reportarlo y sea grepeable exacto en los logs.
3. Para las rutas que no pegan directo a ingest-api sino que hacen lógica
   propia en el dashboard (OpenAI, Docker control, etc.), generar un id
   propio (`crypto.randomUUID().slice(0,8)`) en el `logAndRespond` de la
   Fase 3 y devolverlo también.

Esta fase es la de mayor esfuerzo relativo (toca ambos lados, más
disciplina para que todos los call-sites lo propaguen) — vale la pena solo
si el volumen de soporte/debugging de errores reportados por usuarios lo
justifica. Recomendado dejarla para después de validar que las Fases 1-4
ya resuelven el grueso del problema.

## Estado

**Fases 1-5 implementadas (2026-07-05).** Todo el plan cerrado.

- **Fase 1** — `assertOk`/`ApiError` agregados a
  [`lib/client-fetch.ts`](../../apps/dashboard/lib/client-fetch.ts); `apiFetch`
  server-side en [`lib/api/client.ts`](../../apps/dashboard/lib/api/client.ts)
  ahora parsea `.error` del body igual que `proxyRaw`; JSDoc en ambas
  funciones para no confundirlas. Migrados a `assertOk`: los ~10 componentes
  listados (edit/create/delete-client-dialog, client-sensor-catalog,
  client-forwarding-settings, client-sensor-assignment, sensor-card,
  sensor-config-dialog, client-ova-download) más `setting-card.tsx`'s
  `useConfigField.save()` y `alerts-form.tsx` (helpers compartidos, no
  estaban en la lista original pero tenían el mismo `throw new Error()` sin
  mensaje). `discord-form.tsx` ahora agrega el detalle del backend al texto
  i18n genérico cuando lo hay.
- **Fase 2** — los 5 toasts de `app/alerts/page.tsx` ahora muestran el
  mensaje real vía `assertOk`.
- **Fase 3** — `lib/api-error.ts`'s `logAndRespond` creado y adoptado en
  `api/ai/threat-analysis`, `api/sensors/[sensorId]/control`, `api/reports`,
  `api/users`, `api/ai/session-summary`. Las rutas que devuelven códigos no-500
  variables (`api/clients/[clientId]/crowdstrike-test`,
  `api/monitoring/system`, `api/monitoring/containers`,
  `api/monitoring/containers/stats`, `api/events/live`) se resolvieron con un
  `console.error` inline en vez de `logAndRespond` (que fuerza 500), para no
  cambiar el status code de respuesta existente.
- **Fase 4** — `ingest.controller.ts` ahora loguea con `fastify.log.error`
  antes de los 3 responses 500 que no pasaban por el error handler global.
  `malware.controller.ts`'s `/malware/artifacts` devuelve `degraded: true`
  cuando el directorio de Dionaea no está montado; el tipo se propagó a
  `MalwareArtifactsResponse` y `app/malware/page.tsx` muestra un banner de aviso
  (nueva key i18n `malware.degraded`) en vez de verse igual que "sin
  artefactos". Se barrieron el resto de controllers de `ingest-api`
  (`suricata.controller.ts`) — ya logueaban correctamente, no hizo falta
  tocarlos.
- **Fase 5** — request-id de correlación end-to-end, implementada 2026-07-05.
  - **`apps/ingest-api/src/app.ts`**: `setErrorHandler`'s branch ≥500 ahora
    devuelve `{ error: 'Internal server error', requestId: request.id }`
    (Fastify ya asigna `request.id` por request; solo faltaba exponerlo).
  - **`apps/dashboard/lib/api/proxy.ts`**: `ProxyResult`'s variante de error
    ganó un `requestId?: string`; `proxyRaw` lo extrae del body cuando el
    backend lo manda; `proxyGet`/`proxyResponse` lo incluyen en el
    `NextResponse.json` automáticamente — las 14 rutas que usan `proxyGet`
    tal cual heredan el passthrough sin tocarlas.
  - **Las 4 rutas de `/api/alerts`** (`route.ts` GET+DELETE, `read-all`,
    `[id]`, `[id]/read`) que arman su propio `Response.json({ error: ... })`
    a mano ahora también incluyen `requestId: result.requestId` — son las
    que alimentan los 5 toasts de `alerts/page.tsx` arreglados en la Fase 2.
  - **`apps/dashboard/lib/client-fetch.ts`**: `ApiError` ganó un campo
    `requestId?: string`; `assertOk` lo lee del body y, si está presente,
    lo agrega al mensaje como `"... (ref: xxxx)"` — automático para los
    ~147 call-sites de `assertOk` en toda la app, sin tocar cada componente.
  - **`apps/dashboard/lib/api/client.ts`** (server-side `apiFetch`): mismo
    tratamiento — agrega `(ref: ...)` al mensaje del `throw` cuando el body
    trae `requestId`.
  - **`apps/dashboard/lib/api-error.ts`**'s `logAndRespond`: para las rutas
    que no proxean a ingest-api (OpenAI, Docker control, etc.) genera su
    propio id corto (`crypto.randomUUID().slice(0,8)`), lo loguea junto al
    contexto y lo devuelve en el body.
  - **Alcance deliberado**: no se migraron las ~11 rutas restantes que
    arman `Response.json({ error })` a mano fuera de `/api/alerts` — el
    mecanismo (`ProxyResult.requestId`) ya existe y queda disponible para
    adoptarlo oportunistamente la próxima vez que se toque cada una; migrar
    todas de una fue considerado fuera de alcance (KISS, no era el pedido).
  - **Verificado en vivo** (Docker local, `docker compose up -d --build
    ingest-api dashboard`): con Postgres detenido momentáneamente,
    `GET /clients` contra `ingest-api` directo devolvió
    `{"error":"Internal server error","requestId":"req-e"}` con HTTP 500 —
    confirma el mecanismo real de punta a punta, no solo el tipo. La
    propagación completa BFF→toast se confirmó por code review + los tests
    existentes (matar Postgres también invalida la sesión de better-auth
    antes de llegar a la ruta de alerts, así que ese tramo específico no se
    pudo ejercitar en vivo sin romper el login; el parseo de `assertOk` se
    verificó aparte con el mismo body JSON que produce `ingest-api`,
    reproduciendo exactamente el mensaje `"Internal server error (ref:
    req-e)"`).

`tsc --noEmit` verificado limpio en `apps/dashboard` y `apps/ingest-api` tras
los cambios (los errores preexistentes de `@react-pdf/renderer` types y
`.next/types/validator.ts` no están relacionados). `vitest run` 96/96 en
`ingest-api`, `tsx --test` 37/37 en `dashboard`.
