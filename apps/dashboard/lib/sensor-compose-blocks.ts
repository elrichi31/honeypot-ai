export type ServiceKey =
  | "ssh" | "http" | "ftp" | "mysql" | "port" | "deception" | "internal-canary" | "smb"
  | "int-smb" | "int-mysql" | "int-ssh" | "int-http"

export const ALL_SERVICES: ServiceKey[] = ["ssh", "http", "ftp", "mysql", "port", "deception"]

type Vars = Record<string, string>

function fill(template: string, vars: Vars) {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    template,
  )
}

export function headerBlock(ingestUrl: string, secret: string, clientSlug = "", clientName = "") {
  const clientLines = clientSlug
    ? `  CLIENT_SLUG: "${clientSlug}"\n  CLIENT_NAME: "${clientName || clientSlug}"`
    : ""
  return fill(HEADER_TEMPLATE, { ingestUrl, secret, clientLines })
}

export function sshBlock(deployId: string, registry: string) {
  return fill(SSH_TEMPLATE, { deployId, registry })
}

export function httpBlock(deployId: string, registry: string) {
  return fill(HTTP_TEMPLATE, { deployId, registry })
}

export function ftpBlock(deployId: string, registry: string) {
  return fill(FTP_TEMPLATE, { deployId, registry })
}

export function mysqlBlock(deployId: string, registry: string) {
  return fill(MYSQL_TEMPLATE, { deployId, registry })
}

export function portBlock(deployId: string, registry: string) {
  return fill(PORT_TEMPLATE, { deployId, registry })
}

export function vectorOnlyBlock(deployId: string) {
  return fill(VECTOR_ONLY_TEMPLATE, { deployId })
}

export function suricataBlock(registry: string) {
  return fill(SURICATA_TEMPLATE, { registry })
}

export function deceptionBlock(deployId: string, registry: string) {
  return fill(DECEPTION_TEMPLATE, { deployId, registry })
}

export function internalCanaryBlock(deployId: string, registry: string) {
  return fill(INTERNAL_CANARY_TEMPLATE, { deployId, registry })
}

export function smbBlock(deployId: string, rawBase: string) {
  return fill(SMB_TEMPLATE, { deployId, rawBase })
}

const HEADER_TEMPLATE = `x-service-defaults: &service-defaults
  restart: unless-stopped
  init: true
  security_opt:
    - no-new-privileges:true
  cap_drop:
    - ALL

x-json-logging: &json-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "5"

x-ingest: &ingest
  INGEST_API_URL: "{{ingestUrl}}"
  INGEST_SHARED_SECRET: "{{secret}}"
{{clientLines}}

services:`

const SSH_TEMPLATE = `  cowrie:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/cowrie:latest
    container_name: cowrie
    # cowrie starts as root to apply config, then drops to the cowrie user
    # (it refuses to run as root). cap_drop:ALL from the defaults removes
    # CAP_SETUID/SETGID, so re-add them or the privilege drop fails and the
    # container crash-loops.
    cap_add:
      - SETUID
      - SETGID
    ports:
      - "22:2222"
      - "2222:2222"
    volumes:
      - cowrie_var:/cowrie/cowrie-git/var
      - ./cowrie.cfg:/cowrie/cowrie-git/etc/cowrie.cfg:ro
      - ./userdb.txt:/cowrie/cowrie-git/etc/userdb.txt:ro
    networks:
      - edge
    pids_limit: 256

  cowrie-beacon:
    <<: *service-defaults
    logging: *json-logging
    image: python:3.12-alpine
    container_name: cowrie-beacon
    environment:
      <<: *ingest
      SENSOR_ID: cowrie-ssh-{{deployId}}
      SENSOR_NAME: "SSH Honeypot (Cowrie)"
      SENSOR_IP: ""
      SENSOR_PROTOCOL: ssh
      SENSOR_VERSION: cowrie
      SENSOR_PORTS: "22 2222"
      SENSOR_PROBE_PORTS: "2222 2222"
      SENSOR_HOST: cowrie
      SENSOR_CONTROL_SECRET: ""
    volumes:
      - ./heartbeat.py:/heartbeat.py:ro
      - ./control_agent.py:/control_agent.py:ro
    command: ["sh", "-c", "pip install --quiet --no-cache-dir websockets==13.1 && python3 /heartbeat.py"]
    networks:
      - edge
    pids_limit: 16

  vector:
    <<: *service-defaults
    logging: *json-logging
    image: timberio/vector:0.40.0-alpine
    container_name: vector
    depends_on:
      - cowrie
    volumes:
      - cowrie_var:/cowrie/cowrie-git/var:ro
      - suricata_logs:/tmp/suricata-logs:ro
      - ./cowrie.toml:/etc/vector/cowrie.toml:ro
      - ./suricata.toml:/etc/vector/suricata.toml:ro
      - vector_data:/var/lib/vector
    command: ["--config", "/etc/vector/cowrie.toml", "--config", "/etc/vector/suricata.toml"]
    environment:
      <<: *ingest
      COWRIE_LOG_PATH: /cowrie/cowrie-git/var/log/cowrie/cowrie.json
      SENSOR_ID: cowrie-ssh-{{deployId}}
      SURICATA_SENSOR_ID: suricata-{{deployId}}
    networks:
      - edge
    pids_limit: 128`

