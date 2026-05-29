# Reactive Streams

A `Flow<T>` is BRIKA's reactive primitive — a typed, multi-subscriber event stream. Blocks compose them with operators, combine them with combinators, and feed them with sources. Every subscription is auto-cleaned by the block lifecycle, so plugin code never has to remember to unsubscribe.

`@brika/sdk` re-exports the entire `@brika/flow` package, so everything on this page is available from `@brika/sdk`.

## The shape

```ts
interface Flow<T> {
  on(fn: (value: T) => void): void;
  to(...emitters: Emitter<T>[]): void;
  pipe<R>(...ops: Operator<…>[]): Flow<R>;
  latest(): T | undefined;
}
```

* `on(fn)` — subscribe with a side-effect callback.
* `to(emitter)` — route to one or more output emitters of the same type.
* `pipe(op1, op2, …)` — chain operators; up to five overloads typed, more allowed at runtime.
* `latest()` — synchronous read of the most-recent value (undefined if nothing has emitted yet).

`Emitter<T>` is the other half:

```ts
interface Emitter<T> {
  emit(value: T): void;
  emitAll(values: T[]): void;
}
```

You don't usually construct emitters — they're given to you as `outputs.X` on a block context. `createEmitter` exists for advanced use.

## Operators

Operators have type `(source: Flow<In>) => Flow<Out>` and chain inside `.pipe()`.

### Transform

| Operator | What it does |
|---|---|
| `map(fn)` | Apply `fn` to every value; emit the result |
| `filter(pred)` | Emit only values for which `pred(value)` is truthy |
| `tap(fn)` | Call `fn` for the side effect, pass the value through unchanged |
| `scan(fn, seed)` | Running fold — emit `acc` after applying `fn(acc, v)` to each value |

```ts
flow.pipe(
  filter((n) => n > 0),
  map((n) => n * 2),
  tap((n) => log.debug(`doubled to ${n}`)),
  scan((acc, n) => acc + n, 0)
)
```

### Timing

| Operator | What it does |
|---|---|
| `debounce(ms)` | Wait for `ms` of silence before emitting the latest value |
| `throttle(ms)` | Emit at most once per `ms` window — uses `Date.now()` for the gate |
| `delay(ms)` | Hold each emission for `ms` before forwarding |

### Control

| Operator | What it does |
|---|---|
| `take(n)` | Emit the first `n` values, then stop |
| `skip(n)` | Drop the first `n` values |
| `distinct()` | Emit only when the value differs from the previous (reference equality) |

### Advanced

| Operator | What it does |
|---|---|
| `buffer(trigger)` | Collect values into an array; emit the array each time `trigger` fires |
| `sample(trigger)` | Emit the most-recent value each time `trigger` fires |
| `switchMap(fn)` | Map each value to a `Flow<R>`; unsubscribe the previous inner flow when a new one starts |
| `flatMap(fn)` | Map each value to a `Flow<R>`; subscribe to every inner flow concurrently |

`switchMap` is the right tool for "every time the source emits, start a new long-running operation and cancel the previous one" — a debounced API call, for example. `flatMap` is `switchMap` without the cancel — every inner stream fires until exhaustion.

## Combinators

These take multiple flows and produce one. Import them from `@brika/sdk`:

| Combinator | Semantics |
|---|---|
| `combine(a, b, …)` | Emit a tuple whenever **any** input emits, using the latest from each. Begins emitting only once every input has fired at least once |
| `zip(a, b, …)` | Emit tuples lockstep — wait for each input to emit, then emit `[a, b, …]` |
| `all(a, b, …)` | Wait for every input to emit at least once, then behave like `combine` |
| `merge(a, b, …)` | Forward whichever input emitted, in order. Type must match across inputs |
| `race(a, b, …)` | First emission wins; later emissions from any input are ignored |

```ts
combine(inputs.temperature, inputs.humidity).pipe(
  map(([t, h]) => ({ comfort: 100 - Math.abs(22 - t) * 2 - Math.abs(50 - h) }))
);
```

Type overloads cover 2–4 inputs precisely; beyond that the return type widens to `Flow<unknown[]>`.

## Sources

A `Source<T>` is a factory wrapper. `source.start(emit)` runs the factory and returns a cleanup. Sources are useful as `start(…)` arguments inside block setup:

```ts
import { interval, timer } from '@brika/sdk';

start(interval(1000)).to(outputs.tick);  // 0, 1, 2, … every second
start(timer(5000)).to(outputs.fired);    // 0, once after 5s
```

Built-in sources:

| Source | Emits |
|---|---|
| `interval(ms)` | `0, 1, 2, …` every `ms` ms |
| `timer(ms)` | `0` once, after `ms` ms |

You can also build your own:

```ts
import type { Source } from '@brika/sdk';

function webhook(path: string): Source<unknown> {
  return {
    __source: true,
    start(emit) {
      const handler = (body: unknown) => emit(body);
      hub.on(`webhook:${path}`, handler);
      return () => hub.off(`webhook:${path}`, handler);
    },
  };
}
```

The cleanup function is registered with the block's cleanup registry — when the block stops, the webhook listener detaches.

## Block context `start()` — three overloads

The `start` helper on `BlockContext` lifts three things into a `Flow`:

```ts
start(value);             // emits `value` once, on the next tick
start(source);            // calls source.start(emit), wires cleanup
start(factory);           // calls factory(emit) — same as ad-hoc source
```

`factory` is `(emit: (value: T) => void) => () => void` — the same signature as `source.start`. Use it for one-off producers that don't need to be a reusable `Source`.

## Cleanup semantics

Every subscription created by a block's setup function is registered with that block's **cleanup registry**. When the workflow stops:

1. The registry runs every cleanup function in registration order.
2. Sources have their `cancel` callbacks fired (clears intervals, closes sockets, etc.).
3. Operator inner subscriptions detach.
4. The block instance is GC-eligible.

You don't have to manage this. Just don't bypass it — never store flows or subscriptions in module-level state if you want them garbage-collected per block instance.

## No backpressure

A `Flow` is a fire-and-forget event stream. If a subscriber takes 100ms to process and the source emits every 10ms, every event still hits the subscriber — handlers run sequentially per subscription but emissions are not paused. If you need backpressure-like semantics, use `throttle`, `debounce`, `sample`, or `switchMap` to control the rate.

## Type safety

Operators preserve types through five levels of `.pipe(...)` overloads. Beyond that the return widens to `Flow<unknown>` — if you find yourself there, you probably want to factor the pipeline into pieces.

Combinator inputs must match the declared types (`combine(Flow<number>, Flow<string>) → Flow<[number, string]>`). `merge` requires every input to share the same type.

## See also

* **[Reactive Blocks](reactive-blocks.md)** — using flows inside a block setup.
* **[Reactive Engine](../architecture/reactive-engine.md)** — internal scheduling, cleanup registry, microtask batching.
* **[Sparks](sparks.md)** — `subscribeSpark` returns a `Source<SparkEvent>` you can `start()` from a block.
