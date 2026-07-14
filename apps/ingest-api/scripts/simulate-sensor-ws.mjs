// Manual verification tool for the sensor-control WebSocket channel
// (Rebanada 2/3, docs/plans/SENSOR_REMOTE_CONTROL.md). Mints a control
// credential for a sensor that must already exist, connects, completes
// hello, answers ping with pong, and — since Rebanada 3 — replies to an
// incoming `command` with ack -> running -> result(succeeded). Stays up
// until Ctrl-C.
//
// Usage:
//   INGEST_URL=http://localhost:3000 \
//   CONTROL_API_SECRET=... \
//   SENSOR_ID=cowrie-01-example \
//   node scripts/simulate-sensor-ws.mjs
import { randomUUID } from 'crypto'
import WebSocket from 'ws'

const httpUrl = process.env.INGEST_URL ?? 'http://localhost:3000'
const wsUrl = httpUrl.replace(/^http/, 'ws') + '/sensors/control/ws'
const controlApiSecret = process.env.CONTROL_API_SECRET
const sensorId = process.env.SENSOR_ID

if (!controlApiSecret || !sensorId) {
  console.error('Usage: CONTROL_API_SECRET=... SENSOR_ID=... node scripts/simulate-sensor-ws.mjs')
  process.exit(1)
}

async function issueCredential() {
  const res = await fetch(`${httpUrl}/sensors/${encodeURIComponent(sensorId)}/control-credential`, {
    method: 'POST',
    headers: {
      'X-Control-Api-Token': controlApiSecret,
      'X-Control-Actor-Id': 'simulate-sensor-ws-script',
      'X-Control-Actor-Role': 'superadmin',
      'X-Control-Actor-Superadmin': 'true',
      'X-Control-Actor-Ip': '127.0.0.1',
    },
  })
  if (!res.ok) {
    throw new Error(`credential mint failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

const { secret, secretPrefix } = await issueCredential()
console.log(`credential issued, prefix ${secretPrefix}`)

const ws = new WebSocket(wsUrl, {
  headers: { 'X-Sensor-Id': sensorId, 'X-Sensor-Control-Secret': secret },
})

ws.on('open', () => {
  console.log('connected, sending hello')
  ws.send(JSON.stringify({
    protocolVersion: 1,
    messageId: randomUUID(),
    sentAt: new Date().toISOString(),
    type: 'hello',
    sensorId,
    agentVersion: 'simulate-sensor-ws/1.0',
    capabilities: ['status.get'],
    configHash: null,
  }))
})

const actionedCommandIds = new Set()

ws.on('message', (data) => {
  const message = JSON.parse(data.toString('utf8'))
  console.log('received', message.type, message)

  if (message.type === 'ping') {
    ws.send(JSON.stringify({
      protocolVersion: 1,
      messageId: randomUUID(),
      sentAt: new Date().toISOString(),
      type: 'pong',
      pingMessageId: message.messageId,
    }))
    console.log('replied pong')
    return
  }

  if (message.type === 'command') {
    if (actionedCommandIds.has(message.commandId)) {
      console.log('duplicate command, ignoring', message.commandId)
      return
    }
    actionedCommandIds.add(message.commandId)

    ws.send(JSON.stringify({
      protocolVersion: 1,
      messageId: randomUUID(),
      sentAt: new Date().toISOString(),
      type: 'command.ack',
      commandId: message.commandId,
      sensorId,
      accepted: true,
    }))
    console.log('acked', message.commandId)

    setTimeout(() => {
      ws.send(JSON.stringify({
        protocolVersion: 1,
        messageId: randomUUID(),
        sentAt: new Date().toISOString(),
        type: 'command.running',
        commandId: message.commandId,
        sensorId,
      }))
      console.log('running', message.commandId)

      setTimeout(() => {
        ws.send(JSON.stringify({
          protocolVersion: 1,
          messageId: randomUUID(),
          sentAt: new Date().toISOString(),
          type: 'command.result',
          commandId: message.commandId,
          sensorId,
          status: 'succeeded',
          result: {
            agentVersion: 'simulate-sensor-ws/1.0',
            uptimeSeconds: Math.floor(process.uptime()),
            pid: process.pid,
            ports: [22],
            configHash: null,
          },
        }))
        console.log('result sent', message.commandId)
      }, 300)
    }, 300)
  }
})

ws.on('close', (code, reason) => {
  console.log('closed', code, reason.toString())
  process.exit(0)
})

ws.on('error', (err) => console.error('error', err))

process.on('SIGINT', () => {
  console.log('closing...')
  ws.close(1000, 'sigint')
})
