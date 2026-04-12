import { cowrieRawEventSchema } from '../schemas/index.js';
import { normalizeEventType, buildNormalizedJson } from './normalizer.js';
import type { CowrieRawEvent, NormalizedEvent, SessionUpsertData } from '../types/index.js';

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

  return {
    sessionId: raw.session,
    eventType,
    eventTs: new Date(raw.timestamp),
    srcIp: raw.src_ip,
    message,
    command: raw.input ?? null,
    username: raw.username ?? null,
    password: raw.password ?? null,
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

  if (raw.username) data.username = raw.username;
  if (raw.password) data.password = raw.password;
  if (raw.eventid === 'cowrie.login.success') data.loginSuccess = true;
  if (raw.eventid === 'cowrie.login.failed') data.loginSuccess = false;
  if (raw.hassh) data.hassh = raw.hassh;
  if (raw.version) data.clientVersion = raw.version;
  if (raw.eventid === 'cowrie.session.closed' && raw.duration) {
    data.endedAt = new Date(raw.timestamp);
  }

  return data;
}
