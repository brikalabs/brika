# Reactive Engine

`@brika/flow` is BRIKA's reactive stream library. The author-facing API (`Flow`, `pipe`, `map`, `combine`, …) is documented in [Reactive Streams](../plugins/reactive-streams.md). This page covers the runtime — how subscriptions are scheduled, how cleanups are tracked, what happens when a block stops.

Key files:

* `packages/flow/src/types.ts` — `Flow<T>`, `Emitter<T>`, `Source<T>`, `Operator<In, Out>`.
* `packages/flow/src/flow.ts` — `FlowImpl`.
* `packages/flow/src/internal.ts` — internal helpers (operatorFlow, subscribeRaw).
* `packages/flow/src/operators.ts` — the operator implementations.
* `packages/flow/src/combinators.ts` — `combine`, `zip`, `merge`, `race`, `all`.
* `packages/sdk/src/blocks/reactive.ts` — `BlockContext`, `createEmitter`, `createFlowFromInput`.

## The mental model

A `Flow<T>` is a typed event stream with:

* Zero or more subscribers.
* An optional "latest" cache so a late subscriber via `sample` or `combine` has something to read.
* A pipeline that wraps operators around it.

A subscription is an `on(fn)` call. The subscription lives for the lifetime of the **cleanup registry** the flow was created against — typically the block's registry. When the block stops, every subscription detaches in registration order.

## Pushing

`Emitter.emit(value)` synchronously calls every subscriber. There is no microtask boundary; the call stack you see in `console.trace` shows the producer at the bottom and the subscriber at the top.

This is a deliberate simplification. The alternative — batching emissions into microtasks — would help with reentrancy patterns but adds latency and surprise. Brika's blocks are mostly chains of small operators where synchronous fanout is what you want.

## No backpressure

If a source emits faster than a subscriber processes, every event is still delivered. There is no queue, no drop, no pause. Use `throttle(ms)`, `debounce(ms)`, `sample(trigger)`, or `switchMap(fn)` to control rate.

## Cleanup registry

The `CleanupRegistry` is a stack of cleanup functions. Operations that need cleanup (sources, intervals, sockets, subscriptions) register a function with the registry; when the registry runs, every function fires in registration order.

Each block gets its own registry. When the workflow runtime calls `instance.stop()`, the registry runs and every subscription tied to the block disconnects.

Three things populate the registry:

* `source.start(emit)` returns a cleanup — registered.
* Operator `setTimeout` shims register their `clearTimeout` cleanup.
* `subscribeRaw` registers the unsubscribe cleanup.

You almost never interact with the registry directly. The block setup function's `start(…)` helper takes care of it.

## Operator implementation

Operators are functions `(source: Flow<In>) => Flow<Out>`. They wrap the source with a new flow that subscribes to it and pushes transformed values:

```ts
export function map<T, R>(fn: (value: T) => R): Operator<T, R> {
  return (source) =>
    operatorFlow(source, ({ subscribe, push }) => {
      subscribe((v) => push(fn(v)));
    });
}
```

`operatorFlow` creates a downstream flow whose lifetime is tied to the same cleanup registry as the source. The subscribe callback returns nothing; cleanup is implicit.

Timing operators (`debounce`, `delay`) receive an injected `setTimeout` shim from the runtime so tests can swap it for a controllable mock without monkey-patching globals.

## Combinators

`combine(a, b)`, `zip(a, b)`, `all(a, b)`, `merge(a, b, …)`, `race(a, b, …)` all build a new flow that subscribes to each input, accumulates state (tuples for combine/zip/all, the "won" flag for race, none for merge), and pushes the result.

The internal `createCombineFlow(flows, mode)` switches between the three tuple semantics:

* **`combineLatest`** — emit when any input fires, using the latest value from each. Begins emitting only after every input has fired at least once (initial `hasValue: false[]` gates the first emission).
* **`zip`** — push values into per-input queues; emit a tuple when every queue has at least one entry; pop one from each queue and emit again only when each refills.
* **`all`** — same as `combineLatest` but only emits once every input has fired, and then keeps the gate latched on (no further "all-emitted" check).

`merge` just subscribes to every input and forwards each emission.

`race` flips a `won` flag on the first emission; subsequent emissions from any input are dropped.

## Sources

A `Source<T>` is `{ __source: true, start(emit): cleanup }`. The block context's `start(source)` calls `source.start(emit)`, captures the cleanup, registers it.

```ts
export function interval(ms: number): Source<number> {
  return createSource((emit) => {
    let count = 0;
    const id = setInterval(() => emit(count++), ms);
    return () => clearInterval(id);
  });
}
```

The `timer(ms)` source emits `0` once after `ms` and cleans up its `setTimeout`. Users write their own sources for webhooks, sockets, file watchers — anything with a "start, emit, cleanup" shape.

## `start(value | source | factory)` overloads

```ts
start(42);             // emits 42 once on the next tick
start(interval(1000)); // emits 0,1,2,… every second
start((emit) => { … }); // ad-hoc factory — same signature as Source.start
```

Implementation lives in `createFlowFromInput`. It branches on the input type:

* If it's a function, treat it as a factory.
* If it has `__source: true`, treat it as a source and call `.start(emit)`.
* Otherwise, treat it as a literal value — schedule a one-shot emission via `setTimeoutFn(() => flow.push(value), 0)` so subscribers can attach before it fires.

## Validation at emitter

`createEmitter` wraps the output port's Zod schema. Every `emit(value)` calls `schema.safeParse(value)`. On failure, the emission is dropped and a `console.warn` lands in the plugin's stderr (which flows into the hub log stream). This is the only place where invalid data leaving a block is rejected; downstream operators trust the type.

## Why operators inject `setTimeout`

Timing operators receive a `setTimeout` from `operatorFlow`'s context so tests can pass a fake clock. In production it's the real `setTimeout`; in tests it's a manual scheduler. This is also how cleanup is wired — the injected function returns a cleanup the operator can register.

## See also

* **[Reactive Streams](../plugins/reactive-streams.md)** — author-facing reference.
* **[Reactive Blocks](../plugins/reactive-blocks.md)** — block setup ergonomics.
* **[Plugin Supervisor](plugin-supervisor.md)** — when blocks start and stop.
