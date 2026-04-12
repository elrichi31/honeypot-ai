export interface CowrieRawEvent {
  eventid: string;
  timestamp: string;
  src_ip: string;
  session: string;
  protocol?: string;
  message?: string | string[];
  src_port?: number;
  dst_ip?: string;
  dst_port?: number;
  username?: string;
  password?: string;
  version?: string;
  hassh?: string;
  hasshAlgorithms?: string;
  input?: string;
  duration?: string;
  sensor?: string;
  uuid?: string;
  [key: string]: unknown;
}

export type InternalEventType =
  | 'session.connect'
  | 'session.closed'
  | 'auth.success'
  | 'auth.failed'
  | 'client.version'
  | 'client.kex'
  | 'client.size'
  | 'command.input'
  | 'command.failed'
  | 'unknown';

export interface NormalizedEvent {
  sessionId: string;
  eventType: InternalEventType;
  eventTs: Date;
  srcIp: string;
  message: string | null;
  command: string | null;
  username: string | null;
  password: string | null;
  success: boolean | null;
  rawJson: CowrieRawEvent;
  normalizedJson: Record<string, unknown>;
}

export interface SessionUpsertData {
  cowrieSessionId: string;
  srcIp: string;
  protocol: string;
  startedAt: Date;
  username?: string;
  password?: string;
  loginSuccess?: boolean;
  hassh?: string;
  clientVersion?: string;
  endedAt?: Date;
}

export interface IngestSummary {
  processed: number;
  insertedEvents: number;
  createdSessions: number;
  updatedSessions: number;
  skipped: number;
  errors: string[];
}
