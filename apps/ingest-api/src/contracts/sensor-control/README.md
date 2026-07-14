# Sensor Control Protocol v1

This folder is the source of truth for the sensor-control wire contract. It is
transport-neutral: the same messages are used over WebSocket and the future HTTP
fallback. Route handlers, socket plugins, and sensor agents must import the Zod
schemas and inferred types from `protocol.ts`; they must not redefine messages.

## Scope of v1

The only enabled command is `status.get`. It proves the complete control-plane
cycle without changing a sensor: persisted command, delivery, acknowledgement,
execution, result, and audit trail. `config.apply`, restart, identity rotation,
and capture actions require a new typed command variant and their own validation
before they can be enabled.

## Security boundary

- Authentication binds a connection to one sensor before any message is parsed as
  trusted. `sensorId` in a message is an assertion to verify, never its identity.
- Every message is strict: unknown fields are rejected.
- WebSocket transport must reject encoded frames larger than
  `SENSOR_CONTROL_MAX_MESSAGE_BYTES` before JSON parsing.
- The protocol carries no token, secret, shell command, or unbounded JSON payload.
- Error messages are safe for operators and must not contain credentials or raw
  stack traces.

## Delivery and state semantics

1. The server persists a command as `queued` before attempting delivery.
2. The server marks it `sent` only after writing the command to the transport.
3. The sensor sends `command.ack`; accepted means received, not completed.
4. The sensor may send `command.running`, then exactly one terminal
   `command.result`.
5. `commandId` is idempotency material. A sensor must retain recent terminal
   results long enough to answer duplicate deliveries without executing again.
6. The backend owns the durable state machine. A live socket registry is only a
   delivery optimization.

## Versioning and extension

- `protocolVersion` is required on every message. Unsupported versions receive
  `hello.rejected` and may use the HTTP fallback when available.
- Additive fields are not silently accepted because schemas are strict. Extend a
  message intentionally in this folder and update every implementation together.
- New actions are discriminated variants with a typed payload. Do not add generic
  `{ action: string, payload: unknown }` escape hatches.
- A multi-instance deployment may replace the in-memory socket registry with a
  broker-backed delivery adapter. That change must not alter this protocol.
