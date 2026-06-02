# Brika Analytics (Feature-Usage Capture)

Capture "feature X was used" events from anywhere in the stack — the hub, a
plugin, the UI, or the CLI — and store them locally, with **opt-in** remote
forwarding. A deliberate sibling of the logging system (`../logs`): same
batched-write hot path, same retention sweep, same graceful-degradation stance.

```
analytics/
├── analytics.ts     # Analytics service (DI singleton) + ScopedAnalytics
├── event-store.ts   # EventStore — SQLite persistence (events table)
├── forwarder.ts     # EventForwarder — opt-in, batched remote POST
├── schema.ts        # Drizzle `events` table
├── database.ts      # events.db definition
├── migrations/      # 0000_init_events
└── types.ts         # CaptureEvent, CaptureSource
```

## Capturing events

### Hub (DI)

```typescript
import { inject } from '@brika/di';
import { Analytics } from '@/runtime/analytics/analytics';

inject(Analytics).capture('workflow.created', { blockCount: 3 });

// Or scope a source once (like Logger.withSource):
const analytics = inject(Analytics).withSource('hub');
analytics.capture('hub.started');
```

### Plugins (SDK)

```typescript
import { capture } from '@brika/sdk';

capture('timer.started', { durationMs: 5000 });
```

Flows over IPC (`capture` message) → `PluginEventHandler.onPluginCapture` →
`Analytics.capture(..., { source: 'plugin', pluginName })`.

### UI (React)

```tsx
import { useCapture } from '@/features/analytics';

const capture = useCapture();
<Button onClick={() => capture('board.created', { columns })} />;
```

Posts to `POST /api/analytics/capture` with an anonymous per-tab session id.

## HTTP API

| Method | Path                       | Purpose                              |
| ------ | -------------------------- | ------------------------------------ |
| POST   | `/api/analytics/capture`   | Record a UI event                    |
| GET    | `/api/analytics`           | Query stored events (filters/paging) |
| GET    | `/api/analytics/recent`    | In-memory recent events (ring)       |
| GET    | `/api/analytics/names`     | Distinct event names + counts        |
| GET    | `/api/analytics/stats`     | Totals + remote-forwarding status    |
| DELETE | `/api/analytics`           | Clear events (optional filters)      |

## Configuration

### Remote forwarding (opt-in, off by default)

Two keys must both be set, mirroring update telemetry — so a fork never phones
home by accident and the endpoint is greppable in the binary:

- `BRIKA_TELEMETRY_EVENTS=1` — operator opts in.
- `BRIKA_TELEMETRY_URL=https://…` — endpoint baked into the build.

Forwarded payloads carry the anonymous `instanceId`, event name, source,
plugin name, and path-redacted props. Batched (size/time) and fire-and-forget.

### Retention (`brika.yml`)

```yaml
hub:
  analytics:
    retentionDays: 90        # 0 disables (events grow unbounded)
    pruneIntervalMs: 3600000 # sweep interval
```
