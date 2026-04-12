import { describe, it, expect } from 'vitest';
import { parseLine, toNormalizedEvent, extractSessionData } from '../src/lib/parser.js';

const RAW_CONNECT = '{"eventid":"cowrie.session.connect","src_ip":"172.19.0.1","src_port":43874,"dst_ip":"172.19.0.2","dst_port":2222,"session":"abc123","protocol":"ssh","message":"New connection","timestamp":"2026-04-12T22:24:16.921834Z"}';
const RAW_LOGIN_SUCCESS = '{"eventid":"cowrie.login.success","username":"root","password":"test","message":"login attempt [root/test] succeeded","timestamp":"2026-04-12T22:24:50.636977Z","src_ip":"172.19.0.1","session":"abc123","protocol":"ssh"}';
const RAW_LOGIN_FAILED = '{"eventid":"cowrie.login.failed","username":"admin","password":"1234","message":"login attempt failed","timestamp":"2026-04-12T22:25:00.000000Z","src_ip":"172.19.0.1","session":"abc123","protocol":"ssh"}';
const RAW_CLIENT_VERSION = '{"eventid":"cowrie.client.version","version":"SSH-2.0-OpenSSH_9.5","message":"Remote SSH version","timestamp":"2026-04-12T22:24:16.922344Z","src_ip":"172.19.0.1","session":"abc123","protocol":"ssh"}';
const RAW_CLIENT_KEX = '{"eventid":"cowrie.client.kex","hassh":"701158e75b508e76f0410d5d22ef9df0","message":"SSH client hassh","timestamp":"2026-04-12T22:24:16.924307Z","src_ip":"172.19.0.1","session":"abc123","protocol":"ssh"}';
const RAW_COMMAND_INPUT = '{"eventid":"cowrie.command.input","input":"whoami","message":"CMD: whoami","timestamp":"2026-04-12T22:24:53.436818Z","src_ip":"172.19.0.1","session":"abc123","protocol":"ssh"}';
const RAW_COMMAND_FAILED = '{"eventid":"cowrie.command.failed","input":"badcmd","message":"Command not found: badcmd","timestamp":"2026-04-12T22:24:53.437554Z","src_ip":"172.19.0.1","session":"abc123","protocol":"ssh"}';
const RAW_SESSION_CLOSED = '{"eventid":"cowrie.session.closed","duration":"188.9","message":"Connection lost after 188.9 seconds","timestamp":"2026-04-12T22:27:52.788437Z","src_ip":"172.19.0.1","session":"abc123","protocol":"ssh"}';

describe('parseLine', () => {
  it('parses valid JSON line', () => {
    const result = parseLine(RAW_CONNECT);
    expect(result).not.toBeNull();
    expect(result!.eventid).toBe('cowrie.session.connect');
    expect(result!.session).toBe('abc123');
  });

  it('returns null for empty line', () => {
    expect(parseLine('')).toBeNull();
    expect(parseLine('   ')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseLine('not json')).toBeNull();
  });

  it('returns null for JSON missing required fields', () => {
    expect(parseLine('{"foo":"bar"}')).toBeNull();
  });
});

describe('toNormalizedEvent', () => {
  it('normalizes session.connect', () => {
    const raw = parseLine(RAW_CONNECT)!;
    const event = toNormalizedEvent(raw);
    expect(event.eventType).toBe('session.connect');
    expect(event.srcIp).toBe('172.19.0.1');
    expect(event.success).toBeNull();
  });

  it('normalizes auth.success', () => {
    const raw = parseLine(RAW_LOGIN_SUCCESS)!;
    const event = toNormalizedEvent(raw);
    expect(event.eventType).toBe('auth.success');
    expect(event.username).toBe('root');
    expect(event.password).toBe('test');
    expect(event.success).toBe(true);
  });

  it('normalizes auth.failed', () => {
    const raw = parseLine(RAW_LOGIN_FAILED)!;
    const event = toNormalizedEvent(raw);
    expect(event.eventType).toBe('auth.failed');
    expect(event.success).toBe(false);
  });

  it('normalizes client.version', () => {
    const raw = parseLine(RAW_CLIENT_VERSION)!;
    const event = toNormalizedEvent(raw);
    expect(event.eventType).toBe('client.version');
  });

  it('normalizes client.kex', () => {
    const raw = parseLine(RAW_CLIENT_KEX)!;
    const event = toNormalizedEvent(raw);
    expect(event.eventType).toBe('client.kex');
  });

  it('normalizes command.input', () => {
    const raw = parseLine(RAW_COMMAND_INPUT)!;
    const event = toNormalizedEvent(raw);
    expect(event.eventType).toBe('command.input');
    expect(event.command).toBe('whoami');
  });

  it('normalizes command.failed', () => {
    const raw = parseLine(RAW_COMMAND_FAILED)!;
    const event = toNormalizedEvent(raw);
    expect(event.eventType).toBe('command.failed');
    expect(event.command).toBe('badcmd');
  });

  it('maps unknown eventid to unknown', () => {
    const raw = parseLine('{"eventid":"cowrie.session.params","timestamp":"2026-04-12T22:24:50.000Z","src_ip":"1.2.3.4","session":"x"}')!;
    const event = toNormalizedEvent(raw);
    expect(event.eventType).toBe('unknown');
  });

  it('preserves rawJson', () => {
    const raw = parseLine(RAW_COMMAND_INPUT)!;
    const event = toNormalizedEvent(raw);
    expect(event.rawJson.eventid).toBe('cowrie.command.input');
  });
});

describe('extractSessionData', () => {
  it('extracts base session fields from connect', () => {
    const raw = parseLine(RAW_CONNECT)!;
    const data = extractSessionData(raw);
    expect(data.cowrieSessionId).toBe('abc123');
    expect(data.srcIp).toBe('172.19.0.1');
    expect(data.protocol).toBe('ssh');
  });

  it('extracts username/password from login', () => {
    const raw = parseLine(RAW_LOGIN_SUCCESS)!;
    const data = extractSessionData(raw);
    expect(data.username).toBe('root');
    expect(data.password).toBe('test');
    expect(data.loginSuccess).toBe(true);
  });

  it('sets loginSuccess false on failed login', () => {
    const raw = parseLine(RAW_LOGIN_FAILED)!;
    const data = extractSessionData(raw);
    expect(data.loginSuccess).toBe(false);
  });

  it('extracts clientVersion', () => {
    const raw = parseLine(RAW_CLIENT_VERSION)!;
    const data = extractSessionData(raw);
    expect(data.clientVersion).toBe('SSH-2.0-OpenSSH_9.5');
  });

  it('extracts hassh from kex', () => {
    const raw = parseLine(RAW_CLIENT_KEX)!;
    const data = extractSessionData(raw);
    expect(data.hassh).toBe('701158e75b508e76f0410d5d22ef9df0');
  });

  it('extracts endedAt from session.closed', () => {
    const raw = parseLine(RAW_SESSION_CLOSED)!;
    const data = extractSessionData(raw);
    expect(data.endedAt).toBeInstanceOf(Date);
  });
});
