# Shared SSE Pool

The web UI has several long-lived SSE consumers: a log tail, a system event stream, theme changes, a per-board brick-data stream, sometimes a debug workflow stream. Without coordination, each hook opening its own `EventSource` would saturate Chrome's six-connection-per-origin cap on HTTP/1.1 in seconds. The shared SSE pool fixes this.

Key file: `apps/ui/src/lib/shared-event-source.ts`.

## The problem

Chrome (and other browsers) cap HTTP/1.1 to **6 concurrent connections per origin**. Brika's hub serves on `127.0.0.1:3001` over HTTP/1.1 by default. If each subscriber opens its own `EventSource` to `/api/stream/events`, plus the logs viewer opens one for `/api/stream/logs`, plus the board has `/api/boards/<id>/sse`, plus a workflow debug page has `/api/workflows/debug` — that's five connections, and any additional page assets (an SVG, a script) will sit waiting for a free slot. Bricks would stall for multi-second `Stalled` periods on every interaction.

## The pool

```ts
subscribeSharedEvents(url, listener) → unsubscribe
```

* **One `EventSource` per URL.** The pool keeps a map from URL to a single source plus a `Set` of subscribers.
* **Ref counted.** Subscribing increments the ref count; unsubscribing decrements it. The first subscriber opens the source; the last unsubscriber closes it.
* **Fanout per event.** When the source receives a message, the pool dispatches to every subscriber. A snapshot of the listener set is taken before iterating so a subscriber that unsubscribes mid-iteration doesn't corrupt the loop.

```ts
// Before:
const a = new EventSource('/api/stream/events');
const b = new EventSource('/api/stream/events');  // second connection
const c = new EventSource('/api/stream/events');  // third
// 3 connections, 3 slots burned

// After:
const offA = subscribeSharedEvents('/api/stream/events', handleA);
const offB = subscribeSharedEvents('/api/stream/events', handleB);
const offC = subscribeSharedEvents('/api/stream/events', handleC);
// 1 connection, 1 slot
```

## Subscriber memory of "missed" events

The pool does not buffer events. A subscriber that mounts after an event was dispatched will not receive it. For state that must survive remounts, the hub should expose a snapshot endpoint (or include the relevant data in the initial `GET` for the resource) — every SSE consumer in Brika does this.

## Per-URL vs per-event

Some SSE streams multiplex many event types over one URL (`/api/stream/events` carries `theme.change`, `plugin.health`, `workflow.event`, …). The pool subscribes to the connection; consumers filter events by name client-side. Useful: subscribing to a specific type does not require a new connection.

## What this looks like in code

```ts
// instead of:
const es = new EventSource('/api/stream/events');
es.addEventListener('plugin.health', (e) => {...});
return () => es.close();

// do:
return subscribeSharedEvents('/api/stream/events', (e) => {
  if (e.type === 'plugin.health') {...}
});
```

The hook returns the unsubscribe function — pair it with `useEffect`.

## Memory note from project history

The project's auto-memory carries a fact: never construct `new EventSource()` directly in this codebase. The shared pool exists because we previously hit multi-second `Stalled` delays on routine UI interactions when each hook opened its own stream. The fix is structural — there is no reason to create your own `EventSource` outside the pool.

## Remote access caveat

When the hub is reached over the WebRTC tunnel (remote access), the transport is no longer HTTP/1.1 — it's a data channel. The 6-connection cap does not apply. The pool is still beneficial (one source per URL means less server-side fanout work) but the pressure is lower.

## See also

* **[Hub Server](hub.md)** — the SSE endpoints.
* **[Brick Rendering](brick-rendering.md)** — `useBrickData` uses the pool.
* **[Remote Access](remote-access.md)** — the WebRTC alternative transport.
