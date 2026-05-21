export type AttackType = 'scanner' | 'path_probe' | 'injection' | 'brute_force'

export type DetectionResult = {
  type: AttackType
  details: Record<string, string>
}

const SCANNER_UA_FRAGMENTS = [
  'nuclei', 'sqlmap', 'nikto', 'masscan', 'zgrab', 'gobuster', 'dirbuster',
  'dirb/', 'wfuzz', 'hydra', 'metasploit', 'burp', 'nessus', 'openvas',
  'zap/', 'acunetix', 'netsparker', 'skipfish', 'arachni', 'w3af',
  'nmap', 'shodan', 'censys', 'python-requests/2', 'go-http-client/1',
]

const SENSITIVE_PATH_PREFIXES = [
  '/.env', '/.git', '/wp-admin', '/wp-login', '/wp-content', '/phpmyadmin',
  '/phpinfo', '/.htaccess', '/actuator', '/.aws', '/.ssh', '/backup',
  '/etc/', '/proc/', '/console', '/manager/', '/admin/', '/config/',
  '/server-status', '/jmx-console', '/.DS_Store', '/crossdomain.xml',
]

const SQL_RE       = /(\bunion\b.{0,30}\bselect\b|\bselect\b.{0,30}\bfrom\b|\bdrop\b.{0,30}\btable\b|\bexec\b\s*\()/i
const TRAVERSAL_RE = /\.\.[/\\]/
const XSS_RE       = /<script[\s>]|javascript:|on\w+\s*=/i
const TEMPLATE_RE  = /\{\{|\$\{|<%/

function safeDecode(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}

export function detectScanner(ua: string): DetectionResult | null {
  const lower = ua.toLowerCase()
  const match = SCANNER_UA_FRAGMENTS.find(f => lower.includes(f))
  return match ? { type: 'scanner', details: { ua, matched: match } } : null
}

export function detectSensitivePath(path: string): DetectionResult | null {
  const lower = path.toLowerCase()
  const match = SENSITIVE_PATH_PREFIXES.find(p => lower.startsWith(p))
  return match ? { type: 'path_probe', details: { path, matched: match } } : null
}

export function detectInjection(rawUrl: string): DetectionResult | null {
  const decoded = safeDecode(rawUrl)
  if (SQL_RE.test(decoded))       return { type: 'injection', details: { pattern: 'sql',       url: rawUrl } }
  if (TRAVERSAL_RE.test(decoded)) return { type: 'injection', details: { pattern: 'traversal', url: rawUrl } }
  if (XSS_RE.test(decoded))       return { type: 'injection', details: { pattern: 'xss',       url: rawUrl } }
  if (TEMPLATE_RE.test(decoded))  return { type: 'injection', details: { pattern: 'template',  url: rawUrl } }
  return null
}

export function classifyRequest(path: string, ua: string, rawUrl: string): DetectionResult | null {
  return detectScanner(ua) ?? detectSensitivePath(path) ?? detectInjection(rawUrl)
}