const HTTP_TEMPLATE = `  web-honeypot:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/web-honeypot:latest
    container_name: web-honeypot
    environment:
      <<: *ingest
      PORT: "8080"
      SENSOR_ID: web-{{deployId}}
      SENSOR_NAME: "Web Honeypot"
      SENSOR_IP: ""
      SENSOR_HOST: web-honeypot
      SENSOR_PORTS: "80 8443"
      SENSOR_PROBE_PORTS: "8080 8080"
      SIGNAL_DIR: /signal
    ports:
      - "80:8080"
      - "8443:8080"
    read_only: true
    networks:
      - edge
    tmpfs:
      - /tmp
    volumes:
      - web_signal:/signal:ro
    pids_limit: 128

  web-honeypot-beacon:
    <<: *service-defaults
    logging: *json-logging
    image: python:3.12-alpine
    container_name: web-honeypot-beacon
    environment:
      <<: *ingest
      SENSOR_ID: web-{{deployId}}
      SENSOR_PORTS: "80 8443"
      SENSOR_CONTROL_SECRET: ""
      SIGNAL_DIR: /signal
    volumes:
      - ./web-heartbeat.py:/heartbeat.py:ro
      - ./control_agent.py:/control_agent.py:ro
      - web_signal:/signal
    command: ["sh", "-c", "pip install --quiet --no-cache-dir websockets==13.1 && python3 /heartbeat.py"]
    networks:
      - edge
    pids_limit: 16`

const FTP_TEMPLATE = `  ftp-honeypot:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/ftp-honeypot:latest
    container_name: ftp-honeypot
    environment:
      <<: *ingest
      PORT: "21"
      DST_PORT: "21"
      SENSOR_ID: ftp-{{deployId}}
      SENSOR_NAME: "FTP Honeypot"
      SENSOR_IP: ""
    ports:
      - "21:21"
    networks:
      - edge
    pids_limit: 128`

const MYSQL_TEMPLATE = `  mysql-honeypot:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/mysql-honeypot:latest
    container_name: mysql-honeypot
    environment:
      <<: *ingest
      PORT: "3306"
      DST_PORT: "3306"
      SENSOR_ID: mysql-{{deployId}}
      SENSOR_NAME: "MySQL Honeypot"
      SENSOR_IP: ""
    ports:
      - "3306:3306"
    networks:
      - edge
    pids_limit: 128`

const PORT_TEMPLATE = `  port-honeypot:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/port-honeypot:latest
    container_name: port-honeypot
    environment:
      <<: *ingest
      PORTS: "1433 2375 3389 4444 5900 6379 8888 9090 9200 27017"
      SENSOR_ID: port-{{deployId}}
      SENSOR_NAME: "Port Honeypot"
      SENSOR_IP: ""
    ports:
      - "1433:1433"
      - "2375:2375"
      - "3389:3389"
      - "4444:4444"
      - "5900:5900"
      - "6379:6379"
      - "8888:8888"
      - "9090:9090"
      - "9200:9200"
      - "27017:27017"
    networks:
      - edge
    pids_limit: 256`

const SURICATA_TEMPLATE = `  suricata:
    logging: *json-logging
    # Custom image: its entrypoint reads SURICATA_INTERFACE and ships ET Open
    # rules pre-fetched. The stock jasonish/suricata image ignores the env var
    # and needs -i <iface> as an arg, so it crash-loops here without it.
    image: {{registry}}/suricata:latest
    container_name: suricata
    restart: unless-stopped
    init: true
    network_mode: host
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_NICE
      - SETPCAP
      - SETUID
      - SETGID
    environment:
      SURICATA_INTERFACE: "\${SURICATA_INTERFACE:-eth0}"
    volumes:
      - suricata_logs:/tmp/suricata-logs
    pids_limit: 256`

