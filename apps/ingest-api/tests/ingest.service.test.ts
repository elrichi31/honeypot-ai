import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestService } from '../src/modules/ingest/ingest.service.js';
import { readFileSync } from 'node:fs';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

const mockSession = {
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockEvent = {
  findUnique: vi.fn(),
  create: vi.fn(),
};

const mockPrisma = {
  session: mockSession,
  event: mockEvent,
} as any;

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

    mockSession.findUnique.mockResolvedValue(null);
    mockSession.create.mockResolvedValue({ id: 'db-sess-1' });
    mockSession.update.mockResolvedValue({ id: 'db-sess-1' });
    mockEvent.findUnique.mockResolvedValue(null);
    mockEvent.create.mockResolvedValue({ id: 'db-evt-1' });
  });

  it('processes a file and returns correct summary', async () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_LINES);

    // First call creates, subsequent calls find existing
    mockSession.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'db-sess-1' })
      .mockResolvedValueOnce({ id: 'db-sess-1' });

    const summary = await service.processCowrieFile('/fake/path.json');

    expect(summary.processed).toBe(3);
    expect(summary.insertedEvents).toBe(3);
    expect(summary.createdSessions).toBe(1);
    expect(summary.updatedSessions).toBe(2);
    expect(summary.skipped).toBe(0);
    expect(summary.errors).toHaveLength(0);
  });

  it('skips invalid lines', async () => {
    vi.mocked(readFileSync).mockReturnValue('not json\n{"eventid":"cowrie.session.connect","src_ip":"1.2.3.4","session":"s1","timestamp":"2026-04-12T00:00:00Z","protocol":"ssh","message":"ok"}');

    mockSession.findUnique.mockResolvedValue(null);
    mockSession.create.mockResolvedValue({ id: 'db-1' });
    mockEvent.findUnique.mockResolvedValue(null);
    mockEvent.create.mockResolvedValue({ id: 'evt-1' });

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

    mockSession.findUnique.mockResolvedValue(null);
    mockSession.create
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValue({ id: 'db-1' });
    mockEvent.create.mockResolvedValue({ id: 'evt-1' });

    const summary = await service.processCowrieFile('/fake/path.json');

    expect(summary.errors.length).toBeGreaterThan(0);
    expect(summary.errors[0]).toContain('DB error');
  });
});
