---
title: Web Honeypot
description: Como funciona el honeypot HTTP, que rutas simula y como clasifica los ataques.
---

El web honeypot es una aplicacion Flask que actua como servidor web vulnerable. Responde de forma realista a los paths que los atacantes escanean automaticamente — WordPress, paneles admin, archivos de configuracion, etc. — y reporta cada hit a `ingest-api`.

## Arquitectura interna

```
Atacante HTTP ──▶ Flask (Gunicorn, 4 workers)
                        │
                  classifier.py   ←── clasifica el tipo de ataque por regex
                        │
                  responses.py    ←── genera la respuesta falsa realista
                        │
                  POST /ingest/web/event ──▶ ingest-api
```

## Tipos de ataque detectados

`classifier.py` analiza el path, los query params y el body de cada request con expresiones regulares:

| Tipo | Ejemplos de paths / payloads detectados |
|------|-----------------------------------------|
| `cmdi` | `?exec=whoami`, `cmd=ls`, payloads con `;`, `|`, `` ` ``, `$()` |
| `sqli` | `' OR 1=1`, `UNION SELECT`, `--`, `' AND SLEEP(` |
| `lfi` | `../`, `..%2F`, `/etc/passwd`, `/etc/shadow` |
| `rfi` | `http://` en parametros `file=`, `page=`, `include=` |
| `xss` | `<script>`, `onerror=`, `javascript:`, `alert(` |
| `info_disclosure` | `.env`, `.git/config`, `wp-config.php`, `backup.sql` |
| `scanner` | User-Agent de Nikto, nuclei, sqlmap, Nessus, Shodan |
| `recon` | Paths de admin generico, phpinfo, readme, `/server-status` |

## Respuestas falsas

`responses.py` devuelve respuestas que parecen reales para mantener el interes del atacante y obtener mas datos sobre sus herramientas:

- `/wp-login.php` — pagina de login de WordPress completa
- `/.env` — archivo de variables de entorno con datos falsos
- `/.git/config` — configuracion de repositorio Git falsa
- `/phpmyadmin/` — pagina de login de phpMyAdmin
- Cualquier ruta no reconocida — respuesta 404 de Apache falsa

## Configuracion en el proyecto

```yaml
# docker-compose.prod.single-host.yml
web-honeypot:
  ports:
    - "80:8080"
    - "8443:8080"
  environment:
    INGEST_API_URL: http://ingest-api:3000
    INGEST_SHARED_SECRET: ${INGEST_SHARED_SECRET}
  read_only: true          # filesystem inmutable
  tmpfs:
    - /tmp
  networks:
    - edge                 # red publica
    - honeypot_ingest      # acceso a ingest-api
```

## Hardening

- Corre con usuario `app` sin privilegios (definido en el Dockerfile)
- Filesystem `read_only` — no puede escribir nada fuera de `/tmp`
- `cap_drop: ALL` y `no-new-privileges`
- `pids_limit: 256`

## Probar el web honeypot localmente

```bash
# Rutas con respuestas falsas
curl http://localhost:8080/wp-login.php
curl http://localhost:8080/.env
curl http://localhost:8080/.git/config
curl http://localhost:8080/phpmyadmin/

# Ataques que se clasifican
curl "http://localhost:8080/search?q=1' OR 1=1--"          # sqli
curl "http://localhost:8080/page?file=../../../../etc/passwd"  # lfi
curl "http://localhost:8080/cmd?exec=whoami"               # cmdi
curl "http://localhost:8080/?s=<script>alert(1)</script>"  # xss

# 404 de Apache falso
curl http://localhost:8080/cualquier-ruta
```

Cada request aparece en el dashboard bajo Web Attacks.