// Deception network: 5 OpenCanary trap nodes on the internal deception_net
// (10.0.1.0/24) plus a single shipper that tails all their logs and forwards
// them to ingest as protocol_hits (data.source='opencanary'). The fixed IPs match
// cowrie's /etc/hosts so that an attacker who runs `ssh 10.0.1.10` from inside
// cowrie actually reaches the fake-db node. Requires the ssh (cowrie) service —
// cowrie is the entry point and is attached to deception_net at 10.0.1.100.
const DECEPTION_TEMPLATE = `  fake-dc:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/opencanary:latest
    container_name: fake-dc
    volumes:
      - ./opencanary/fake-dc.json:/etc/opencanary/opencanary.conf:ro
      - opencanary_logs:/var/log/opencanary
    networks:
      deception_net:
        ipv4_address: 10.0.1.2
    mem_limit: 128m
    pids_limit: 64

  fake-intranet:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/opencanary:latest
    container_name: fake-intranet
    volumes:
      - ./opencanary/fake-intranet.json:/etc/opencanary/opencanary.conf:ro
      - opencanary_logs:/var/log/opencanary
    networks:
      deception_net:
        ipv4_address: 10.0.1.5
    mem_limit: 128m
    pids_limit: 64

  fake-db:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/opencanary:latest
    container_name: fake-db
    volumes:
      - ./opencanary/fake-db.json:/etc/opencanary/opencanary.conf:ro
      - opencanary_logs:/var/log/opencanary
    networks:
      deception_net:
        ipv4_address: 10.0.1.10
    mem_limit: 128m
    pids_limit: 64

  fake-db-replica:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/opencanary:latest
    container_name: fake-db-replica
    volumes:
      - ./opencanary/fake-db-replica.json:/etc/opencanary/opencanary.conf:ro
      - opencanary_logs:/var/log/opencanary
    networks:
      deception_net:
        ipv4_address: 10.0.1.11
    mem_limit: 128m
    pids_limit: 64

  fake-cache:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/opencanary:latest
    container_name: fake-cache
    volumes:
      - ./opencanary/fake-cache.json:/etc/opencanary/opencanary.conf:ro
      - opencanary_logs:/var/log/opencanary
    networks:
      deception_net:
        ipv4_address: 10.0.1.20
    mem_limit: 128m
    pids_limit: 64

  opencanary-shipper:
    <<: *service-defaults
    logging: *json-logging
    image: python:3.12-alpine
    container_name: opencanary-shipper
    depends_on:
      - fake-db
      - fake-dc
      - fake-intranet
      - fake-cache
      - fake-db-replica
    environment:
      <<: *ingest
      OPENCANARY_LOG_DIR: /var/log/opencanary
      STATE_DIR: /state
      READ_FROM_END: "1"
    volumes:
      - opencanary_logs:/var/log/opencanary:ro
      - opencanary_shipper_state:/state
      - ./opencanary/shipper.py:/shipper.py:ro
    command: ["python3", "/shipper.py"]
    networks:
      - edge
      - deception_net
    pids_limit: 32`

