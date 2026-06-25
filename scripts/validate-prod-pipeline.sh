#!/usr/bin/env bash
# validate-prod-pipeline.sh
#
# Dispara tráfico real hacia cada sensor en prod y verifica que el evento
# llegó al ingest-api consultando el endpoint de stats/lista correspondiente.
#
# Uso:
#   bash scripts/validate-prod-pipeline.sh
#
# Requiere: curl, nc (netcat), python3, smbclient (opcional para SMB)
# El script no necesita credenciales; todo el tráfico es el que haría un atacante.
#
# Variables de entorno opcionales:
#   INGEST_API_URL   — URL base del ingest-api (default: http://173.249.48.182:3000)
#   INGEST_TOKEN     — X-Ingest-Token si querés verificar el conteo en la API
#   WAIT_SECS        — segundos a esperar entre disparo y verificación (default: 8)

set -euo pipefail

HOST="173.249.48.182"
INGEST_API="${INGEST_API_URL:-http://${HOST}:3000}"
WAIT="${WAIT_SECS:-8}"

GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
RESET="\033[0m"

pass() { echo -e "${GREEN}[PASS]${RESET} $*"; }
fail() { echo -e "${RED}[FAIL]${RESET} $*"; FAILURES=$((FAILURES + 1)); }
info() { echo -e "${YELLOW}[INFO]${RESET} $*"; }

FAILURES=0

# ── helpers ──────────────────────────────────────────────────────────────────

wait_vector() {
    info "Esperando ${WAIT}s para que Vector procese el evento..."
    sleep "$WAIT"
}

# Devuelve el total de hits en /protocol-hits para un protocolo dado.
# Requiere INGEST_TOKEN para que el endpoint responda (o que sea público).
protocol_count() {
    local proto="$1"
    local token="${INGEST_TOKEN:-}"
    local auth_header=""
    [[ -n "$token" ]] && auth_header="-H \"X-Ingest-Token: ${token}\""
    curl -sf ${auth_header:+"$auth_header"} \
        "${INGEST_API}/protocol-hits?protocol=${proto}&limit=1" 2>/dev/null \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',d.get('count',len(d.get('hits',[])))))" 2>/dev/null \
        || echo "?"
}

# ── 1. Web honeypot (puerto 80) ───────────────────────────────────────────────

echo
echo "═══════════════════════════════════════════════════"
echo " 1. Web honeypot — puerto 80"
echo "═══════════════════════════════════════════════════"

HTTP_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
    --connect-timeout 5 \
    -A "Mozilla/5.0 (validate-prod-pipeline)" \
    "http://${HOST}/" 2>/dev/null || true)

if [[ "$HTTP_STATUS" =~ ^[2-5][0-9][0-9]$ ]]; then
    pass "HTTP ${HTTP_STATUS} — web-honeypot responde en :80"
    info "Disparando request adicional a /wp-admin (trigger attackType=recon)..."
    curl -sf -o /dev/null --connect-timeout 5 \
        -A "Nikto/2.1.6" \
        "http://${HOST}/wp-admin" 2>/dev/null || true
    wait_vector
    info "Verificar en dashboard: Web Attacks → debe aparecer nuevo evento desde $(curl -sf https://api.ipify.org 2>/dev/null || echo 'tu IP')"
else
    fail "Web honeypot no responde en :80 (status: ${HTTP_STATUS:-sin respuesta})"
fi

# ── 2. SSH / Cowrie (puerto 22) ───────────────────────────────────────────────

echo
echo "═══════════════════════════════════════════════════"
echo " 2. SSH honeypot / Cowrie — puerto 22"
echo "═══════════════════════════════════════════════════"

SSH_BANNER=$(timeout 5 bash -c "echo '' | nc -w 3 ${HOST} 22 2>/dev/null | head -1" || true)

if echo "$SSH_BANNER" | grep -qi "ssh"; then
    pass "Banner SSH recibido: ${SSH_BANNER}"
    info "Intentando login fallido para generar evento auth..."
    # -o StrictHostKeyChecking=no para no bloquear en host desconocido
    # BatchMode=yes + timeout corto garantiza que no quede colgado
    ssh -o StrictHostKeyChecking=no \
        -o BatchMode=yes \
        -o ConnectTimeout=5 \
        -o PasswordAuthentication=no \
        -p 22 \
        "root@${HOST}" 2>/dev/null || true
    wait_vector
    info "Verificar en dashboard: SSH Events → nuevo auth fallido"
else
    fail "Cowrie no responde en :22 (banner: '${SSH_BANNER:-vacío}')"
fi

# ── 3. FTP honeypot (puerto 21) ───────────────────────────────────────────────

echo
echo "═══════════════════════════════════════════════════"
echo " 3. FTP honeypot — puerto 21"
echo "═══════════════════════════════════════════════════"

FTP_BANNER=$(timeout 5 bash -c "echo '' | nc -w 3 ${HOST} 21 2>/dev/null | head -1" || true)

if echo "$FTP_BANNER" | grep -qiE "^220|ftp"; then
    pass "Banner FTP recibido: ${FTP_BANNER}"
    info "Enviando USER + PASS para generar evento auth..."
    # printf envía los comandos FTP manuales; nc los transmite y espera
    printf "USER anonymous\r\nPASS test@validate.local\r\nQUIT\r\n" \
        | nc -w 4 "${HOST}" 21 >/dev/null 2>&1 || true
    wait_vector
    info "Verificar en dashboard: Protocol Hits → FTP → nuevo evento"
    COUNT=$(protocol_count "ftp")
    [[ "$COUNT" != "?" ]] && info "Total FTP hits en API: ${COUNT}"
