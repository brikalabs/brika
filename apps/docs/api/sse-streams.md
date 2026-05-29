# SSE Streams

The hub serves several long-lived Server-Sent Event streams. Browsers should use the [shared event source pool](../architecture/sse-pool.md) to consume them — multiple subscribers per URL fan out from one connection.

External clients can consume them with `curl -N`, `EventSource` (browser), or any HTTP/1.1-compatible reader that respects `text/event-stream`.

## Wire format

Standard SSE — newline-delimited frames:

```
event: <type>
data: <json>

event: <type>
data: <json>
```

Each frame ends with a blank line. The server may also send `: comment` lines as keepalives.

All streams require authentication.

## `GET /api/stream/logs`

Live log tail. Backlogs from the in-memory ring buffer, then forwards new entries.

| Query param | Description |
|---|---|
| `level` | Minimum level (`debug`, `info`, `warn`, `error`) |
| `source` | Source prefix (`plugin:*`, `hub`, `system`) |
| `plugin` | Narrow to one plugin UID |
| `search` | Free-text search in `message` and `meta` |
| `limit` | Cap the backlog count |

Frames:

```
event: log
data: {"ts":1700000000000,"source":"plugin:foo","level":"info","message":"Connected","meta":{…}}
```

## `GET /api/stream/events`

System-wide event bus — plugin health changes, board updates, theme changes, system notices. Multiplexes many event types over one connection. Filter client-side.

Frames:

```
event: plugin.health
data: {"uid":"timer.plugin-timer","health":"running"}

event: theme.change
data: {"id":"midnight"}

event: workflow.event
data: {"workflowId":"wf-1","kind":"started"}
```

The exact event types and their payloads are defined in `apps/hub/src/runtime/events/` and evolve. Subscribe to the event types you care about; ignore the rest.

## `GET /api/workflows/:id/events`

Per-workflow stream. Useful for debugging a specific workflow.

Frames:

```
event: block.input
data: {"workflowId":"wf-1","blockId":"trigger-1","port":"trigger","data":null}

event: block.output
data: {"workflowId":"wf-1","blockId":"price-1","port":"usd","data":95234.12}

event: block.error
data: {"workflowId":"wf-1","blockId":"price-1","error":"Network timeout"}
```

## `GET /api/workflows/debug`

Global debug stream — every running workflow's events. Same frames as the per-workflow stream but spanning every workflow. Useful for the **Workflows → Debug** view.

## `GET /api/boards/:id/sse`

Per-board brick data updates. The hub fans out every `setBrickData(brickTypeId, data)` payload for brick types currently on this board.

Frames:

```
event: brick.data
data: {"brickTypeId":"current-weather","data":{"city":"Zurich","tempC":22}}
```

The browser host wraps this in the [`useBrickData` hook](../plugins/bricks.md).

## `GET /api/i18n/events`

Translation registry change events. Used by the i18n-dev overlay to HMR translations during development.

Frames:

```
event: i18n.update
data: {"locale":"fr","namespace":"plugin-foo"}
```

## Reconnection

SSE clients should reconnect automatically on disconnect. The browser's built-in `EventSource` reconnects with a small backoff. The pool wraps a single `EventSource` per URL, so reconnect logic lives in one place.

No `Last-Event-ID` replay is implemented — a client that reconnects after a gap will miss events that fired during the gap. For state that must survive remounts, fetch the snapshot via the matching REST endpoint at mount time.

## Consuming from a script

```sh
curl -sN -H "Authorization: Bearer $(cat ~/.brika/cli-token)" \
  http://127.0.0.1:3001/api/stream/logs
```

`-N` disables buffering so frames arrive in real time.

## See also

* **[Shared SSE Pool](../architecture/sse-pool.md)** — the browser-side pool.
* **[Logs](../architecture/logs.md)** — ring buffer + fanout internals.
* **[REST Reference](rest-reference.md)** — companion REST endpoints.
