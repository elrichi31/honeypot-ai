import type { InternalEventType, CowrieRawEvent } from '../types/index.js';

const EVENT_MAP: Record<string, InternalEventType> = {
  'cowrie.session.connect': 'session.connect',
  'cowrie.session.closed': 'session.closed',
  'cowrie.login.success': 'auth.success',
  'cowrie.login.failed': 'auth.failed',
  'cowrie.client.version': 'client.version',
  'cowrie.client.kex': 'client.kex',
  'cowrie.client.size': 'client.size',
  'cowrie.command.input': 'command.input',
  'cowrie.command.failed': 'command.failed',
  // High-interaction payload events — previously dropped to 'unknown'. These are
  // the most valuable Cowrie captures: malware the attacker pulled in (wget/curl),
  // files they uploaded (scp/sftp), and tunnel/proxy attempts.
  'cowrie.session.file_download': 'file.download',
  'cowrie.session.file_upload': 'file.upload',
  'cowrie.direct-tcpip.request': 'direct.tcpip',
  'cowrie.direct-tcpip.data': 'direct.tcpip',
};

export function normalizeEventType(rawEventId: string): InternalEventType {
  return EVENT_MAP[rawEventId] ?? 'unknown';
}

export function buildNormalizedJson(raw: CowrieRawEvent): Record<string, unknown> {
  const eventType = normalizeEventType(raw.eventid);
  const base = {
    eventType,
    sessionId: raw.session,
    srcIp: raw.src_ip,
    timestamp: raw.timestamp,
  };

  switch (eventType) {
    case 'session.connect':
      return { ...base, protocol: raw.protocol, srcPort: raw.src_port, dstIp: raw.dst_ip, dstPort: raw.dst_port };
    case 'auth.success':
    case 'auth.failed':
      return { ...base, username: raw.username, password: raw.password };
    case 'client.version':
      return { ...base, version: raw.version };
    case 'client.kex':
      return { ...base, hassh: raw.hassh };
    case 'command.input':
    case 'command.failed':
      return { ...base, command: raw.input };
    case 'session.closed':
      return { ...base, duration: raw.duration };
    case 'client.size':
      return { ...base, width: (raw as any).width, height: (raw as any).height };
    case 'file.download':
      // Cowrie file_download: url = where the attacker fetched it from,
      // shasum = SHA256 of the captured binary (also its filename in downloads/),
      // outfile = path on disk, destfile = path the attacker wrote it to.
      return {
        ...base,
        url: (raw as any).url,
        shasum: (raw as any).shasum,
        outfile: (raw as any).outfile,
        destfile: (raw as any).destfile,
        size: (raw as any).size,
      };
    case 'file.upload':
      return {
        ...base,
        filename: (raw as any).filename,
        shasum: (raw as any).shasum,
        outfile: (raw as any).outfile,
        size: (raw as any).size,
      };
    case 'direct.tcpip':
      // Attacker using the honeypot as a proxy/tunnel toward another host.
      return { ...base, dstIp: (raw as any).dst_ip, dstPort: (raw as any).dst_port };
    default:
      return base;
  }
}
