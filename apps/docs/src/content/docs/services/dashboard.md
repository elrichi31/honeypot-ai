---
title: Dashboard
description: Paginas del dashboard Next.js para sesiones, web attacks, clientes, sensores y threat intelligence.
---

import { Aside } from '@astrojs/starlight/components';

El dashboard es una aplicacion Next.js 16 con App Router. Consulta datos a `ingest-api` desde el servidor y los presenta en vistas especializadas por tipo de ataque, por protocolo y ahora tambien por cliente.

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
    ROOT --> CLIENTS[/clients\nClient inventory]
    CLIENTS --> CLIENT_DETAIL[/clients/:slug\nAssign sensors + forwarding]
    ROOT --> SENSORS[/sensors\nEstado de sensores]
    ROOT --> CREDS[/credentials]
    ROOT --> CMDS[/commands]
    ROOT --> CAMP[/campaigns]
    ROOT --> SETTINGS[/settings\nConfiguracion]
    ROOT --> SETUP[/setup\nWizard inicial]
    ROOT --> USERS[/users\nGestion de usuarios]
    ROOT --> AUDIT[/audit\nAudit log]
```

---

## Paginas en detalle

### Overview (`/dashboard`)

Vista de resumen global:

- KPIs: sesiones totales, eventos, IPs unicas, logins exitosos y ataques hoy.
- Timeline de actividad SSH y web.
- Mapa de ataques por pais.
- Heatmap 7x24.
- Top IPs, top comandos y top credenciales.

### Feed en tiempo real (`/live`)

Stream de eventos a medida que llegan al ingest-api. Cada linea muestra protocolo, IP de origen, tipo de evento y timestamp.

### Sesiones SSH (`/sessions`)

Divide el trafico en dos tabs:

- **Sesiones**: conexiones autenticadas, con replay de comandos y badge de riesgo.
- **Escaneos**: conexiones fallidas agrupadas por IP, credenciales probadas y numero de intentos.

### Detalle de sesion (`/sessions/:id`)

Vista completa de una sesion individual:

- eventos ordenados cronologicamente
- comandos clasificados por tipo
- credenciales usadas
- AI threat analysis si OpenAI esta configurado

### Web Attacks (`/web-attacks`)

```mermaid
graph LR
    WEB[/web-attacks] --> AT[Attackers]
    WEB --> TL[Timeline]
    WEB --> PA[Paths]
    WEB --> GE[Geo]
    AT --> IP[/web-attacks/:ip]