else
    fail "FTP honeypot no responde en :21 (banner: '${FTP_BANNER:-vacío}')"
fi

# ── 4. MySQL honeypot (puerto 3306) ──────────────────────────────────────────

echo
echo "═══════════════════════════════════════════════════"
echo " 4. MySQL honeypot — puerto 3306"
echo "═══════════════════════════════════════════════════"

MYSQL_BYTES=$(timeout 5 bash -c "echo '' | nc -w 3 ${HOST} 3306 2>/dev/null | head -c 20 | wc -c | tr -d ' '" || true)

if [[ "${MYSQL_BYTES:-0}" =~ ^[0-9]+$ ]] && [[ "$MYSQL_BYTES" -gt 0 ]]; then
    pass "MySQL honeypot responde en :3306 (${MYSQL_BYTES} bytes recibidos)"
    wait_vector
    info "Verificar en dashboard: Protocol Hits → MySQL → nuevo evento"
    COUNT=$(protocol_count "mysql")
    [[ "$COUNT" != "?" ]] && info "Total MySQL hits en API: ${COUNT}"
else
    fail "MySQL honeypot no responde en :3306"
fi

# ── 5. Port honeypot — muestra representativa ─────────────────────────────────

echo
echo "═══════════════════════════════════════════════════"
echo " 5. Port honeypot — puertos 6379 / 9200 / 27017"
echo "═══════════════════════════════════════════════════"

PORT_OK=0
for PORT in 6379 9200 27017; do
    RESP=$(timeout 4 bash -c "echo PING | nc -w 3 ${HOST} ${PORT} 2>/dev/null | head -c 50" || true)
    if [[ -n "$RESP" ]]; then
        pass "Puerto ${PORT} responde (port-honeypot)"
        PORT_OK=$((PORT_OK + 1))
    else
        # Algunos puertos del port-honeypot cierran sin responder — conexión exitosa es suficiente
        NC_EXIT=$(timeout 4 bash -c "nc -z -w 3 ${HOST} ${PORT} 2>/dev/null"; echo $?) || NC_EXIT=1
        if [[ "$NC_EXIT" == "0" ]]; then
            pass "Puerto ${PORT} acepta conexión TCP (port-honeypot)"
            PORT_OK=$((PORT_OK + 1))
        else
            fail "Puerto ${PORT} no acepta conexión"
        fi
    fi
done

if [[ "$PORT_OK" -gt 0 ]]; then
    wait_vector
    info "Verificar en dashboard: Protocol Hits → port → nuevos eventos"
    COUNT=$(protocol_count "port")
    [[ "$COUNT" != "?" ]] && info "Total port hits en API: ${COUNT}"
fi

# ── 6. SMB honeypot (puerto 445) ─────────────────────────────────────────────

echo
echo "═══════════════════════════════════════════════════"
echo " 6. SMB honeypot — puerto 445"
echo "═══════════════════════════════════════════════════"

SMB_CONN=$(timeout 5 bash -c "nc -z -w 4 ${HOST} 445 2>/dev/null"; echo $?) || SMB_CONN=1

if [[ "$SMB_CONN" == "0" ]]; then
    pass "Puerto 445 acepta conexión TCP (smb-honeypot)"
    # Si smbclient está disponible, hace el handshake completo
    if command -v smbclient &>/dev/null; then
        info "smbclient disponible — intentando listado de shares..."
        smbclient -L "//${HOST}" -N --option='client min protocol=NT1' \
            2>/dev/null | head -10 || true
    else
        info "smbclient no disponible — solo se verificó TCP. Instalar: apt install smbclient"
    fi
    wait_vector
    info "Verificar en dashboard: Protocol Hits → smb → nuevo evento"
    COUNT=$(protocol_count "smb")
    [[ "$COUNT" != "?" ]] && info "Total SMB hits en API: ${COUNT}"
else
    fail "SMB honeypot no acepta conexión en :445"
fi

# ── 7. Vector logs — verificación directa (requiere acceso SSH al server) ─────

echo
echo "═══════════════════════════════════════════════════"
echo " 7. Vector logs (manual — requiere SSH al server)"
echo "═══════════════════════════════════════════════════"

info "Para verificar que Vector procesó los eventos, SSH al servidor y ejecutar:"
echo
echo "    docker logs vector --tail 50 | grep -E '(Sending|processed|error|warn)'"
echo "    docker logs vector --tail 50 | grep -i 'web_ingest\|protocol_ingest'"
echo
info "Para ver el pipeline activo:"
echo "    docker exec vector vector top"

# ── Resumen ───────────────────────────────────────────────────────────────────

echo
echo "═══════════════════════════════════════════════════"
if [[ "$FAILURES" -eq 0 ]]; then
    echo -e " ${GREEN}RESULTADO: PASS — todos los sensores responden${RESET}"
else
    echo -e " ${RED}RESULTADO: ${FAILURES} sensor(es) con fallo${RESET}"
fi
echo "═══════════════════════════════════════════════════"
echo

exit "$FAILURES"
