import { z } from 'zod'

export const SENSOR_CONTROL_PROTOCOL_VERSION = 1 as const
export const SENSOR_CONTROL_MAX_MESSAGE_BYTES = 16 * 1024
export const SENSOR_CONTROL_MAX_CAPABILITIES = 16
export const SENSOR_CONTROL_MAX_PORTS = 64

const timestampSchema = z.string().datetime({ offset: true, precision: 3 })
const opaqueIdSchema = z.string().trim().min(1).max(128)
const sensorIdSchema = z.string().trim().min(1).max(128)
const versionSchema = z.string().trim().min(1).max(64)
const configHashSchema = z.string().trim().min(1).max(128)

const messageBaseSchema = z.object({
  protocolVersion: z.literal(SENSOR_CONTROL_PROTOCOL_VERSION),
  messageId: z.string().uuid(),
  sentAt: timestampSchema,
})

export const sensorControlActionSchema = z.enum(['status.get', 'config.apply'])
export type SensorControlAction = z.infer<typeof sensorControlActionSchema>

export const sensorControlCapabilitySchema = sensorControlActionSchema
export type SensorControlCapability = z.infer<typeof sensorControlCapabilitySchema>

// config.apply carries only the hash on the wire — the agent re-fetches the
// full config from the same GET /sensors/:id/config the HTTP poller already
// uses, so this schema never needs to know any protocol's config shape.
export const sensorControlConfigApplyPayloadSchema = z.object({
  configHash: z.string().trim().min(1).max(128),
}).strict()

export const sensorStatusDetailsSchema = z.object({
  agentVersion: versionSchema,
  uptimeSeconds: z.number().int().nonnegative(),
  pid: z.number().int().positive().optional(),
  ports: z.array(z.number().int().min(1).max(65535)).max(SENSOR_CONTROL_MAX_PORTS),
  configHash: configHashSchema.nullable(),
}).strict()
export type SensorStatusDetails = z.infer<typeof sensorStatusDetailsSchema>

export const sensorControlErrorSchema = z.object({
  code: z.string().trim().min(1).max(64).regex(/^[A-Z][A-Z0-9_]*$/),
  message: z.string().trim().min(1).max(512),
  retryable: z.boolean().default(false),
}).strict()
export type SensorControlError = z.infer<typeof sensorControlErrorSchema>

export const sensorControlHelloSchema = messageBaseSchema.extend({
  type: z.literal('hello'),
  sensorId: sensorIdSchema,
  agentVersion: versionSchema,
  capabilities: z.array(sensorControlCapabilitySchema).min(1).max(SENSOR_CONTROL_MAX_CAPABILITIES),
  configHash: configHashSchema.nullable(),
}).strict()
export type SensorControlHello = z.infer<typeof sensorControlHelloSchema>

export const sensorControlHelloAcceptedSchema = messageBaseSchema.extend({
  type: z.literal('hello.accepted'),
  connectionId: z.string().uuid(),
  heartbeatIntervalSeconds: z.number().int().min(10).max(300),
}).strict()
export type SensorControlHelloAccepted = z.infer<typeof sensorControlHelloAcceptedSchema>

export const sensorControlHelloRejectedSchema = messageBaseSchema.extend({
  type: z.literal('hello.rejected'),
  error: sensorControlErrorSchema,
}).strict()
export type SensorControlHelloRejected = z.infer<typeof sensorControlHelloRejectedSchema>

export const sensorControlCommandSchema = messageBaseSchema.extend({
  type: z.literal('command'),
  commandId: opaqueIdSchema,
  sensorId: sensorIdSchema,
  action: sensorControlActionSchema,
  // Server-constructed only (buildCommandMessage), never parsed from
  // untrusted input — loose on purpose so each action's payload shape
  // doesn't need its own branch of a discriminated union here.
  payload: z.record(z.string(), z.unknown()),
  expiresAt: timestampSchema,
}).strict()
export type SensorControlCommand = z.infer<typeof sensorControlCommandSchema>

const commandAckBaseSchema = messageBaseSchema.extend({
  type: z.literal('command.ack'),
  commandId: opaqueIdSchema,
  sensorId: sensorIdSchema,
})

export const sensorControlCommandAckSchema = z.discriminatedUnion('accepted', [
  commandAckBaseSchema.extend({ accepted: z.literal(true) }).strict(),
  commandAckBaseSchema.extend({ accepted: z.literal(false), error: sensorControlErrorSchema }).strict(),
])
export type SensorControlCommandAck = z.infer<typeof sensorControlCommandAckSchema>

export const sensorControlCommandRunningSchema = messageBaseSchema.extend({
  type: z.literal('command.running'),
  commandId: opaqueIdSchema,
  sensorId: sensorIdSchema,
}).strict()
export type SensorControlCommandRunning = z.infer<typeof sensorControlCommandRunningSchema>

const commandResultBaseSchema = messageBaseSchema.extend({
  type: z.literal('command.result'),
  commandId: opaqueIdSchema,
  sensorId: sensorIdSchema,
})

export const sensorControlCommandResultSchema = z.discriminatedUnion('status', [
  commandResultBaseSchema.extend({
    status: z.literal('succeeded'),
    result: sensorStatusDetailsSchema,
  }).strict(),
  commandResultBaseSchema.extend({
    status: z.literal('failed'),
    error: sensorControlErrorSchema,
  }).strict(),
])
export type SensorControlCommandResult = z.infer<typeof sensorControlCommandResultSchema>

export const sensorControlStatusSchema = messageBaseSchema.extend({
  type: z.literal('sensor.status'),
  sensorId: sensorIdSchema,
  state: z.enum(['healthy', 'degraded', 'unhealthy']),
  details: sensorStatusDetailsSchema,
}).strict()
export type SensorControlStatus = z.infer<typeof sensorControlStatusSchema>

export const sensorControlPingSchema = messageBaseSchema.extend({
  type: z.literal('ping'),
}).strict()
export type SensorControlPing = z.infer<typeof sensorControlPingSchema>

export const sensorControlPongSchema = messageBaseSchema.extend({
  type: z.literal('pong'),
  pingMessageId: z.string().uuid(),
}).strict()
export type SensorControlPong = z.infer<typeof sensorControlPongSchema>

export const sensorControlClientMessageSchema = z.union([
  sensorControlHelloSchema,
  sensorControlCommandAckSchema,
  sensorControlCommandRunningSchema,
  sensorControlCommandResultSchema,
  sensorControlStatusSchema,
  sensorControlPongSchema,
])
export type SensorControlClientMessage = z.infer<typeof sensorControlClientMessageSchema>

export const sensorControlServerMessageSchema = z.discriminatedUnion('type', [
  sensorControlHelloAcceptedSchema,
  sensorControlHelloRejectedSchema,
  sensorControlCommandSchema,
  sensorControlPingSchema,
])
export type SensorControlServerMessage = z.infer<typeof sensorControlServerMessageSchema>
