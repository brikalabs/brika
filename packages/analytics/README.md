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

### Remote forwarding to an external platform (opt-in, off by default)

Forwarding requires **both** an opt-in flag and a configured destination, so a
fork never phones home by accident and the destination is greppable:

- `BRIKA_TELEMETRY_EVENTS=1` — operator opts in.
- `BRIKA_ANALYTICS_PROVIDER` — destination, one of:

  | Provider   | Required env                                              | Endpoint                          |
  | ---------- | --------------------------------------------------------- | --------------------------------- |
  | `webhook`* | `BRIKA_TELEMETRY_URL`                                     | your URL — posts `{ events: [] }` |
  | `posthog`  | `BRIKA_ANALYTICS_POSTHOG_KEY` (+ `…_POSTHOG_HOST`)        | `{host}/batch/`                   |
  | `mixpanel` | `BRIKA_ANALYTICS_MIXPANEL_TOKEN`                          | `api.mixpanel.com/track`          |
  | `segment`  | `BRIKA_ANALYTICS_SEGMENT_WRITE_KEY`                       | `api.segment.io/v1/batch`         |

  *`webhook` is the default.

**Free, hosted, no self-host:** PostHog Cloud has a free tier (~1M events/mo).
Create a project, copy its Project API key, then:

```bash
BRIKA_TELEMETRY_EVENTS=1
BRIKA_ANALYTICS_PROVIDER=posthog
BRIKA_ANALYTICS_POSTHOG_KEY=phc_xxx
# US is the default; EU projects set:
# BRIKA_ANALYTICS_POSTHOG_HOST=https://eu.i.posthog.com
```

(For zero external services at all, just leave forwarding off — the built-in
`/analytics` dashboard is free and fully local.)

Adapters live in `providers.ts` (pure `buildRequest()` mappers). Batches are
fire-and-forget; string prop values are path-redacted before they leave the
host.

**Identity:** the anonymous device id (`distinctId`) is sent as the platform's
distinct/anonymous id. The authenticated `userId` is attached **only** when
`BRIKA_ANALYTICS_IDENTIFY=1` — installs stay anonymous by default.

### Retention (`brika.yml`)

```yaml
hub:
  analytics:
    retentionDays: 90        # 0 disables (events grow unbounded)
    pruneIntervalMs: 3600000 # sweep interval
```
