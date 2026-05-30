import net from 'net'

export function tcpProbe(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!host) return resolve(false)

    const sock = new net.Socket()
    let settled = false

    const finish = (up: boolean) => {
      if (!settled) {
        settled = true
        sock.destroy()
        resolve(up)
      }
    }

    sock.setTimeout(timeoutMs)
    sock.connect(port, host, () => finish(true))
    sock.on('error', () => finish(false))
    sock.on('timeout', () => finish(false))
  })
}

export function normalizeIp(raw: string): string {
  return raw.replace(/^::ffff:/, '')
}

export function normalizeSlug(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function clientNameFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
