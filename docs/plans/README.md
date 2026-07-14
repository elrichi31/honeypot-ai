# Plans

Implementation plans and roadmaps for honeypot-ai. One file per initiative.
Each plan is the source of truth for its feature. Keep it updated as work progresses.

## Active plans

- [SENSOR_REMOTE_CONTROL.md](SENSOR_REMOTE_CONTROL.md) - WebSocket control plane for sensors: remote config, acknowledged commands, live status, fallback, security, audit trail, and rollout.
- [MULTI_TENANT_ROADMAP.md](MULTI_TENANT_ROADMAP.md) - Complete multi-tenant rollout: endpoint inventory, scope pattern, implementation order, and verification data.
- [CLIENT_REPORTS_PDF.md](CLIENT_REPORTS_PDF.md) - Client reporting. On-demand download is implemented; scheduled generation remains.
- [IOCS_PAGE.md](IOCS_PAGE.md) - Global threat-intelligence page. E2E verification, malware `period`, and IP-hash-family correlation remain.
- [REALTIME_STREAM.md](REALTIME_STREAM.md) - SSE alerts and heartbeat. Mark-read toast action, server-side unread count, and live-map consolidation remain.
- [PLAN_DECEPTION.md](PLAN_DECEPTION.md) - Deception network. Track C is implemented through `INTERNAL_SENSORS` in `done/`; Tracks A and B remain.
- [CICD.md](CICD.md) - CI/CD pipeline and VPS deployment. Environment examples, post-deploy smoke tests, and auxiliary-service coverage remain.
- [CLIENT_DECEPTION_TAB.md](CLIENT_DECEPTION_TAB.md) - Client Deception tab. Live alerts and stream integration, i18n completion, and component tests remain.
- [SENSOR_IDENTITY.md](SENSOR_IDENTITY.md) - Unique sensor IDs and Application/Client ownership. Production E2E verification remains.
- [PERF_AUDIT.md](PERF_AUDIT.md) - Code-level work, M3, and the composite `sessions` index are implemented. Production observation is needed before deciding A2/D2.
- [DASHBOARD_FIRST_LOAD.md](DASHBOARD_FIRST_LOAD.md) - Phases 0-3 are implemented. Production observation of pool behavior, warm-up, and retries remains.
- [DOCS.md](DOCS.md) - Documentation-site structure and maintenance rule: features ship with matching documentation.

## Completed plans -> [done/](done/)

Plans with no open tasks are archived in [`done/`](done/README.md).

## Conventions

- New plan? Add a file here and a one-line entry to this index.
- **Update the plan when you ship.** Record what was done, what is left, and the relevant commit.
- UI strings: **English first**. Spanish belongs in `apps/dashboard/lib/i18n/`, never hardcoded in components.
