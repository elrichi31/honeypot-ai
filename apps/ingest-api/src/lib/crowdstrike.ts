type AlertLevel = "critical" | "high" | "info"

interface Field { name: string; value: string; inline?: boolean }

export interface CrowdStrikeAlertOptions {
  hecUrl: string
  apiKey: string
  level: AlertLevel
  title: string
  description: string
  fields?: Field[]
  srcIp?: string | null
  sensorId?: string | null
}

const SEVERITY: Record<AlertLevel, number> = {
  critical: 9,
  high: 7,
  info: 3,
}

const CS_FAILURE_LOG_COOLDOWN_MS = 15 * 60 * 1000
const lastFailureLogAt = new Map<string, number>()

function logFailure(hecUrl: string, message: string) {
  const now = Date.now()
  const last = lastFailureLogAt.get(hecUrl) ?? 0
  if (now - last < CS_FAILURE_LOG_COOLDOWN_MS) return
  lastFailureLogAt.set(hecUrl, now)
  console.error(`[crowdstrike] ${message}`)
}

export async function sendCrowdStrikeAlert(opts: CrowdStrikeAlertOptions): Promise<boolean> {
  if (!opts.hecUrl || !opts.apiKey) return false

  const extraFields: Record<string, string> = {}
  for (const f of opts.fields ?? []) {
    extraFields[f.name] = f.value
  }

  const event = {
    time: Math.floor(Date.now() / 1000),
    source: "honeypot-ai",
    sourcetype: "honeypot:alert",
    event: {
      severity: SEVERITY[opts.level],
      level: opts.level,
      title: opts.title,
      description: opts.description,
      src_ip: opts.srcIp ?? null,
      sensor_id: opts.sensorId ?? null,
      ...extraFields,
    },
  }

  try {
    const response = await fetch(opts.hecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) {
      logFailure(opts.hecUrl, `HEC returned ${response.status} ${response.statusText}`)
      return false
    }
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logFailure(opts.hecUrl, `delivery failed: ${msg}`)
    return false
  }
}
