---
title: Installing a Sensor
description: Como desplegar un sensor honeypot en un VPS Linux y verificar que reporta correctamente al dashboard.
---

Esta guia cubre el flujo completo para desplegar un sensor honeypot en cualquier VPS Linux usando el instalador generado por el dashboard, y como confirmar que esta funcionando.

---

## 1. Elegir los sensores y descargar el instalador

En el dashboard, abre **Sensors → Add sensor** (o, dentro de un cliente, **Sensor Installers**). Marca **todos** los protocolos que quieras desplegar — SSH, HTTP, FTP, MySQL, Port scanner — y descarga.

Obtienes **un solo** archivo `install-sensor-*.sh` que despliega todos los sensores seleccionados de una vez, con la URL de ingest y el shared secret ya embebidos. Cada protocolo se agrega como un servicio en el mismo `docker-compose.yml`, junto con un IDS Suricata y un shipper Vector.

> El nombre del archivo refleja lo que pediste: `install-sensor-ssh-http-port.sh`, `install-sensor-<cliente>-ssh.sh`, o `install-sensor-all.sh`.

---

## 2. Copiar el script al VPS y ejecutarlo como root

El instalador escribe en `/opt/honeypot-sensor` y gestiona Docker y el demonio SSH del host, asi que **debe correr como root**. Si no lo es, se relanza solo con `sudo`.

```bash
scp install-sensor-*.sh user@your-vps:~
ssh user@your-vps
sudo bash install-sensor-*.sh
```

Esto instala Docker si falta, baja las imagenes y arranca los contenedores.

---

## 3. Confirmar que los contenedores estan corriendo

```bash
cd /opt/honeypot-sensor
sudo docker compose ps
```

Todos los servicios deberian aparecer en estado `running`. Si alguno quedo en `exited`, revisa sus logs:

```bash
sudo docker compose logs --tail 50 <service>   # cowrie, web-honeypot, suricata, ...
```

El instalador ademas verifica esto automaticamente al final y muestra los logs de cualquier contenedor que haya crasheado al arrancar.

---

## 4. Confirmar que aparece en el dashboard

Cada sensor envia un heartbeat cada 30 segundos. En menos de un minuto deberia aparecer en la pagina **/sensors** como **Online**, con sus puertos probados via TCP.

- **SSH (Cowrie)** usa un sidecar liviano `heartbeat.py` que se descarga junto al script.
- **HTTP / FTP / MySQL / Port** reportan el heartbeat desde su propia imagen Docker.

Ver [Sensor Health Monitoring](/services/sensors/) para el detalle del mecanismo.

---

## 5. Verificar que la telemetria fluye

Genera un hit de prueba y confirma que llega. Para SSH, un login fallido alcanza:

```bash
ssh root@your-vps -p 22   # escribe una contrasena incorrecta
```

El intento deberia aparecer bajo **Sessions** / **Credentials** en el dashboard. Si necesitas observar el envio directamente:

```bash
sudo docker compose logs -f cowrie-beacon   # POST de heartbeat cada 30s (SSH)
```

---

## Atencion: puerto 22 al instalar el sensor SSH

Cuando instalas el honeypot SSH, el instalador mueve el `sshd` real al puerto **8022** para que Cowrie pueda escuchar en el 22. Tras instalar, reconectate con:

```bash
ssh user@your-vps -p 8022
```

Asegurate de que tu firewall permite el 8022 **antes** de desconectarte.

---

## Troubleshooting

### `curl: (23) ... write` durante la descarga de configs

El script no pudo escribir en `/opt/honeypot-sensor`. Corre el instalador con `sudo`, y verifica espacio en disco con `df -h /opt`.

### Un contenedor se cierra de inmediato

Normalmente es un puerto ya en uso. Identifica que lo ocupa con `sudo ss -tlnp` y libera el puerto o detén el servicio en conflicto.

### El sensor nunca aparece en /sensors

Confirma que el VPS puede alcanzar la URL de ingest embebida en el script, y que el contenedor de heartbeat esta arriba (`sudo docker compose logs cowrie-beacon` para SSH, o el contenedor del propio sensor en los demas casos).

### Los sensores capturan pero el dashboard no muestra nada — `Ingest returned 403`

Si en los logs del sensor ves algo como:

```
[WARNING] Ingest returned 403: <!DOCTYPE html>...<title>Just a moment...</title>
```

eso es el **challenge anti-bot de Cloudflare**: tu `INGEST_API_URL` esta detras de Cloudflare y este bloquea los POST de los sensores (clientes automatizados) antes de que lleguen al ingest-api. Los eventos se capturan pero se pierden en Cloudflare.

**Fix:** crea una WAF Custom Rule en Cloudflare que salte el challenge para las rutas de ingest. En el panel del dominio → **Security → WAF → Custom rules → Create rule**:

- Expresion (exige ademas el token compartido para no abrir las rutas a cualquiera):

  ```
  (starts_with(http.request.uri.path, "/ingest/") or starts_with(http.request.uri.path, "/sensors/"))
  and any(http.request.headers["x-ingest-token"][*] eq "<INGEST_SHARED_SECRET>")
  ```

- Action: **Skip** → marca *All managed rules*, *Super Bot Fight Mode*, y en "Also skip" *Security Level* y *Browser Integrity Check*. Deploy.

Verifica desde el VPS:

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
  -X POST <INGEST_API_URL>/ingest/cowrie/event \
  -H "X-Ingest-Token: <INGEST_SHARED_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"eventid":"cowrie.login.failed","src_ip":"1.2.3.4","username":"t","password":"t","timestamp":"2026-01-01T00:00:00Z","session":"abcd"}'
```

`200`/`201` = pasa; `403` con HTML = la regla aun no aplica; `401` = llego al ingest pero el token no coincide.

> Alternativa para labs locales: apunta `INGEST_API_URL` directo a la IP:puerto del ingest-api en la red local, evitando Cloudflare por completo.

### Suricata en bucle de reinicio (`Restarting`)

Suricata necesita la imagen custom del proyecto (`ghcr.io/<owner>/honeypot-ai/suricata`), cuyo entrypoint lee `SURICATA_INTERFACE` y trae las reglas ET Open pre-descargadas. Si el contenedor imprime el mensaje de ayuda de Suricata y sale, esta corriendo la imagen oficial sin el argumento `-i`. Actualiza el instalador (regenera el script desde el dashboard) y vuelve a desplegar:

```bash
sudo docker compose pull suricata
sudo docker compose up -d suricata
sudo docker compose logs --tail 20 suricata   # debe decir "Starting on interface: <iface>"
```
