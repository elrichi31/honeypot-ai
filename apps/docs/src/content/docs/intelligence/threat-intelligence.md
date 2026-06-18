---
title: Threat Intelligence
description: Risk scoring por IP, clasificación de comandos, correlación cross-protocol y el grafo de amenazas.
---

import { Aside } from '@astrojs/starlight/components';

La plataforma agrega toda la actividad de un mismo atacante —SSH, HTTP, protocolos de red, port scans— en un único perfil de amenaza por IP, le asigna un **risk score de 0 a 100** y lo clasifica en niveles. Es el corazón analítico del producto.

- **Backend:** `apps/ingest-api/src/routes/threats.ts`, con el cálculo en `lib/risk-score.ts`, `lib/risk-factors.ts` y los pesos en `lib/risk-constants.ts`.
- **Dashboard:** `/threats` (ranking) y `/threats/:ip` (perfil de amenaza).

---

## Risk score

El score se suma a partir de cinco grupos de factores y se topa en **100**. Los cuatro factores que más contribuyen se muestran como `topFactors`.

### Niveles

| Score | Nivel |
|-------|-------|
| ≥ 80 | `CRITICAL` |
| 60–79 | `HIGH` |
| 40–59 | `MEDIUM` |
| 20–39 | `LOW` |
| < 20 | `INFO` |

### Factor SSH

- `floor(intentos_auth / 3)` puntos, con tope de **15**.
- **+25** si hubo login exitoso.
- El factor se considera relevante a partir de **10** intentos de autenticación.

### Factor web

Por cada tipo de ataque HTTP detectado:

| Tipo | Puntos |
|------|--------|
| `cmdi` (command injection) | 25 |
| `sqli` | 20 |
| `lfi` / `rfi` | 15 |
| `xss` | 10 |
| `info_disclosure` | 8 |
| `scanner` | 5 |
| `recon` | 2 |

Los tipos `cmdi`, `sqli`, `lfi` y `rfi` se consideran **serios**.

### Factor comandos

Cada categoría de comportamiento detectada en los comandos suma **una sola vez** (por patrones regex en `risk-constants.ts`):

| Categoría | Puntos |
|-----------|--------|
| `ssh_backdoor` | 30 |
| `honeypot_evasion` | 20 |
| `container_escape` | 20 |
| `malware_drop` | 20 |
| `persistence` | 20 |
| `solana_targeting` | 18 |
| `lateral_movement` | 15 |
| `crypto_mining` | 15 |
| `data_exfil` | 12 |
| `recon` | 5 |

### Factor protocolos de red

- **Port scans:** `min(10, max(3, ceil(puertos_únicos / 2)))`.
- **Intentos de auth:** `min(18, ceil(intentos / 2))` a partir de 4 intentos.
- **Comandos post-auth:** `min(12, nº × 3)`.
- **Conexiones repetidas:** +4 con ≥ 6 intentos.
- **Reutilización de credenciales** entre servicios: +8.
- **Ventana comprimida** (< 10 min con ≥ 2 familias de protocolo): +6.

### Factor cross-protocol

Cuando una misma IP toca **≥ 2 protocolos** (p. ej. SSH + MySQL, o HTTP + FTP):

- Base **+10**.
- **+5** por cada protocolo adicional, con tope de **15** extra.

<Aside type="tip">
La correlación cross-protocol es la señal más valiosa: un atacante que combina SSH con escaneo de MySQL y FTP es mucho más sofisticado que un bot de fuerza bruta de un solo servicio.
</Aside>

---

## Clasificación de sesiones

Independiente del score, cada sesión SSH recibe una etiqueta legible
(`apps/dashboard/lib/session-classify-v2.ts`). Las etiquetas por *threat tag*
tienen prioridad sobre las heurísticas:

| Etiqueta | Cuándo |
|----------|--------|
| SSH Backdoor | Plantó una llave SSH persistente |
| Honeypot Evasion | Detectó sandbox/honeypot |
| Container Escape | Intentó escapar del contenedor |
| Crypto Miner | Desplegó un minero |
| Data Exfil | Intentó exfiltrar datos |
| Targeted Crypto | Buscó infraestructura Solana |
| Burst / Slow brute-force | Fuerza bruta por ráfaga o lenta |
| Credential spray | Muchas credenciales automatizadas |
| Malware dropper / Interactive / Recon | Según volumen de comandos tras el login |
| Port probe / Scanner / Login only | Sin actividad relevante |

---

## Grafo de amenazas

El perfil de cada IP (`/threats/:ip`) incluye un **grafo** que conecta la IP con
su infraestructura (ASN, país), reputación (AbuseIPDB, VirusTotal), los
protocolos que tocó, las credenciales que probó, las categorías de comportamiento
y los IoCs extraídos de sus comandos (C2, llaves SSH plantadas, hashes). Se
construye en `apps/dashboard/lib/threat-graph.ts`.

---

## Enriquecimiento de IP

Al abrir un perfil, la IP se enriquece bajo demanda con **AbuseIPDB** (score de
abuso) e **ipinfo** (ASN, geolocalización), cacheado para no gastar cuota. Si el
score de abuso es ≥ 80 % se dispara una alerta de Discord. Las claves se
configuran en `/settings`.

---

## Relacionados

- [IoCs](/intelligence/iocs/) — exportar las IPs y hashes detectados.
- [Suricata (IDS)](/intelligence/suricata/) — detección a nivel de red.
- [Alertas de Discord](/services/discord-alerts/) — notificación al cruzar umbral.
- [API Reference](/api-reference/#threat-intelligence) — endpoints `/threats`.
