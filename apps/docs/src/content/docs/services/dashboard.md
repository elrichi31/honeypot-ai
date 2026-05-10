---
title: Dashboard
description: Todas las paginas del dashboard Next.js — sesiones, web attacks, threat intelligence, sensores, configuracion y mas.
---

import { Aside } from '@astrojs/starlight/components';

El dashboard es una aplicacion Next.js 16 con App Router. Consulta datos a `ingest-api` desde el servidor (Server Components) y los presenta en vistas especializadas por tipo de ataque.

---

## Mapa de paginas

```mermaid
graph TD
    ROOT[/] --> DASH[/dashboard\nOverview + KPIs]
    ROOT --> LIVE[/live\nFeed en tiempo real]
    ROOT --> SESS[/sessions\nSesiones SSH]
    SESS --> SESS_ID[/sessions/:id\nDetalle de sesion]
    ROOT --> WEB[/web-attacks\nTabla de atacantes]
    WEB --> WEB_GEO[/web-attacks/geo\nMapa geografico]
    WEB --> WEB_PATH[/web-attacks/paths\nTop paths]
    WEB --> WEB_TL[/web-attacks/timeline\nTimeline por dia]
    WEB --> WEB_IP[/web-attacks/:ip\nDetalle por IP]
    ROOT --> THREATS[/threats\nRisk scoring por IP]
    THREATS --> THREATS_IP[/threats/:ip\nPerfil de amenaza]
    ROOT --> SERVICES[/services\nProtocol hits]
    SERVICES --> SVC_FTP[/services/ftp]
    SERVICES --> SVC_SQL[/services/mysql]
    SERVICES --> SVC_PORT[/services/ports]
    ROOT --> SENSORS[/sensors\nEstado de sensores]
    ROOT --> CREDS[/credentials]
    ROOT --> CMDS[/commands]
    ROOT --> CAMP[/campaigns]
    ROOT --> SETTINGS[/settings\nConfiguracion]
    ROOT --> SETUP[/setup\nWizard inicial]
```

---

## Paginas en detalle

### Overview (`/dashboard`)

Vista de resumen global:

- KPIs: sesiones totales, eventos, IPs unicas, logins exitosos, ataques hoy
- Activity timeline — SSH + web hits por dia (ultimos 30 dias)
- Mapa de ataques por pais
- Heatmap 7×24 (dia de semana × hora)
- Top IPs, top comandos, top credenciales

### Feed en tiempo real (`/live`)

Stream de eventos a medida que llegan al ingest-api. Cada linea muestra protocolo, IP de origen, tipo de evento y timestamp.

### Sesiones SSH (`/sessions`)

Divide el trafico en dos tabs:

**Sesiones** — conexiones autenticadas (`loginSuccess = true`)
- Timeline de eventos expandible por sesion
- Replay de comandos ejecutados
- Badge de riesgo con link al perfil de amenaza
- AI summary (si OpenAI esta configurado)

**Escaneos** — conexiones fallidas agrupadas por IP
- Credenciales probadas
- Version del cliente SSH detectada
- Numero de intentos

### Detalle de sesion (`/sessions/:id`)

Vista completa de una sesion individual:
- Todos los eventos ordenados cronologicamente
- Comandos clasificados por tipo (recon, malware, persistence, etc.)
- Credenciales usadas
- AI threat analysis con TTPs detectadas

### Web Attacks (`/web-attacks`)

```mermaid
graph LR
    WEB[/web-attacks] --> AT[Attackers\nTop IPs]
    WEB --> TL[Timeline\nBarras por dia]
    WEB --> PA[Paths\nTop 50]
    WEB --> GE[Geo\nMapa mundial]
    AT --> IP[/web-attacks/:ip\nDetalle completo]
```

| Sub-vista | Descripcion |
|-----------|-------------|
| **Attackers** | IPs agrupadas con total de hits, tipos de ataque, primera/ultima vez |
| **Timeline** | Grafica apilada por dia y tipo de ataque + pie chart |
| **Paths** | Top 50 paths mas atacados |
| **Geo** | Mapa mundial con intensidad por pais (escala logaritmica) |

### Detalle de IP web (`/web-attacks/:ip`)

Perfil completo de un atacante HTTP: todos sus hits, paths intentados, user agents, distribucion de tipos de ataque y timeline de actividad.

### Threat Intelligence (`/threats`)

Correlacion cross-protocol y risk scoring:

