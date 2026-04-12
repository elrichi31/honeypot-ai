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
    default:
      return base;
  }
}
