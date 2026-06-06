export type ServiceKey = "ssh" | "http" | "ftp" | "mysql" | "port"

export const ALL_SERVICES: ServiceKey[] = ["ssh", "http", "ftp", "mysql", "port"]

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
    volumes:
      - ./heartbeat.py:/heartbeat.py:ro
    command: ["python3", "/heartbeat.py"]
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
    ports:
      - "80:8080"
      - "8443:8080"
    read_only: true
    networks:
      - edge
    tmpfs:
      - /tmp
    pids_limit: 128`

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
