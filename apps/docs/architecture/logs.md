# Logs

Brika logs everything the hub does and everything its plugins say. The implementation is a ring buffer (fast in-memory access) plus a newline-delimited JSON file (durable, easy to grep), with an SSE stream for live consumers and a retention sweep that prunes old data.

Key files:

* `apps/hub/src/runtime/logs/utils/ring-buffer.ts` — the circular buffer.
* `apps/hub/src/runtime/logs/log-router.ts` — the central `Logger` service.
* `apps/hub/src/runtime/logs/` — supporting services (retention, SSE fanout, query helpers).

## Sources

A log line has a `source`:

| Source | Origin |
|---|---|
| `hub` | The hub server itself |
| `plugin:<uid>` | A plugin process (anything written to stderr/stdout, plus structured logs via `log.*`) |
| `system` | Cross-cutting events (auth, updates, supervisor decisions) |

The plugin SDK's `log.{debug,info,warn,error}` calls land as structured JSON. Plain `console.log` from a plugin's stdout is captured too — wrapped into a log line with `level: info` and the raw text.

## Ring buffer

The most recent N log lines per source live in a fixed-capacity circular buffer in memory. When the buffer fills, the oldest entry is overwritten. The TUI's logs view, the web UI's logs panel, and the `/api/stream/logs` SSE consumer all read from this buffer for instant scrollback.

Capacity is set per source — `hub` gets more than `plugin:*` for instance — and is tuned to give a few minutes of context without unbounded memory growth.

## File persistence

Every log line is also appended to a newline-delimited JSON file in `.brika/logs/`. Files rotate daily (one file per day). Each entry has the same shape as the in-memory record:

```json
{"ts": 1700000000000, "source": "plugin:coingecko.plugin-coingecko", "level": "info", "message": "Connected", "meta": {…}}
```

This lets you `jq` historical logs without a query API.

## Retention

`hub.logs.retentionDays` in `brika.yml` controls how long log files are kept (default 7). A retention sweep runs every `hub.logs.pruneIntervalMs` (default 1 h) and deletes files older than the window. Set `retentionDays: 0` to disable retention — the file grows unbounded.

The sweep is conservative: it deletes whole files, never truncates. The ring buffer is unaffected (it's per-process and rotates by capacity, not by date).

## SSE stream

`GET /api/stream/logs` opens an SSE connection that:

1. Emits the most recent N entries from the ring buffer as a backlog.
2. Then forwards every new entry as it arrives.

Filters work server-side via query parameters (`?level=error&source=plugin:foo`). The [shared SSE pool](sse-pool.md) coalesces multiple consumers on the same URL.

## Filter pipeline

Both the SSE stream and the REST query endpoints share a small filter pipeline:

* `level` — `debug`, `info`, `warn`, `error` (filter to >= level).
* `source` — exact source match or prefix (`plugin:*`).
* `plugin` — narrow to one plugin UID.
* `search` — free-text in `message` or `meta`.
* `since` / `until` — time range.
* `limit` — cap the number of results.

The filters apply in order; the search is the most expensive (substring across stringified meta) and runs last.

## Structured fields

`log.error(message, { error })` auto-captures `error.name`, `error.message`, and `error.stack` into the meta object. The web UI renders these specially — collapsible stack traces, copy-as-text affordances.

The SDK also captures the call site from the JavaScript stack (file + line) and adds `sourceFile` / `sourceLine` to the meta. The UI uses them to render "in `src/blocks/timer.ts:42`" beside each log line.

## Performance notes

* Logs go through one shared `Logger` singleton — there's no per-source contention.
* The ring buffer is preallocated; appending is `arr[(head + 1) % cap] = entry` plus `head++`.
* The file writer batches appends over a short flush interval; an unflushed buffer is flushed on process exit (best-effort — SIGKILL drops it).
* The SSE fanout uses snapshot iteration over the subscriber set so unsubscribe-during-dispatch doesn't break.

## CLI / TUI access

There is no `brika log` subcommand in the CLI surface today (see [Commands](../cli/commands.md)) — log viewing happens in the TUI's **Logs** screen or the web UI. The SSE endpoint is also fair game for shell scripts:

```sh
curl -sN -H "Authorization: Bearer $(cat ~/.brika/cli-token)" \
  http://127.0.0.1:3001/api/stream/logs
```

## See also

* **[Logging](../plugins/logging.md)** — `log.*` author API.
* **[Hub Server](hub.md)** — overall server structure.
* **[Shared SSE Pool](sse-pool.md)** — how the live stream is shared.
