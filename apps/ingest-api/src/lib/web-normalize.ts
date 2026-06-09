import { z } from 'zod';

export const webHitSchema = z.object({
  eventId: z.string().uuid(),
  sensorId: z.string().min(1).optional(),
  timestamp: z.string().datetime({ offset: true }),
  srcIp: z.string().min(1),
  method: z.string().min(1),
  path: z.string().min(1),
  query: z.string().default(''),
  userAgent: z.string().default(''),
  headers: z.unknown().default({}),
  body: z.string().default(''),
  attackType: z.string().min(1),
  // Set by the web honeypot when an attacker replays the leaked DB credentials
  // at a login form — a high-confidence compromise signal.
  canaryTriggered: z.boolean().default(false),
});

export type WebHit = z.infer<typeof webHitSchema>;

function normalizeHeaderValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string | number | boolean =>
        ['string', 'number', 'boolean'].includes(typeof item)
      )
      .map(String)
      .join(', ');
  }
  if (value && typeof value === 'object') return JSON.stringify(value);
  return null;
}

export function normalizeHeaders(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalized = normalizeHeaderValue(value);
    if (normalized !== null) result[key] = normalized;
  }
  return result;
}

export function parseWebHitBatch(items: unknown[]): {
  events: Array<WebHit & { headers: Record<string, string> }>;
  invalidCount: number;
} {
  const parsed = items.map((item) => webHitSchema.safeParse(item));
  const events = parsed
    .filter((r): r is { success: true; data: WebHit } => r.success)
    .map((r) => ({ ...r.data, headers: normalizeHeaders(r.data.headers) }));
  return { events, invalidCount: parsed.length - events.length };
}
