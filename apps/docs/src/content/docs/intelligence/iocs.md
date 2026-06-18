---
title: IoCs
description: Indicadores de compromiso exportables — IPs maliciosas y hashes de malware en CSV y JSON.
---

import { Aside } from '@astrojs/starlight/components';

La página `/iocs` reúne los **indicadores de compromiso** (IoCs) detectados por la plataforma y los deja listos para exportar y alimentar otros sistemas (firewalls, SIEMs, listas de bloqueo).

- **Dashboard:** `apps/dashboard/app/iocs/page.tsx`.
- **Exportación:** `apps/dashboard/lib/ioc-export.ts`.

---

## Qué se exporta

### IPs maliciosas

Todas las IPs cuyo [risk score](/intelligence/threat-intelligence/) las sitúa en nivel **CRITICAL, HIGH o MEDIUM**. Cada entrada incluye:

| Campo | Descripción |
|-------|-------------|
| `value` | La dirección IP |
| `score` | Risk score 0–100 |
| `level` | Nivel de riesgo |
| `protocols` | Protocolos que tocó (separados por `|`) |
| `source` | `honeypot` |

### Hashes de malware

El hash **MD5** de cada archivo capturado (binarios de Dionaea, descargas de Cowrie, uploads de FTP), deduplicado. Cada entrada incluye:

| Campo | Descripción |
|-------|-------------|
| `value` | Hash MD5 |
| `fileType` | Tipo detectado por magic bytes |
| `size` | Tamaño en bytes |
| `srcIp` | IP que entregó el archivo |
| `capturedAt` | Cuándo se capturó |
| `source` | Honeypot que lo capturó |

<Aside type="note">
Las IPs salen del catálogo de amenazas (`GET /threats`) y los hashes del catálogo de malware (`GET /malware/artifacts`). No hay endpoint dedicado a IoCs: la página los compone en el servidor a partir de esas dos fuentes.
</Aside>

---

## Formatos de exportación

Cada sección (IPs y hashes) se puede exportar en **CSV** o **JSON** directamente desde la interfaz.

---

## Relacionados

- [Threat Intelligence](/intelligence/threat-intelligence/) — de dónde sale el nivel de cada IP.
- [Malware y captura de archivos](/intelligence/malware/) — de dónde salen los hashes.