// Internal Canary: a honeypot that lives inside the corporate LAN.
// Any interaction is a high-severity signal (insider threat / lateral movement).
// Services: Cowrie SSH + OpenCanary (SMB, MySQL, HTTP/intranet, RDP) + shipper.
// No internet-facing ports — the VM gets an internal corporate IP and all traffic
// stays inside the LAN. Reports to ingest-api over HTTPS via HTTPS_PROXY if set.
const INTERNAL_CANARY_TEMPLATE = `  ic-cowrie:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/cowrie:latest
    container_name: ic-cowrie
    cap_add:
      - SETUID
      - SETGID
    ports:
      - "22:2222"
    volumes:
      - ic_cowrie_var:/cowrie/cowrie-git/var
      - ./internal-canary/cowrie.cfg:/cowrie/cowrie-git/etc/cowrie.cfg:ro
      - ./internal-canary/userdb.txt:/cowrie/cowrie-git/etc/userdb.txt:ro
    networks:
      - ic_net
    pids_limit: 256

  ic-cowrie-beacon:
    <<: *service-defaults
    logging: *json-logging
    image: python:3.12-alpine
    container_name: ic-cowrie-beacon
    environment:
      <<: *ingest
      SENSOR_ID: ic-ssh-{{deployId}}
      SENSOR_NAME: "Internal Canary · SSH"
      SENSOR_IP: ""
      SENSOR_PROTOCOL: ssh
      SENSOR_VERSION: cowrie
      SENSOR_PORTS: "22"
      SENSOR_PROBE_PORTS: "2222"
      SENSOR_HOST: ic-cowrie
      HTTPS_PROXY: "\${HTTPS_PROXY:-}"
      HTTP_PROXY: "\${HTTP_PROXY:-}"
    volumes:
      - ./internal-canary/heartbeat.py:/heartbeat.py:ro
    command: ["python3", "/heartbeat.py"]
    networks:
      - ic_net
    pids_limit: 16

  ic-vector:
    <<: *service-defaults
    logging: *json-logging
    image: timberio/vector:0.40.0-alpine
    container_name: ic-vector
    depends_on:
      - ic-cowrie
    volumes:
      - ic_cowrie_var:/cowrie/cowrie-git/var:ro
      - ./internal-canary/cowrie.toml:/etc/vector/cowrie.toml:ro
      - ic_vector_data:/var/lib/vector
    command: ["--config", "/etc/vector/cowrie.toml"]
    environment:
      <<: *ingest
      COWRIE_LOG_PATH: /cowrie/cowrie-git/var/log/cowrie/cowrie.json
      SENSOR_ID: ic-ssh-{{deployId}}
      HTTPS_PROXY: "\${HTTPS_PROXY:-}"
      HTTP_PROXY: "\${HTTP_PROXY:-}"
    networks:
      - ic_net
    pids_limit: 128

  ic-opencanary-smb:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/opencanary:latest
    container_name: ic-opencanary-smb
    volumes:
      - ./internal-canary/opencanary-smb.json:/etc/opencanary/opencanary.conf:ro
      - ic_opencanary_logs:/var/log/opencanary
    networks:
      - ic_net
    mem_limit: 128m
    pids_limit: 64

  ic-opencanary-db:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/opencanary:latest
    container_name: ic-opencanary-db
    volumes:
      - ./internal-canary/opencanary-db.json:/etc/opencanary/opencanary.conf:ro
      - ic_opencanary_logs:/var/log/opencanary
    networks:
      - ic_net
    mem_limit: 128m
    pids_limit: 64

  ic-opencanary-web:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/opencanary:latest
    container_name: ic-opencanary-web
    volumes:
      - ./internal-canary/opencanary-web.json:/etc/opencanary/opencanary.conf:ro
      - ic_opencanary_logs:/var/log/opencanary
    networks:
      - ic_net
    mem_limit: 128m
    pids_limit: 64

  ic-opencanary-shipper:
    <<: *service-defaults
    logging: *json-logging
    image: python:3.12-slim
    container_name: ic-opencanary-shipper
    depends_on:
      - ic-opencanary-smb
      - ic-opencanary-db
      - ic-opencanary-web
    environment:
      <<: *ingest
      OPENCANARY_LOG_DIR: /var/log/opencanary
      STATE_DIR: /state
      READ_FROM_END: "1"
      HTTPS_PROXY: "\${HTTPS_PROXY:-}"
      HTTP_PROXY: "\${HTTP_PROXY:-}"
    volumes:
      - ic_opencanary_logs:/var/log/opencanary:ro
      - ic_opencanary_shipper_state:/state
      - ./internal-canary/shipper.py:/shipper.py:ro
    command: ["python3", "/shipper.py"]
    networks:
      - ic_net
    pids_limit: 32`

const SMB_TEMPLATE = `  smb-honeypot:
    <<: *service-defaults
    logging: *json-logging
    # SMB Honeypot uses Impacket — built from source, not a registry image.
    # Pull the latest app.py from the repo and build locally.
    build:
      context: .
      dockerfile_inline: |
        FROM python:3.12-alpine
        RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev && \\
            pip install --no-cache-dir impacket==0.12.0 && \\
            apk del gcc musl-dev libffi-dev
        WORKDIR /app
        ADD {{rawBase}}/sensors/smb-honeypot/app.py /app/app.py
        CMD ["python", "-u", "app.py"]
    container_name: smb-honeypot
    cap_add:
      - NET_BIND_SERVICE
    environment:
      <<: *ingest
      PORT: "445"
      DST_PORT: "445"
      SENSOR_ID: smb-{{deployId}}
      SENSOR_NAME: "SMB Honeypot"
      SENSOR_IP: ""
      SENSOR_HOST: smb-honeypot
      SMB_SHARE_NAME: "\${SMB_SHARE_NAME:-ADMIN$}"
      SMB_SERVER_NAME: "\${SMB_SERVER_NAME:-FILESERVER01}"
      SMB_SERVER_DOMAIN: "\${SMB_SERVER_DOMAIN:-CORP}"
      SMB_SHARE_PATH: /share
      SMB_CAPTURE_DIR: /captures
    ports:
      - "445:445"
    volumes:
      - smb_share:/share
      - smb_captures:/captures
    networks:
      - edge
    pids_limit: 128`

