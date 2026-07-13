/** Returns whether an address belongs to a private or local-only network. */
export function isInternalIp(value: string | null | undefined): boolean {
  if (!value) return false

  const ip = value.trim().toLowerCase()
  if (!ip) return false

  const mappedIpv4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mappedIpv4) return isInternalIpv4(mappedIpv4[1])
  if (ip.includes(':')) return isInternalIpv6(ip)
  return isInternalIpv4(ip)
}

function isInternalIpv4(ip: string): boolean {
  const octets = ip.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false
  }

  const [first, second] = octets
  return first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second >= 64 && second <= 127)
}

function isInternalIpv6(ip: string): boolean {
  return ip === '::1'
    || ip.startsWith('fc')
    || ip.startsWith('fd')
    || /^fe[89ab][0-9a-f]:/.test(ip)
}
