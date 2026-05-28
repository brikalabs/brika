# Logging

`log` is the SDK's structured logger. Every call lands in the hub's log stream alongside hub-emitted lines, viewable in the **Logs** TUI/UI panel and via the `/api/stream/logs` SSE endpoint.

```ts
import { log } from '@brika/sdk';

log.debug('Polling started', { intervalMs: 5000 });
log.info('Connected', { endpoint: 'https://api.example.com' });
log.warn('Retry attempt failed', { attempt: 2, error });
log.error('Failed to connect', { error: err });
```

## Levels

| Level | Use for |
|---|---|
| `debug` | Verbose tracing — usually filtered out in production |
| `info` | Routine events you'd want to see in normal operation |
| `warn` | Recoverable problems, deprecations |
| `error` | Failures that prevented something from completing |

The hub records every level; the UI/TUI lets users filter.

## Metadata

The second argument is an object of structured fields. It's preserved as JSON alongside the message — searchable, queryable, useful for debugging:

```ts
log.info('Block emitted', { port: 'temperature', value: 22.4 });
```

For `log.error`, if the metadata includes an `error` field that is an `Error` instance, the logger auto-captures `name`, `message`, and `stack`:

```ts
try {
  await call();
} catch (e) {
  log.error('API call failed', { error: e, endpoint: '/devices' });
  // Logged with errorName, errorMessage, errorStack expanded
}
```

## Call-site capture

Every log call captures the source file and line number from the stack trace. The UI displays these so you can jump from a log entry to the file that emitted it. There is no opt-out — the cost is one stack-trace parse per call.

## In bricks?

`log` doesn't exist in bricks. Bricks log to the browser console (`console.log`). If you need server-side logging from a brick-driven event, route it through an [action](actions.md) or [HTTP route](routes.md) that calls `log.*` on the plugin side.

## Persistence and retention

Logs are persisted to `.brika/logs/` as newline-delimited JSON. The retention policy (`hub.logs.retentionDays` in `brika.yml`) deletes files older than the configured window — defaults to 7 days. See [Logs](../architecture/logs.md) for the ring-buffer + retention implementation.

## See also

* **[Logs](../architecture/logs.md)** — ring buffer, retention, SSE stream.
* **[Lifecycle](lifecycle.md)** — log from `onInit` / `onStop` to mark transitions.
