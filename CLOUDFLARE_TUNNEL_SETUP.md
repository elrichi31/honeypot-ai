# Cloudflare Tunnel — Guía de Configuración para Ingest API

## ¿Por qué Cloudflare Tunnel?

El servidor de producción (Telconet) aloja infraestructura crítica. Con Cloudflare Tunnel:

- El servidor **nunca abre puertos inbound** — solo hace una conexión saliente a Cloudflare.
- La **IP real del servidor no aparece** en DNS ni en ningún header HTTP.
- Los sensores de clientes se conectan a `https://ingest.tudominio.com`, no al servidor directamente.
- Cloudflare absorbe DDoS antes de que llegue al servidor.

```
[Sensores cliente]  →  HTTPS  →  [Cloudflare Edge]  →  Túnel saliente  →  [Servidor Telconet]
                                                         (outbound only)
```

---

## Prerequisitos

| Requisito | Detalle |
|---|---|
| Dominio | Cualquier dominio (ej. `honeytrap.io`). Puede ser barato (`.xyz`, `.online` desde $1/año). |
| Nameservers en Cloudflare | El dominio debe usar los nameservers de Cloudflare (plan gratuito funciona). |
| Acceso al servidor Telconet | SSH con sudo al servidor donde corre `ingest-api`. |
| `ingest-api` corriendo | El contenedor debe estar up en `localhost:3000`. |

> **Cloudflare Free tier es suficiente.** No se necesita ningún plan pago.

---

## Paso 1 — Agregar el dominio a Cloudflare

1. Ir a [dash.cloudflare.com](https://dash.cloudflare.com) → **Add a Site**.
2. Ingresar el dominio y seleccionar el plan **Free**.
3. Cloudflare mostrará dos nameservers (ej. `aria.ns.cloudflare.com`).
4. En el registrar del dominio, reemplazar los nameservers actuales por los de Cloudflare.
5. Esperar propagación (puede tardar hasta 24h, usualmente minutos).

---

## Paso 2 — Instalar `cloudflared` en el servidor Telconet

Ejecutar en el servidor Telconet con sudo:

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings

curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] \
https://pkg.cloudflare.com/cloudflared any main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list

sudo apt-get update && sudo apt-get install cloudflared
```

Verificar instalación:

```bash
cloudflared --version
```

---

## Paso 3 — Autenticar `cloudflared` con la cuenta Cloudflare

```bash
cloudflared tunnel login
```

Esto abre un link en el terminal. Abrirlo en el navegador, seleccionar el dominio y autorizar. Se genera automáticamente el archivo `/root/.cloudflared/cert.pem`.

---

## Paso 4 — Crear el túnel

```bash
cloudflared tunnel create honeytrap-ingest
```

Esto genera:
- Un **Tunnel UUID** (ej. `a1b2c3d4-...`). Anotar este valor.
- Un archivo de credenciales en `/root/.cloudflared/<TUNNEL-UUID>.json`.

Verificar que el túnel fue creado:

```bash
cloudflared tunnel list
```

---

## Paso 5 — Crear el archivo de configuración

Crear el archivo `/root/.cloudflared/config.yml`:

```bash
nano /root/.cloudflared/config.yml
```

Contenido del archivo (reemplazar `<TUNNEL-UUID>` y `tudominio.com`):

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /root/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: ingest.tudominio.com
    service: http://localhost:3000
  - service: http_status:404
```

> **Nota:** La última regla `http_status:404` es obligatoria — es el fallback para cualquier hostname no definido.

---

## Paso 6 — Crear el registro DNS

```bash
cloudflared tunnel route dns honeytrap-ingest ingest.tudominio.com
```

Esto crea automáticamente un registro CNAME en Cloudflare DNS apuntando al túnel. La IP del servidor nunca aparece en el DNS.

Verificar en Cloudflare Dashboard → DNS que existe el registro:
```
ingest.tudominio.com  CNAME  <TUNNEL-UUID>.cfargotunnel.com  (Proxied)
```

---

## Paso 7 — Probar antes de instalar como servicio

```bash
cloudflared tunnel --config /root/.cloudflared/config.yml run honeytrap-ingest
```

Desde otro servidor o máquina, probar:

```bash
curl -s https://ingest.tudominio.com/health
# Esperado: {"status":"ok"}
```

Si responde correctamente, el túnel funciona. Detener con `Ctrl+C`.

---

## Paso 8 — Instalar como servicio systemd (persistente)

```bash
sudo cloudflared --config /root/.cloudflared/config.yml service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

Verificar que está corriendo:

```bash
sudo systemctl status cloudflared
```

Ver logs en tiempo real:

```bash
sudo journalctl -u cloudflared -f
```

---

## Paso 9 — Configurar los sensores del cliente

En el `.env` o `docker-compose.yml` de cada sensor, cambiar:

```env
INGEST_API_URL=https://ingest.tudominio.com
INGEST_SHARED_SECRET=<el mismo shared secret>
```

No hay ningún otro cambio necesario. Los sensores continúan usando los mismos endpoints (`/ingest/cowrie/vector`, `/heartbeat`, etc.).

---

## Verificación final

Desde el servidor del sensor, probar conectividad:

```bash
# Health check
curl -s https://ingest.tudominio.com/health

# Test de ingest
curl -s -X POST https://ingest.tudominio.com/ingest/cowrie/vector \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Token: <INGEST_SHARED_SECRET>" \
  -d '[{"eventid":"cowrie.login.failed","timestamp":"2026-01-01T00:00:00Z","src_ip":"1.2.3.4","session":"test0001","sensor":"test"}]'
```

---

## Resumen de seguridad

| Aspecto | Estado |
|---|---|
| IP del servidor Telconet expuesta | ❌ Nunca |
| Puertos inbound abiertos en Telconet | ❌ Ninguno |
| Tráfico encriptado | ✅ TLS en todo el camino |
| Autenticación en el ingest | ✅ `X-Ingest-Token` |
| Protección DDoS | ✅ Cloudflare absorbe antes de llegar al servidor |
| Costo adicional | ✅ $0 (Cloudflare Free tier) |

---

## Troubleshooting

**El servicio no inicia:**
```bash
sudo journalctl -u cloudflared -n 50
# Verificar que el path del config y credentials en config.yml son correctos
```

**DNS no resuelve:**
```bash
# Verificar que el registro CNAME existe en Cloudflare Dashboard → DNS
# Esperar hasta 5 minutos para propagación
```

**`curl` devuelve 502 o 503:**
```bash
# Verificar que ingest-api está corriendo
docker ps | grep ingest-api
curl -s http://localhost:3000/health
```

**El túnel se desconecta frecuentemente:**
```bash
# cloudflared se reconecta automáticamente
# Si persiste, verificar conectividad saliente del servidor
curl -v https://api.cloudflare.com
```

---

## Referencias

- [Cloudflare Tunnel — Documentación oficial](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
- [Crear túnel local (CLI)](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/)
- [Correr como servicio en Linux](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/linux/)
- [Descargas de cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)
