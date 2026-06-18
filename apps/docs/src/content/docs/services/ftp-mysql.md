---
title: FTP y MySQL
description: Honeypots dedicados de FTP (full-interaction, con captura de uploads) y MySQL.
---

import { Aside } from '@astrojs/starlight/components';

Además de Dionaea, la plataforma incluye honeypots de Python dedicados para **FTP** y **MySQL**. Reportan vía `POST /ingest/protocol/event` igual que el resto de sensores de protocolo.

- **FTP:** `sensors/ftp-honeypot/app.py`.
- **MySQL:** `sensors/mysql-honeypot/app.py`.
- **Port honeypot:** `sensors/port-honeypot/app.py` (sondeos a puertos comunes).

---

## FTP honeypot (`:21`)

Servidor FTP de **interacción completa** que anuncia un banner realista (`vsFTPd 3.0.5`) y, lo más importante, implementa un canal de datos PASV/PORT funcional para **capturar uploads reales** (`STOR`).

- Los archivos subidos se guardan en el volumen compartido de binarios, nombrados por **MD5** con un sidecar `.meta.json` — el mismo layout que Dionaea — para que aparezcan en la vista de [Malware](/intelligence/malware/).
- Sirve archivos señuelo en `RETR` con **honeytokens por IP** para ver qué intenta exfiltrar el atacante.
- Captura credenciales y comandos (`USER`, `PASS`, `RETR`, `STOR`, ...).

Eventos emitidos:

| `eventType` | Datos |
|-------------|-------|
| `connect` | `srcIp`, `dstPort` (21) |
| `auth` | `username`, `password`, éxito |
| `command` | comando FTP |
| `file.upload` | `filename`, `size`, hash, `srcIp` |

---

## MySQL honeypot (`:3306`)

Implementa el **handshake del protocolo MySQL 5.7** para capturar intentos de autenticación contra el puerto 3306.

Eventos emitidos:

| `eventType` | Datos |
|-------------|-------|
| `connect` | `srcIp`, `dstPort` (3306) |
| `auth` | `username`, `password`, éxito |

---

## Configuración

Ambos sensores se configuran por variables de entorno:

| Variable | Para qué |
|----------|----------|
| `INGEST_API_URL` | URL de la ingest-api |
| `INGEST_SHARED_SECRET` | Token `X-Ingest-Token` |
| `PORT` / `DST_PORT` | Puerto de escucha / puerto anunciado |
| `SENSOR_ID` / `SENSOR_NAME` | Identidad del sensor |
| `CLIENT_SLUG` / `CLIENT_NAME` | Cliente (multi-tenant) al que pertenece |
| `SENSOR_IP` / `SENSOR_HOST` | IP y host reportados |

<Aside type="note">
Estos honeypots aparecen en el dashboard bajo [Protocol Hits](/services/dashboard/#protocol-hits-services) (`/services/ftp` y `/services/mysql`). Sus eventos alimentan el [risk score](/intelligence/threat-intelligence/) y la correlación cross-protocol.
</Aside>

---

## Relacionados

- [Dionaea (multi-protocolo)](/services/dionaea/) — alternativa multi-servicio.
- [Malware y captura de archivos](/intelligence/malware/) — dónde aparecen los uploads de FTP.
- [Salud de sensores](/services/sensors/) — estado online/offline.