- Ranking de todas las IPs por risk score (0–100)
- Filtros por nivel de riesgo (CRITICAL / HIGH / MEDIUM / LOW / INFO)
- Columnas: score, protocolos vistos, primera/ultima actividad, pais

**Niveles de riesgo:**

| Nivel | Score | Criterio tipico |
|-------|-------|-----------------|
| CRITICAL | 80–100 | Login SSH + comandos de malware/persistencia |
| HIGH | 60–79 | Multiples vectores de ataque graves |
| MEDIUM | 40–59 | Ataques web severos o SSH con comandos |
| LOW | 20–39 | Reconocimiento basico |
| INFO | 0–19 | Escaneo puntual sin actividad relevante |

### Perfil de amenaza (`/threats/:ip`)

Vista completa por IP:
- Score breakdown por categoria
- Comandos ejecutados clasificados por tipo
- Timeline SSH y web en una misma vista
- IP enrichment (AbuseIPDB, ipinfo.io) si esta configurado

### Protocol Hits (`/services`)

Actividad de protocolos de red capturados por ftp-honeypot, mysql-honeypot, port-honeypot y Dionaea:

| Sub-vista | Descripcion |
|-----------|-------------|
| `/services/ftp` | Hits FTP: IPs, puertos, timestamps |
| `/services/mysql` | Hits MySQL: intentos de conexion |
| `/services/ports` | Port scans: puertos sondeados, IPs |

### Sensores (`/sensors`)

Estado en tiempo real de todos los sensores registrados:

- Tarjeta por sensor con estado Online/Offline (indicador animado)
- Protocolo, IP, puertos, version
- Ultimo heartbeat (relativo: "2m ago")
- Contador de eventos del periodo

Ver [Sensor Health Monitoring](/services/sensors/) para la arquitectura completa.

### Configuracion (`/settings`)

Organizadas en secciones:

| Seccion | Que configura |
|---------|--------------|
| **Infrastructure** | IP del honeypot, puertos SSH e ingest |
| **Notifications** | Discord webhook URL, umbral de alertas |
| **AI Analysis** | OpenAI API key, modelo |
| **Enrichment** | AbuseIPDB API key, ipinfo token |
| **Timezone** | Zona horaria IANA para las graficas |

<Aside type="note">
Las configuraciones guardadas en `/settings` se almacenan en PostgreSQL y tienen prioridad sobre las variables de entorno del contenedor.
</Aside>

### Setup inicial (`/setup`)

Wizard que guia al usuario en la primera configuracion:
1. Crear cuenta de usuario
2. Configurar infraestructura (IPs, puertos)
3. Verificar conectividad con el ingest-api
4. Configurar notificaciones opcionales (Discord)

Redirige al dashboard una vez completado.

---

## Auth

El dashboard usa [better-auth](https://www.better-auth.com/) para autenticacion. Las sesiones se almacenan en PostgreSQL. 

<Aside type="caution">
`BETTER_AUTH_URL` debe coincidir **exactamente** con el origen desde el que accedes al dashboard (protocolo + host + puerto). Si accedes via un tunnel SSH en un puerto diferente al 4000, actualiza esta variable.
</Aside>

---

## Configuracion en Docker Compose

### Single-host

```yaml
dashboard:
  ports:
    - "127.0.0.1:4000:4000"   # solo loopback
  environment:
    INTERNAL_API_URL: http://ingest-api:3000
    DATABASE_URL: postgresql://honeypot:${POSTGRES_PASSWORD}@postgres:5432/honeypot_prod
    BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
    BETTER_AUTH_URL: ${BETTER_AUTH_URL}
    DISCORD_WEBHOOK_URL: ${DISCORD_WEBHOOK_URL:-}
    DASHBOARD_TIMEZONE: ${DASHBOARD_TIMEZONE:-UTC}
  networks:
    - app_api
    - db_private
```

### Multi-VM local core

```yaml
dashboard:
  ports:
    - "4000:4000"              # accesible en la red local
  environment:
    HONEYPOT_IP: ${HONEYPOT_IP:-}
    HONEYPOT_SSH_PORT: ${HONEYPOT_SSH_PORT:-22}
    HONEYPOT_INGEST_PORT: ${HONEYPOT_INGEST_PORT:-3000}
```

---

## Desarrollo local

```bash
cd apps/dashboard
npm install
npm run dev      # http://localhost:4000

npm run build    # build de produccion
npm run start    # sirve el build
```