```

| Sub-vista | Descripcion |
|-----------|-------------|
| **Attackers** | IPs agrupadas con total de hits, tipos de ataque, primera y ultima vez |
| **Timeline** | Grafica apilada por dia y tipo de ataque |
| **Paths** | Top 50 paths mas atacados |
| **Geo** | Mapa mundial con intensidad por pais |

### Threat Intelligence (`/threats`)

Correlacion cross-protocol y risk scoring:

- ranking de todas las IPs por risk score
- filtros por nivel de riesgo
- columnas de score, protocolos vistos, primera y ultima actividad, pais

### Protocol Hits (`/services`)

Actividad de protocolos de red capturados por FTP, MySQL, port-honeypot y Dionaea.

| Sub-vista | Descripcion |
|-----------|-------------|
| `/services/ftp` | Hits FTP |
| `/services/mysql` | Intentos de conexion MySQL |
| `/services/ports` | Port scans y puertos sondeados |

### Sensores (`/sensors`)

Estado en tiempo real de todos los sensores registrados:

- tarjeta por sensor con estado Online o Offline
- protocolo, IP, puertos y version
- ultimo heartbeat
- contador de eventos

Si el sensor pertenece a un cliente, la vista tambien refleja esa separacion para que el inventario operativo coincida con `/clients`.

### Clientes (`/clients`)

Nueva vista de inventario multi-cliente:

- boton `+ Add Client`
- modal para crear `name`, `slug`, `description` y `forwardUrl`
- resumen por cliente con cantidad de sensores, online y eventos
- entrada al detalle del cliente

### Detalle de cliente (`/clients/:slug`)

Cada cliente tiene su propia vista operativa:

- bloque `Assigned Sensors`
- bloque `Unassigned Sensors`
- accion `Assign`
- accion `Unassign`
- seccion `Client Forwarding` para definir la URL de reenvio

Flujo sugerido:

1. creas el cliente
2. entras al cliente
3. asignas sensores
4. si quieres, activas forwarding

### Configuracion (`/settings`)

Organizada en secciones:

| Seccion | Que configura |
|---------|--------------|
| **Infrastructure** | IP del honeypot y puertos |
| **Notifications** | Discord webhook y umbral de alertas |
| **AI Analysis** | OpenAI API key y modelo |
| **Enrichment** | AbuseIPDB API key e ipinfo token |
| **Timezone** | Zona horaria IANA para las graficas |

<Aside type="note">
Las configuraciones guardadas en `/settings` se almacenan en PostgreSQL y tienen prioridad sobre las variables de entorno del contenedor.
</Aside>

### Gestion de usuarios (`/users`)

Control de acceso al dashboard:

- tabla de todos los usuarios registrados con nombre, email y fecha de creacion
- badge "tu" sobre el usuario actual
- boton **Crear usuario** que abre un modal con nombre, email y contrasena (toggle de visibilidad)
- boton de eliminar por usuario (oculto para el usuario en sesion activa)

Ver [Gestion de Usuarios](/services/user-management) para la documentacion completa.

### Audit Log (`/audit`)

Registro de todas las acciones realizadas en la plataforma:

- tabla paginada con fecha exacta, usuario, tipo de accion, recurso y IP
- badges de color por accion (verde = creacion, rojo = eliminacion, cyan = actualizacion, etc.)
- filtros por accion y por tipo de recurso
- expansion de fila para ver el JSON completo de detalles
- paginacion de 50 entradas por pagina

Ver [Audit Log](/services/audit-log) para la documentacion completa.

### Setup inicial (`/setup`)

Wizard que guia al usuario en la primera configuracion:

1. crear cuenta de usuario
2. configurar infraestructura
3. verificar conectividad con el ingest-api
4. configurar notificaciones opcionales

---

## Navegacion y estados de carga

El dashboard ahora incluye loaders compartidos en `app/loading.tsx` y en subrutas clave para que la transicion entre paginas no se sienta congelada.

El patron visual actual usa:

- fondo igual al shell principal
- spinner neutro gris
- skeletons grises y negros
- versiones especificas para subpaginas como `/clients/:slug`, `/sessions/:id` y `/web-attacks/:ip`

---

## Auth

El dashboard usa [better-auth](https://www.better-auth.com/) para autenticacion. Las sesiones se almacenan en PostgreSQL.

<Aside type="caution">
`BETTER_AUTH_URL` debe coincidir exactamente con el origen desde el que accedes al dashboard. Si accedes via un tunnel SSH en un puerto diferente al 4000, actualiza esta variable.
</Aside>

---

## Configuracion en Docker Compose

### Single-host

```yaml
dashboard:
  ports:
    - "127.0.0.1:4000:4000"
  environment:
    INTERNAL_API_URL: http://ingest-api:3000
    DATABASE_URL: postgresql://honeypot:${POSTGRES_PASSWORD}@postgres:5432/honeypot_prod
    BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
    BETTER_AUTH_URL: ${BETTER_AUTH_URL}
    DISCORD_WEBHOOK_URL: ${DISCORD_WEBHOOK_URL:-}
    DASHBOARD_TIMEZONE: ${DASHBOARD_TIMEZONE:-UTC}
```

### Multi-VM local core

```yaml
dashboard:
  ports:
    - "4000:4000"
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
npm run dev
npm run build
npm run start
```
