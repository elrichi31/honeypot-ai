import { cowrieRawEventSchema } from '../schemas/index.js';
import { normalizeEventType, buildNormalizedJson } from './normalizer.js';
import type { CowrieRawEvent, NormalizedEvent, SessionUpsertData } from '../types/index.js';

// Postgres TEXT columns reject null bytes (U+0000). Attackers can send them in
// passwords/commands; strip them so we don't stall the Kafka consumer.
function stripNulls(s: string | null | undefined): string | null | undefined {
  if (typeof s !== 'string') return s
  return s.replace(/\x00/g, '')
}

export function parseLine(line: string): CowrieRawEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const result = cowrieRawEventSchema.safeParse(json);
  if (!result.success) return null;

  return result.data as CowrieRawEvent;
}

export function toNormalizedEvent(raw: CowrieRawEvent): NormalizedEvent {
  const eventType = normalizeEventType(raw.eventid);
  const message = typeof raw.message === 'string' ? raw.message : null;

  // For payload events, surface the most informative value in `command` so it
  // shows up legibly in the events/commands views (e.g. the download URL).
  let command = raw.input ?? null;
  if (eventType === 'file.download') command = (raw as any).url ?? message;
  else if (eventType === 'file.upload') command = (raw as any).filename ?? message;
  else if (eventType === 'direct.tcpip') {
    const di = (raw as any).dst_ip, dp = (raw as any).dst_port;
    command = di ? `tunnel → ${di}${dp ? `:${dp}` : ''}` : message;
  }

  return {
    sessionId: raw.session,
    eventType,
    eventTs: new Date(raw.timestamp),
    srcIp: raw.src_ip,
    message: stripNulls(message) ?? null,
    command: stripNulls(command) ?? null,
    username: stripNulls(raw.username) ?? null,
    password: stripNulls(raw.password) ?? null,
    success: eventType === 'auth.success' ? true : eventType === 'auth.failed' ? false : null,
    rawJson: raw,
    normalizedJson: buildNormalizedJson(raw),
  };
}

export function extractSessionData(raw: CowrieRawEvent): SessionUpsertData {
  const data: SessionUpsertData = {
    cowrieSessionId: raw.session,
    srcIp: raw.src_ip,
    protocol: raw.protocol ?? 'ssh',
    startedAt: new Date(raw.timestamp),
  };

  if (typeof raw.sensor === 'string' && raw.sensor) data.sensorId = raw.sensor;
  if (raw.username) data.username = stripNulls(raw.username) ?? raw.username;
  if (raw.password) data.password = stripNulls(raw.password) ?? raw.password;
  if (raw.eventid === 'cowrie.login.success') data.loginSuccess = true;
  if (raw.eventid === 'cowrie.login.failed') data.loginSuccess = false;
  if (raw.hassh) data.hassh = raw.hassh;
  if (raw.version) data.clientVersion = raw.version;
  if (raw.eventid === 'cowrie.session.closed') {
    data.endedAt = new Date(raw.timestamp);
  }

  return data;
}
