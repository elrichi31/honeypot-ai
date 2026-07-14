export const sensorCommandStatuses = [
  'queued', 'sent', 'acked', 'running', 'succeeded', 'failed', 'expired', 'cancelled',
] as const

export type SensorCommandStatus = (typeof sensorCommandStatuses)[number]

const transitions: Readonly<Record<SensorCommandStatus, readonly SensorCommandStatus[]>> = {
  queued: ['sent', 'expired', 'cancelled'],
  // command.ack with accepted: false means the sensor received the command
  // and explicitly declined it (e.g. already busy) — that's a real reply,
  // distinct from 'expired' (never replied at all), so 'sent' can go
  // straight to 'failed' via a rejected ack.
  sent: ['acked', 'failed', 'expired'],
  // A command may skip 'running' entirely (the contract says the sensor "may
  // send command.running") and go straight to a terminal state once acked.
  acked: ['running', 'succeeded', 'failed', 'expired'],
  running: ['succeeded', 'failed', 'expired'],
  succeeded: [],
  failed: [],
  expired: [],
  cancelled: [],
}

export function canTransitionSensorCommand(
  from: SensorCommandStatus,
  to: SensorCommandStatus,
): boolean {
  return transitions[from].includes(to)
}
