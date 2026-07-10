# IoCs Page — Global Threat Intel

La página `/iocs` es la vista central de indicadores de compromiso del honeypot,
**global** (toda la intel, sin scoping por cliente — a diferencia de `/threats`).

## Estado

### Fase 1 — Enriquecimiento (2026-07-10)

De dos listas simples (IPs + hashes con copy/CSV/STIX) a una vista completa:

- **Nuevos tipos de IoC**: C2 endpoints y planted SSH keys, agregados **globalmente
  en el backend** (antes solo se extraían client-side, por sesión, en
  `botnet-signatures.ts`). Nuevo módulo `apps/ingest-api/src/modules/iocs/`
  (controller/service/repository) + `GET /iocs?period=`. El repo escanea `events`
  (`event_type='command.input'`) pre-filtrado en SQL (`authorized_keys`, `/dev/tcp/`,
  `http(s)://`, `Host:`) para acotar el scan, y corre la extracción regex portada a
  `apps/ingest-api/src/lib/ioc-extract.ts` (puro, sin DB — respeta el layering).
  Cacheado con `withCache` 180s por ventana.
- **Filtros por URL**: selector de periodo (24h/7d/30d/90d) + nivel de riesgo,
  reusando el patrón de `/threats` (`components/ioc-filters.tsx`,
  `NavTransitionProvider`, `MultiSelectCombobox`). El periodo se propaga a
  `fetchThreats` y `fetchAggregatedIocs`.
- **Stat row**: 4 `<StatCard>` (IPs / hashes / C2 / SSH keys).
- **Drill-downs**: IP → `/threats/{ip}`, hash → VirusTotal, C2/SSH key → threat de
  su `srcIp` de origen. Provenance (`srcIp`, `firstSeen`) mostrada en la meta-line.
- **Exports nuevos**: MISP JSON (por sección) + bundle unificado "Exportar todo"
  (CSV/STIX/MISP con todos los tipos en un archivo). STIX ampliado para c2/sshkey.
  Ver `lib/ioc-export.ts` (`toMispEvent`, `toBundle`, `stixPattern` ampliado).
- **i18n**: `iocs.*` movido a English-first + keys nuevas en `dicts/iocs.ts`
  (el componente antes tenía español hardcodeado).

**Archivos clave**:
- Backend: `modules/iocs/*`, `lib/ioc-extract.ts`, ruta registrada en `app.ts`.
- Dashboard: `app/iocs/page.tsx`, `components/ioc-section.tsx`, `components/ioc-filters.tsx`,
  `components/ioc-bundle-export.tsx`, `lib/api/iocs.ts`, `lib/ioc-export.ts`,
  `lib/i18n/dicts/iocs.ts`.

**Verificado**: tsc backend + dashboard limpios; tests `ioc-export.test.ts` (8) y
`botnet-signatures.test.ts` (8) pasan; lógica de extracción y formatos STIX/MISP
verificados con muestras realistas de payloads (wget/curl, `/dev/tcp`, `Host:`,
`mdrfckr` authorized_keys).

**Verificado E2E (2026-07-10)**: rebuild del contenedor `ingest-api` (corría una
imagen vieja sin el módulo `iocs`) + `GET /iocs` probado contra datos reales de
prod locales: `period=90d` devuelve 4 C2 endpoints reales (incl. un pool
minexmr y un binario ARM7) + 1 SSH key plantada con `srcIp`/`firstSeen`;
`period=24h` acota correctamente a 1 hit; `period=bogus` → 400 con el mensaje
Zod esperado. `/malware/artifacts` sigue funcionando. Dashboard: el rebuild del
contenedor (`docker compose build dashboard`) falló por un bug de Docker
Desktop/buildkit en Windows (`invalid file request components.json`, choque de
prefijo entre `components/` y `components.json`; sobrevivió a cache prune +
restart de Docker Desktop — no es del código). Verificado en su lugar corriendo
`npm run dev` (puerto 3001) contra el ingest-api ya reconstruido: boot limpio,
`tsc --noEmit` limpio, `/iocs` resuelve y redirige correctamente a `/login`
(middleware/routing intactos). Falta solo el check visual autenticado
(filtros/stat-row/exports en el navegador).

**Pendiente**:
- `fetchMalwareArtifacts` no soporta `period` — los hashes no se filtran por
  ventana temporal aún (se traen los 200 más recientes). Añadir `period` al
  endpoint de malware si se quiere consistencia.
- Ideas futuras: correlación IP↔hash↔botnet family, "nuevos hoy", top botnet
  family en el stat row, sección de IoCs por familia de botnet.
- Reconstruir el contenedor `honeypot-dashboard` cuando se resuelva el bug de
  buildkit (o desde otra máquina/CI) para que el deploy local no quede en una
  imagen vieja.
