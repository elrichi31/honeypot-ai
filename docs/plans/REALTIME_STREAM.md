# Real-time SSE stream — three live features

Extends the existing `/events/live` SSE endpoint to carry three event types
(`attack`, `alert`, `sensor-heartbeat`) and surfaces them in the dashboard UI.

## Motivation

The ingest-api already had an in-memory EventEmitter and an SSE route that only
emitted `attack` events for the live map. Two other high-value signals were
available but not streamed: alert creation and sensor heartbeats.

---

## Architecture

```
ingest-api eventBus (EventEmitter)
  ├─ 'attack'            → routes/ingest.ts, routes/protocol.ts, routes/web.ts, routes/suricata.ts
  ├─ 'alert'             → lib/threat-alerts.ts  (persistAlert, after prisma.alert.create)
  └─ 'sensor-heartbeat'  → routes/sensors.ts     (handleHeartbeat, after DB upsert)

GET /events/live  (routes/live.ts)
  subscribes to all three, writes JSON SSE lines

Dashboard Next.js proxy  (app/api/events/live/route.ts)
  passes stream through, auth-gated (viewer+)

hooks/use-live-stream.ts   — shared EventSource hook for sidebar features
  routes events by .type field to onAttack / onAlert / onSensorHeartbeat
```

The live-attack-map keeps its own EventSource (unchanged) because it manages
complex per-component state. `useLiveStream` is for lightweight consumers that
only need one or two event types.

---

## Features shipped — 2026-06-22

### 1. Live attack counter badge (sidebar)
- **File:** `components/live-attack-badge.tsx`
- **Mounted in:** `components/app-sidebar.tsx` next to "HoneyTrap" title
- Counts attack events in a 60-second rolling window.
- Badge hides when count is 0. Shows "99+" above 99.
- Prunes stale timestamps every 5 s.

### 2. Real-time alert bell + toast
- **File:** `components/alerts/alerts-bell.tsx` (full rewrite)
- Fetches initial unread count from `/api/alerts?limit=1` on mount.
- `useLiveStream.onAlert` bumps the badge counter and fires a `sonner` toast
  (warning level, 6 s duration, includes `srcIp` if present).
- Clicking the bell navigates to `/alerts`.

### 3. Sensor live-dot override
- **Files:** `components/sensors/sensor-live-context.tsx`, `sensors-live-wrapper.tsx`
- `SensorsLiveWrapper` wraps the sensor grid in `/sensors` page; provides `SensorLiveContext`.
- When a `sensor-heartbeat` SSE event arrives, the sensorId is recorded in a Set.
- `SensorHeader` reads `isLive(sensor.sensorId)` — if true, overrides `sensor.online=false`
  from the DB snapshot so the badge shows green immediately without a page reload.

---

## Files changed

| File | Change |
|------|--------|
| `apps/ingest-api/src/lib/event-bus.ts` | Added `AlertEvent`, `SensorHeartbeatEvent`, `LiveEvent` types |
| `apps/ingest-api/src/lib/threat-alerts.ts` | Emit `alert` event after `prisma.alert.create` |
| `apps/ingest-api/src/routes/sensors.ts` | Emit `sensor-heartbeat` event after heartbeat upsert |
| `apps/ingest-api/src/routes/live.ts` | Subscribe to all three event types; rewritten |
| `apps/dashboard/hooks/use-live-stream.ts` | New — shared SSE hook |
| `apps/dashboard/components/live-attack-badge.tsx` | New — 60 s rolling attack counter |
| `apps/dashboard/components/alerts/alerts-bell.tsx` | Rewritten with SSE + toast |
| `apps/dashboard/components/sensors/sensor-live-context.tsx` | New — live heartbeat context |
| `apps/dashboard/components/sensors/sensors-live-wrapper.tsx` | New — thin client wrapper |
| `apps/dashboard/components/sensors/sensor-header.tsx` | Use `effectiveOnline` via context |
| `apps/dashboard/components/app-sidebar.tsx` | Mount `LiveAttackBadge` |
| `apps/dashboard/app/sensors/page.tsx` | Wrap grid in `SensorsLiveWrapper` |

---

## What's left / possible next steps

- [ ] Mark alert as read when user clicks toast (call `/api/alerts/:id/read`)
- [ ] Persist unread count server-side per user (currently client-only bump)
- [ ] Extend live map page to use `useLiveStream` instead of its own EventSource
      (low priority — the map needs full state so the current approach is fine)
