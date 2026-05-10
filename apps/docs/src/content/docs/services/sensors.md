---
title: Sensor Health Monitoring
description: Como funciona el sistema de registro y monitoreo de sensores via heartbeat.py y la pagina /sensors del dashboard.
---

import { Aside } from '@astrojs/starlight/components';

El sistema de sensor health monitoring permite que el dashboard sepa exactamente que sensores estan activos, cuando fue el ultimo heartbeat, y si sus puertos estan accesibles — todo sin depender de logs del honeypot.

---

## Conceptos clave

- **Sensor** — cualquier proceso que captura trafico (Cowrie, web-honeypot, Galah, Dionaea, ftp-honeypot, etc.)
- **Beacon** — sidecar Python (`heartbeat.py`) que corre junto al sensor y envia heartbeats periodicos
- **Heartbeat** — peticion `POST /sensors/heartbeat` enviada cada 30 segundos con metadata del sensor
- **Probe** — el ingest-api hace TCP probe en los puertos declarados para confirmar online/offline independientemente del beacon

---

## Flujo completo

```mermaid
sequenceDiagram
    participant B as heartbeat.py
    participant I as ingest-api
    participant DB as PostgreSQL
    participant D as Dashboard /sensors

    Note over B: Arranca junto al sensor
    B->>B: Detecta IP publica (ifconfig.me)
    B->>I: POST /sensors/heartbeat\n{sensorId, name, protocol, ip, ports, probePorts}
    I->>DB: UPSERT sensor\n{lastSeen = now, online = true}
    I->>I: TCP probe en probePorts

    loop cada 30s
        B->>I: POST /sensors/heartbeat
        I->>DB: UPDATE lastSeen
        I->>I: TCP probe → online = true/false
    end

    Note over I,DB: Si no hay heartbeat en >90s\nonline = false
    D->>I: GET /sensors
    I-->>D: Lista con online/offline/lastSeen/eventCount
```

---

## `heartbeat.py` — beacon generico

El script `sensors/cowrie/heartbeat.py` es un sidecar **reutilizable por cualquier sensor**. No tiene dependencias del honeypot especifico.

### Variables de entorno que consume

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `INGEST_API_URL` | `http://ingest-api:3000` | URL del ingest-api |
| `INGEST_SHARED_SECRET` | — | Token de autorizacion |
| `SENSOR_ID` | `sensor-<hostname>` | ID unico del sensor |
| `SENSOR_NAME` | `SSH Honeypot (Cowrie)` | Nombre legible en el dashboard |
| `SENSOR_IP` | auto-detectada | IP publica del sensor. Si no se pone, heartbeat.py la detecta via `ifconfig.me` |
| `SENSOR_PROTOCOL` | `ssh` | Protocolo principal: `ssh`, `http`, `port-scan`, `dionaea`, etc. |
| `SENSOR_VERSION` | `cowrie` | Version del honeypot |
| `SENSOR_PORTS` | `22` | Puertos que escucha (separados por espacios) |
| `SENSOR_PROBE_PORTS` | — | Puertos que el ingest-api sondea para verificar conectividad |
| `SENSOR_HOST` | — | Hostname Docker del contenedor del honeypot (para TCP probe interno) |

### Como montarlo en cualquier servicio

```yaml
mi-sensor-beacon:
  image: python:3.12-alpine
  restart: unless-stopped
  depends_on:
    - mi-sensor
  environment:
    SENSOR_ID: mi-sensor-prod-01
    SENSOR_NAME: "Mi Sensor - VPS Berlin"
    SENSOR_PROTOCOL: http
    SENSOR_PORTS: "80 443"
    SENSOR_PROBE_PORTS: "80"
    SENSOR_HOST: mi-sensor        # hostname Docker del contenedor real
    INGEST_API_URL: ${INGEST_API_URL}
    INGEST_SHARED_SECRET: ${INGEST_SHARED_SECRET}
  volumes:
    - sensors/cowrie/heartbeat.py:/heartbeat.py:ro
  command: ["python3", "/heartbeat.py"]
```

---

## Dashboard `/sensors`

La pagina muestra una tarjeta por sensor registrado:

```mermaid
graph LR
    subgraph "Tarjeta de sensor"
        N[Nombre + Protocolo]
        S[Estado Online/Offline\nindicador animado]
        IP[IP + Puertos]
        TS[Ultimo heartbeat]
        EC[Eventos recientes]
    end
```

### Protocolos soportados con icono

| Protocolo | Icono | Color |
|-----------|-------|-------|
| `ssh` | Server | Cyan |
| `http` | Globe | Verde |
| `ftp` | Server | Amarillo |
| `mysql` | Database | Purpura |
| `port-scan` | Network | Azul |
| `dionaea` | Network | Rojo |
| `smb` | Server | Naranja |
| `mssql` | Database | Rosa |
| `rpc` | Network | Indigo |
| `tftp` | Server | Lima |
| `mqtt` | Network | Teal |

---

## Endpoint `POST /sensors/heartbeat`

```http
POST /sensors/heartbeat
X-Ingest-Token: <INGEST_SHARED_SECRET>
Content-Type: application/json

{
  "sensorId": "cowrie-ssh-prod-01",
  "name": "SSH Honeypot (Cowrie) - VPS Berlin",
  "protocol": "ssh",
  "ip": "1.2.3.4",
  "version": "cowrie",
  "ports": [22],
  "probePorts": [22],
  "host": "cowrie"
}
```

**Respuesta:**
```json
{ "ok": true }
```

<Aside type="note">
`probePorts` son los puertos que el ingest-api intentara conectar via TCP para verificar que el sensor realmente esta escuchando. `host` es el hostname Docker — util cuando el probe se hace desde dentro de la red Docker y no desde internet.
</Aside>

---

## Agregar un sensor nuevo

1. Escribe el sidecar en `docker-compose`:

```yaml
mi-sensor-beacon:
  image: python:3.12-alpine
  restart: unless-stopped
  environment:
    SENSOR_ID: mi-sensor-01
    SENSOR_NAME: "Mi Protocolo Honeypot"
    SENSOR_PROTOCOL: mqtt
    SENSOR_PORTS: "1883"
    SENSOR_PROBE_PORTS: "1883"
    SENSOR_HOST: mi-sensor
    INGEST_API_URL: ${INGEST_API_URL}
    INGEST_SHARED_SECRET: ${INGEST_SHARED_SECRET}
  volumes:
    - sensors/cowrie/heartbeat.py:/heartbeat.py:ro
  command: ["python3", "/heartbeat.py"]
```

2. El sensor aparece automaticamente en `/sensors` del dashboard en el proximo heartbeat (maximo 30 segundos).

3. No necesitas modificar el codigo del ingest-api ni del dashboard — el sistema es totalmente dinamico.

---

## Troubleshooting

### El sensor aparece como Offline

- Verifica que `SENSOR_PROBE_PORTS` son los puertos correctos y accesibles desde el ingest-api
- Si el sensor esta en un host diferente, asegurate de que hay conectividad entre el ingest-api y el host del sensor
- Revisa los logs del beacon: `docker logs -f cowrie-beacon`

### No aparece ningun sensor

- Verifica que `INGEST_SHARED_SECRET` coincide entre el beacon y el ingest-api
- Comprueba que el ingest-api esta en la misma red Docker o accesible via `INGEST_API_URL`
- Haz un test manual: `curl -X POST http://localhost:3000/sensors/heartbeat -H "X-Ingest-Token: <secret>" -H "Content-Type: application/json" -d '{"sensorId":"test","name":"Test","protocol":"ssh","ports":[22]}'`
