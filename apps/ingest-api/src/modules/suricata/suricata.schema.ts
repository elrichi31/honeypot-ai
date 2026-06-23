import { z } from 'zod'

// Suricata EVE alert event. Shared by the HTTP route and the Kafka consumer so
// both validate incoming alerts identically.
export const eveAlertSchema = z.object({
  timestamp: z.string(),
  flow_id: z.number().optional(),
  in_iface: z.string().optional(),
  event_type: z.literal('alert'),
  src_ip: z.string().default(''),
  src_port: z.number().int().optional(),
  dest_ip: z.string().default(''),
  dest_port: z.number().int().optional(),
  proto: z.string().default(''),
  sensor_id: z.string().default(''),
  alert: z.object({
    action: z.string().default('allowed'),
    gid: z.number().optional(),
    signature_id: z.number().int().default(0),
    rev: z.number().optional(),
    signature: z.string().default(''),
    category: z.string().default(''),
    severity: z.number().int().min(1).max(4).default(3),
  }),
})

export type EveAlertInput = z.infer<typeof eveAlertSchema>