const VECTOR_ONLY_TEMPLATE = `  vector:
    image: timberio/vector:0.40.0-alpine
    container_name: vector
    restart: unless-stopped
    init: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    logging: *json-logging
    volumes:
      - suricata_logs:/tmp/suricata-logs:ro
      - ./suricata.toml:/etc/vector/suricata.toml:ro
      - vector_data:/var/lib/vector
    command: ["--config", "/etc/vector/suricata.toml"]
    environment:
      <<: *ingest
      SURICATA_SENSOR_ID: suricata-{{deployId}}
    networks:
      - edge
    pids_limit: 128`

// ---------------------------------------------------------------------------
// Internal deception nodes — full-interaction honeypots deployed inside the
// corporate LAN. SENSOR_LAYER=internal makes each beacon register as
// protocol='deception' so the DeceptionNetworkCard picks them up, while
// the actual protocol is preserved in real_protocol for display.
// ---------------------------------------------------------------------------

const INT_SMB_TEMPLATE = `  smb-honeypot:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/smb-honeypot:latest
    container_name: smb-honeypot
    cap_add:
      - NET_BIND_SERVICE
    environment:
      <<: *ingest
      PORT: "445"
      DST_PORT: "445"
      SENSOR_ID: int-smb-{{deployId}}
      SENSOR_NAME: "SMB Honeypot (Internal)"
      SENSOR_LAYER: "internal"
      SMB_SHARE_NAME: "\${SMB_SHARE_NAME:-ADMIN$$}"
      SMB_SERVER_NAME: "\${SMB_SERVER_NAME:-FILESERVER01}"
      SMB_SERVER_DOMAIN: "\${SMB_SERVER_DOMAIN:-CORP}"
      SMB_SHARE_PATH: /share
      SMB_CAPTURE_DIR: /captures
    volumes:
      - smb_share:/share
      - smb_captures:/captures
    networks:
      - deception_net`

const INT_MYSQL_TEMPLATE = `  mysql-honeypot:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/mysql-honeypot:latest
    container_name: mysql-honeypot
    environment:
      <<: *ingest
      PORT: "3306"
      DST_PORT: "3306"
      SENSOR_ID: int-mysql-{{deployId}}
      SENSOR_NAME: "MySQL Honeypot (Internal)"
      SENSOR_LAYER: "internal"
    networks:
      - deception_net`

const INT_SSH_TEMPLATE = `  cowrie:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/cowrie:latest
    container_name: cowrie
    cap_add:
      - SETUID
      - SETGID
    volumes:
      - cowrie_var:/cowrie/cowrie-git/var
    networks:
      - deception_net

  cowrie-beacon:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/cowrie-beacon:latest
    container_name: cowrie-beacon
    environment:
      <<: *ingest
      SENSOR_ID: int-ssh-{{deployId}}
      SENSOR_NAME: "SSH Honeypot (Internal)"
      SENSOR_LAYER: "internal"
    networks:
      - deception_net

  vector:
    <<: *service-defaults
    logging: *json-logging
    image: timberio/vector:0.40.0-alpine
    container_name: vector
    depends_on:
      - cowrie
    volumes:
      - cowrie_var:/cowrie/cowrie-git/var:ro
      - vector_data:/var/lib/vector
    environment:
      <<: *ingest
      SENSOR_ID: int-ssh-{{deployId}}
    networks:
      - deception_net`

const INT_HTTP_TEMPLATE = `  web-honeypot:
    <<: *service-defaults
    logging: *json-logging
    image: {{registry}}/web-honeypot:latest
    container_name: web-honeypot
    environment:
      <<: *ingest
      PORT: "8080"
      SENSOR_ID: int-http-{{deployId}}
      SENSOR_NAME: "Web Honeypot (Internal)"
      SENSOR_LAYER: "internal"
    networks:
      - deception_net`

export function intSmbBlock(deployId: string, registry: string) {
  return fill(INT_SMB_TEMPLATE, { deployId, registry })
}
export function intMysqlBlock(deployId: string, registry: string) {
  return fill(INT_MYSQL_TEMPLATE, { deployId, registry })
}
export function intSshBlock(deployId: string, registry: string) {
  return fill(INT_SSH_TEMPLATE, { deployId, registry })
}
export function intHttpBlock(deployId: string, registry: string) {
  return fill(INT_HTTP_TEMPLATE, { deployId, registry })
}
