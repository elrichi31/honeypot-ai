import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// Mock the filesystem so we can feed canned NDJSON to processCowrieFile.
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

// IngestService orchestrates two repositories; mock them so these tests cover
// the orchestration (counting, skipping invalid lines, per-line error capture)
// without coupling to how the repos talk to Prisma.
const sessionUpsert = vi.fn();
const eventCreateIfNotExists = vi.fn();

vi.mock('../src/modules/sessions/session.repository.js', () => ({
  SessionRepository: vi.fn().mockImplementation(() => ({ upsert: sessionUpsert })),
}));
vi.mock('../src/modules/events/event.repository.js', () => ({
  EventRepository: vi.fn().mockImplementation(() => ({ createIfNotExists: eventCreateIfNotExists })),
}));

// Side effects fired on successful events — stub so they don't run during tests.
vi.mock('../src/lib/discord.js', () => ({ sendDiscordAlert: vi.fn() }));
vi.mock('../src/lib/client-forward.js', () => ({ forwardClientEventBySensorId: vi.fn() }));

import { IngestService } from '../src/modules/ingest/ingest.service.js';

const mockPrisma = {} as any;

const SAMPLE_LINES = [
  '{"eventid":"cowrie.session.connect","src_ip":"1.2.3.4","src_port":1234,"dst_ip":"5.6.7.8","dst_port":2222,"session":"sess1","protocol":"ssh","message":"New connection","timestamp":"2026-04-12T22:24:16.000Z"}',
  '{"eventid":"cowrie.login.success","username":"root","password":"toor","message":"login succeeded","timestamp":"2026-04-12T22:24:50.000Z","src_ip":"1.2.3.4","session":"sess1","protocol":"ssh"}',
  '{"eventid":"cowrie.command.input","input":"whoami","message":"CMD: whoami","timestamp":"2026-04-12T22:24:53.000Z","src_ip":"1.2.3.4","session":"sess1","protocol":"ssh"}',
].join('\n');

describe('IngestService', () => {
  let service: IngestService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IngestService(mockPrisma);

    // Defaults: first line creates the session, rest update it; all events insert.
    sessionUpsert
      .mockResolvedValueOnce({ id: 'db-sess-1', created: true })
      .mockResolvedValue({ id: 'db-sess-1', created: false });
    eventCreateIfNotExists.mockResolvedValue({ id: 'db-evt-1', created: true });
  });

  it('processes a file and returns correct summary', async () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_LINES);

    const summary = await service.processCowrieFile('/fake/path.json');

    expect(summary.processed).toBe(3);
    expect(summary.insertedEvents).toBe(3);
    expect(summary.createdSessions).toBe(1);
    expect(summary.updatedSessions).toBe(2);
    expect(summary.skipped).toBe(0);
    expect(summary.errors).toHaveLength(0);
  });

  it('skips invalid lines', async () => {
    vi.mocked(readFileSync).mockReturnValue(
      'not json\n{"eventid":"cowrie.session.connect","src_ip":"1.2.3.4","session":"s1","timestamp":"2026-04-12T00:00:00Z","protocol":"ssh","message":"ok"}',
    );

    const summary = await service.processCowrieFile('/fake/path.json');

    expect(summary.processed).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.insertedEvents).toBe(1);
  });

  it('handles empty file', async () => {
    vi.mocked(readFileSync).mockReturnValue('');

    const summary = await service.processCowrieFile('/fake/path.json');

    expect(summary.processed).toBe(0);
    expect(summary.insertedEvents).toBe(0);
  });

  it('captures errors per line without stopping', async () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_LINES);

    sessionUpsert.mockReset();
    sessionUpsert
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValue({ id: 'db-sess-1', created: false });

    const summary = await service.processCowrieFile('/fake/path.json');

    expect(summary.errors.length).toBeGreaterThan(0);
    expect(summary.errors[0]).toContain('DB error');
    // The failing line must not stop processing of the remaining lines.
    expect(summary.processed).toBe(3);
  });
});
