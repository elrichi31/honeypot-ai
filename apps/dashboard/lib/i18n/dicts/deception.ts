// Deception — i18n strings (en + es).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  // ── Index (/deception): one card per client deception network ──────────────
  "deception.title": "Deception Networks",
  "deception.subtitle": "One internal trap network per client. Any interaction with a node confirms the attacker got past the SSH honeypot.",
  "deception.networks.empty.title": "No deception network deployed",
  "deception.networks.empty.desc": "No client has OpenCanary trap nodes assigned yet. Assign a deception network from a client's sensor catalog to start detecting lateral movement.",
  "deception.networks.nodes": "Nodes online",
  "deception.networks.hits24h": "Hits 24h",
  "deception.networks.authAttempts": "Auth attempts",
  "deception.networks.sourceIps": "Source IPs",
  "deception.networks.lateral": "Lateral chains",
  "deception.networks.lastEvent": "Last event",
  "deception.status.breached": "Breached",
  "deception.status.active": "Active",
  "deception.status.quiet": "Quiet",

  // ── Detail (/clients/[slug]/deception) ────────────────────────────────────
  "deception.detail.title": "Deception · {client}",
  "deception.detail.subtitle": "Attacker lateral movement inside this client's internal trap network (OpenCanary). Each interaction with a node confirms they got past the SSH honeypot.",
  "deception.detail.killchain": "Kill-chain · lateral movement",
  "deception.detail.nodes": "Trap nodes",
  "deception.detail.filter": "Trap node:",
  "deception.detail.filter.all": "All nodes",
  "deception.detail.breach.title": "Lateral movement detected",
  "deception.detail.breach.desc": "{n} attack chain(s) touched two or more trap nodes in the last 24h. The attacker is moving inside the network, not just knocking on one door.",
  "deception.error.title": "Could not load the deception network",
  "deception.error.desc": "The server took too long or did not respond. Try again in a few seconds.",
} as const

export const es: Record<keyof typeof en, string> = {
  "deception.title": "Redes de engaño",
  "deception.subtitle": "Una red trampa interna por cliente. Cualquier interacción con un nodo confirma que el atacante pasó del honeypot SSH.",
  "deception.networks.empty.title": "Sin red de engaño desplegada",
  "deception.networks.empty.desc": "Ningún cliente tiene nodos trampa de OpenCanary asignados todavía. Asigna una red de engaño desde el catálogo de sensores de un cliente para empezar a detectar movimiento lateral.",
  "deception.networks.nodes": "Nodos en línea",
  "deception.networks.hits24h": "Impactos 24h",
  "deception.networks.authAttempts": "Intentos de auth",
  "deception.networks.sourceIps": "IPs de origen",
  "deception.networks.lateral": "Cadenas laterales",
  "deception.networks.lastEvent": "Último evento",
  "deception.status.breached": "Comprometida",
  "deception.status.active": "Activa",
  "deception.status.quiet": "Tranquila",

  "deception.detail.title": "Engaño · {client}",
  "deception.detail.subtitle": "Movimiento lateral del atacante dentro de la red trampa interna de este cliente (OpenCanary). Cada interacción con un nodo confirma que pasó del honeypot SSH.",
  "deception.detail.killchain": "Kill-chain · movimiento lateral",
  "deception.detail.nodes": "Nodos trampa",
  "deception.detail.filter": "Nodo trampa:",
  "deception.detail.filter.all": "Todos los nodos",
  "deception.detail.breach.title": "Movimiento lateral detectado",
  "deception.detail.breach.desc": "{n} cadena(s) de ataque tocaron dos o más nodos trampa en las últimas 24h. El atacante se está moviendo dentro de la red, no solo llamando a una puerta.",
  "deception.error.title": "No se pudo cargar la red de engaño",
  "deception.error.desc": "El servidor tardó demasiado o no respondió. Vuelve a intentarlo en unos segundos.",
}
