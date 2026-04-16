---
title: Seguridad
description: Analisis de la postura de seguridad del deployment, vectores de riesgo y mitigaciones aplicadas.
---

import { Aside } from '@astrojs/starlight/components';

## Que esta protegido

### Dashboard no accesible desde internet

En produccion (single-host y two-host), el dashboard hace bind a `127.0.0.1:4000` — no es alcanzable por ninguna IP externa. El acceso requiere un tunnel SSH activo o una VPN. Sin ese canal, el panel de control no existe para internet.

### Redes Docker segmentadas

Cuatro redes bridge con acceso minimo entre servicios:

| Red | Quien puede acceder |
|-----|---------------------|
| `edge` | Solo cowrie y web-honeypot |
| `honeypot_ingest` | web-honeypot, log-puller, ingest-api |
| `app_api` | ingest-api, dashboard |
| `db_private` | postgres, ingest-api, dashboard |

**Cowrie no tiene ruta hacia postgres, ingest-api ni el dashboard.** Un atacante que escapa el sandbox de Cowrie al contenedor solo esta en la red `edge`.

### Hardening de contenedores

Aplicado a todos los servicios en produccion:

```yaml
security_opt:
  - no-new-privileges:true   # impide escalar privilegios
cap_drop:
  - ALL                      # sin capabilities de kernel
pids_limit: 256              # protege contra fork bombs
```

Adicionalmente:
- `web-honeypot` y `log-puller` usan `read_only: true`
- `web-honeypot` corre con usuario sin privilegios (`app`)
- `log-puller` solo tiene acceso a `honeypot_ingest`, sin ruta a la DB

### Autorizacion entre servicios

`POST /ingest/*` requiere el header `X-Ingest-Token` con el valor de `INGEST_SHARED_SECRET`. Sin ese token, ingest-api rechaza la peticion con `401`. Esto evita que un atacante que conoce la IP interna de ingest-api pueda inyectar eventos falsos.

---

## Vectores de riesgo

### Escape de contenedor via exploit de kernel

**Nivel: bajo a medio**

El aislamiento de Docker depende del kernel del host. Con `cap_drop: ALL` y `no-new-privileges` el riesgo se reduce significativamente, pero vulnerabilidades tipo `runc escape` o `namespace bypass` han ocurrido historicamente (CVE-2019-5736, etc.).

**Mitigacion adicional posible:** correr con gVisor (`runsc`) o usar la topologia two-host para que el VPS honeypot no tenga datos sensibles.

### Single-host: blast radius total si algo escapa

**Nivel: medio**

En single-host, si un atacante escapa un contenedor al host, tiene acceso al mismo servidor donde viven postgres, ingest-api y el dashboard.

**Mitigacion:** usar la [topologia two-host](/deployment/two-host/) separa fisicamente los honeypots de los datos.

### Cowrie: simulacion, no sandbox completo

**Nivel: bajo**

Cowrie no es un sandbox de sistema operativo — es una simulacion de shell. Los comandos que el atacante ejecuta no corren en el host real. Sin embargo, si Cowrie mismo tuviera una vulnerabilidad explotable, el atacante llegaria al contenedor de Cowrie (que solo esta en la red `edge`).

---

## Resumen de postura

| Vector | Estado |
|--------|--------|
| Acceso al dashboard desde internet | Bloqueado — bind a `127.0.0.1` |
| Atacante escapa Cowrie hacia red interna | Bloqueado — red `edge` aislada |
| Atacante llega a postgres desde `edge` | Bloqueado — postgres no esta en `edge` |
| Inyeccion falsa de eventos en ingest-api | Bloqueado — `INGEST_SHARED_SECRET` |
| Escalada de privilegios dentro de un contenedor | Bloqueado — `no-new-privileges` + `cap_drop: ALL` |
| Escape de contenedor via exploit de kernel | Posible — bajo pero no cero |
| Blast radius si escapa (single-host) | Total en el mismo VPS |

<Aside type="tip">
Para mayor aislamiento, usa la topologia two-host y considera correr los contenedores de honeypot con un runtime alternativo como gVisor.
</Aside>

## Acceso al dashboard: buenas practicas

- **Tunnel SSH** — el metodo mas simple. No expone ningun puerto adicional.
- **Tailscale / WireGuard** — da acceso VPN al servidor, sigue siendo buena practica tunelizar hacia `127.0.0.1:4000`.
- **Cloudflare Tunnel** — alternativa si no quieres mantener claves SSH para acceso al panel.
- **No abrir `:4000` publicamente** — aunque better-auth protege el login, el dashboard no esta disenado para exposicion directa a internet.
