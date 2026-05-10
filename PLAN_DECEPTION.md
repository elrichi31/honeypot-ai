Tengo todo el contexto que necesito. La base es mejor de lo esperado — cowrie ya tiene /etc/hosts con IPs internas (10.0.1.10, 10.0.1.11, 10.0.1.20) que podemos hacer reales con Docker. El plan:

Plan completo — Deception Network
Arquitectura objetivo

Internet
   ↓
[cowrie SSH :22]  ← attacker enters here
   ↓  (cowrie está en deception_net 10.0.1.0/24)
   ↓  attacker ve /etc/hosts y ve la "red interna"
   ↓
┌─────────────────────────────────────────┐
│         deception_net 10.0.1.0/24       │
│                                         │
│  cowrie        10.0.1.100               │
│  fake-db       10.0.1.10  ← MySQL+SSH   │
│  fake-replica  10.0.1.11  ← MySQL       │
│  fake-cache    10.0.1.20  ← Redis+HTTP  │
│  fake-intranet 10.0.1.5   ← HTTP+SSH   │
│  fake-dc       10.0.1.2   ← SMB+HTTP   │
└─────────────────────────────────────────┘
   ↓  (todos los eventos)
[ingest-api] → [dashboard]
El truco clave: las IPs en /etc/hosts de cowrie ya son 10.0.1.x. Si conectamos cowrie a una red Docker con subnet 10.0.1.0/24 y asignamos esas IPs a los containers OpenCanary, cuando el atacante haga ssh 10.0.1.10 realmente llega al container.

Track A — Enriquecer Cowrie (archivos, sin nuevos servicios)
Archivo	Cambio
honeyfs/etc/hosts	Agregar fake-dc (10.0.1.2), fake-intranet (10.0.1.5), fake-fileserver (10.0.1.15)
honeyfs/home/ubuntu/.aws/credentials	Honey token AWS falso
honeyfs/home/ubuntu/.ssh/id_rsa	Clave SSH falsa que "da acceso" a otros nodos
honeyfs/etc/app/config.php	Creds de DB apuntando a db-primary.internal
honeyfs/home/ubuntu/.bash_history	Comandos referenciando IPs internas
txtcmds/sbin/ifconfig	Mostrar eth0 con IP 10.0.1.100
txtcmds/bin/arp	Mostrar vecinos de la red interna
txtcmds/bin/netstat	Mostrar conexiones establecidas a hosts internos
Track B — Nodos OpenCanary (nuevos containers)
Cada nodo es un container OpenCanary con IP fija en deception_net. OpenCanary simula los servicios, registra cada interacción, y un shipper los envía al ingest-api.

Container	IP	Servicios que simula
fake-dc	10.0.1.2	HTTP (portal AD), SMB, SSH
fake-intranet	10.0.1.5	HTTP (intranet web), SSH
fake-db	10.0.1.10	MySQL, SSH
fake-db-replica	10.0.1.11	MySQL
fake-cache	10.0.1.20	HTTP (Redis API falsa), SSH
Un solo opencanary-shipper lee los JSON logs de todos los nodos y los envía al ingest-api (mismo patrón que dionaea-shipper).

Track C — Dashboard: eventos internos vs externos
Los eventos de OpenCanary necesitan un campo extra para distinguirlos de los externos. Los marcaremos con "layer": "internal" en el sensor registration. El dashboard puede filtrarlos con un toggle "External / Internal / All".

Orden de implementación sugerido

Semana 1 (paralelo):
  A1-A5: Enriquecer honeyfs y txtcmds de cowrie
  B1:    Red Docker deception_net + IPs fijas en compose

Semana 2:
  B2-B3: Containers OpenCanary + configs por nodo
  B4:    opencanary-shipper

Semana 3:
  C:     Campo "layer" en ingest-api + toggle en dashboard
¿Arrancamos implementando? Lo haríamos en este orden:

Ahora: Track A completo (solo archivos de cowrie, zero riesgo, merge rápido)
Luego: Track B (compose + OpenCanary)
Luego: Track C (dashboard)
¿Te parece o ajustamos algo del plan?