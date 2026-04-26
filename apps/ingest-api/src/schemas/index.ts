import { z } from 'zod';

export const ingestFileBodySchema = z.object({
  filePath: z.string().min(1, 'filePath is required'),
});

export type IngestFileBody = z.infer<typeof ingestFileBodySchema>;

export const cowrieRawEventSchema = z.object({
  eventid: z.string(),
  timestamp: z.string(),
  src_ip: z.string(),
  session: z.string(),
}).passthrough();

export const ingestBatchBodySchema = z.object({
  events: z.array(cowrieRawEventSchema).min(1).max(1000),
});

// Vector HTTP sink sends a raw JSON array — no wrapper object
export const vectorBatchBodySchema = z.array(cowrieRawEventSchema).min(1).max(1000);
