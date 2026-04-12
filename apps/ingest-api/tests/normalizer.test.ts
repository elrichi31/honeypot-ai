import { describe, it, expect } from 'vitest';
import { normalizeEventType, buildNormalizedJson } from '../src/lib/normalizer.js';
import type { CowrieRawEvent } from '../src/types/index.js';

describe('normalizeEventType', () => {
  it('maps cowrie.session.connect → session.connect', () => {
    expect(normalizeEventType('cowrie.session.connect')).toBe('session.connect');
  });

  it('maps cowrie.login.success → auth.success', () => {
    expect(normalizeEventType('cowrie.login.success')).toBe('auth.success');
  });

  it('maps cowrie.login.failed → auth.failed', () => {
    expect(normalizeEventType('cowrie.login.failed')).toBe('auth.failed');
  });

  it('maps cowrie.client.version → client.version', () => {
    expect(normalizeEventType('cowrie.client.version')).toBe('client.version');
  });

  it('maps cowrie.client.kex → client.kex', () => {
    expect(normalizeEventType('cowrie.client.kex')).toBe('client.kex');
  });

  it('maps cowrie.command.input → command.input', () => {
    expect(normalizeEventType('cowrie.command.input')).toBe('command.input');
  });

  it('maps cowrie.command.failed → command.failed', () => {
    expect(normalizeEventType('cowrie.command.failed')).toBe('command.failed');
  });

  it('maps cowrie.session.closed → session.closed', () => {
    expect(normalizeEventType('cowrie.session.closed')).toBe('session.closed');
  });

  it('maps cowrie.client.size → client.size', () => {
    expect(normalizeEventType('cowrie.client.size')).toBe('client.size');
  });

  it('maps unknown eventid → unknown', () => {
    expect(normalizeEventType('cowrie.session.params')).toBe('unknown');
  });
});

describe('buildNormalizedJson', () => {
  const base: CowrieRawEvent = {
    eventid: 'cowrie.session.connect',
    timestamp: '2026-04-12T22:24:16.921834Z',
    src_ip: '172.19.0.1',
    session: 'abc123',
    protocol: 'ssh',
    src_port: 43874,
    dst_ip: '172.19.0.2',
    dst_port: 2222,
  };

  it('includes base fields for session.connect', () => {
    const result = buildNormalizedJson(base);
    expect(result.eventType).toBe('session.connect');
    expect(result.sessionId).toBe('abc123');
    expect(result.srcIp).toBe('172.19.0.1');
    expect(result.protocol).toBe('ssh');
    expect(result.srcPort).toBe(43874);
  });

  it('includes username/password for auth events', () => {
    const raw: CowrieRawEvent = {
      ...base,
      eventid: 'cowrie.login.success',
      username: 'root',
      password: 'test',
    };
    const result = buildNormalizedJson(raw);
    expect(result.username).toBe('root');
    expect(result.password).toBe('test');
  });

  it('includes command for command events', () => {
    const raw: CowrieRawEvent = {
      ...base,
      eventid: 'cowrie.command.input',
      input: 'ls -la',
    };
    const result = buildNormalizedJson(raw);
    expect(result.command).toBe('ls -la');
  });

  it('includes version for client.version', () => {
    const raw: CowrieRawEvent = {
      ...base,
      eventid: 'cowrie.client.version',
      version: 'SSH-2.0-OpenSSH_9.5',
    };
    const result = buildNormalizedJson(raw);
    expect(result.version).toBe('SSH-2.0-OpenSSH_9.5');
  });

  it('includes hassh for client.kex', () => {
    const raw: CowrieRawEvent = {
      ...base,
      eventid: 'cowrie.client.kex',
      hassh: 'abc123hash',
    };
    const result = buildNormalizedJson(raw);
    expect(result.hassh).toBe('abc123hash');
  });
});
