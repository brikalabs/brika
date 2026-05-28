# Reactive Blocks

A block is a reactive workflow node. You define one with `defineReactiveBlock`, providing:

* Inputs and outputs as **Zod-typed ports**.
* A **config schema** the user fills in when they place the block on a workflow.
* A **setup function** that wires inputs to outputs using stream operators.

The runtime calls the setup function once per block instance (per workflow). Subscriptions inside it are tracked and auto-cleaned when the workflow stops or the plugin restarts.

## Anatomy

```ts
import { defineReactiveBlock, input, output, z } from '@brika/sdk';

export const greet = defineReactiveBlock(
  {
    id: 'greet',
    inputs: {
      trigger: input(z.generic(), { name: 'Trigger' }),
    },
    outputs: {
      message: output(z.string(), { name: 'Message' }),
    },
    config: z.object({
      name: z.string().default('World'),
    }),
  },
  ({ inputs, outputs, config }) => {
    inputs.trigger.on(() => {
      outputs.message.emit(`Hello, ${config.name}!`);
    });
  }
);
```

`defineReactiveBlock` returns a `CompiledReactiveBlock`. Export it from the plugin's main module. The hub will reach it via IPC when the workflow runtime needs an instance.

## Ports

`input(schema, meta)` and `output(schema, meta)` build typed port definitions. Both take:

| Argument | Description |
|---|---|
| `schema` | A Zod schema (`z.string()`, `z.object(...)`, …) or one of the BRIKA special types: `z.generic()`, `z.passthrough(srcPortId)`, `z.resolved(source, configField)` |
| `meta` | `{ name, description? }` — display info for the workflow editor |

Output emitters validate every emission against the schema. **Invalid values are dropped with a console warning**, not propagated downstream. This protects connected blocks from type mismatches at the cost of silent failures — keep an eye on the logs while developing.

See [Schema Types](schema-types.md) for the full set of port schemas (including `z.duration`, `z.color`, `z.expression`, …).

## The setup function

The second argument is the **setup function**. It receives a `BlockContext`:

```ts
({
  blockId,        // string — this instance's ID
  workflowId,     // string — owning workflow's ID
  inputs,         // typed Flow per input port
  outputs,        // typed Emitter per output port
  config,         // z.infer<typeof yourConfigSchema>
  start,          // helper to lift a value/source/factory into a Flow
  context,        // self-reference, for ergonomics
}) => { … }
```

The function runs once when the workflow starts the block. **Any reactive wiring belongs here.** Use `inputs.X.on(fn)`, `inputs.X.pipe(...).to(outputs.Y)`, or `start(source).pipe(...).to(outputs.Y)` — every subscription is registered with a cleanup registry that fires on stop.

Returning a cleanup function (`() => void`) is optional but recommended if you create resources `setup` itself owns (timers, sockets, subscriptions outside the flow graph):

```ts
({ inputs, outputs, config }) => {
  let id: ReturnType<typeof setInterval> | null = null;

  inputs.trigger.on(() => {
    if (id) clearInterval(id);
    id = setInterval(() => outputs.tick.emit(Date.now()), config.intervalMs);
  });

  return () => {
    if (id) clearInterval(id);
  };
}
```

The cleanup function runs when the workflow stops or the block is removed.

## Block categories

The `category` field in the [manifest](manifest.md) drives where the block shows up in the workflow sidebar. The conventions:

| Category | Use for |
|---|---|
| `trigger` | Things that emit without an input — clocks, webhooks, motion sensors |
| `action` | Things that consume input and have side effects — HTTP calls, notifications, device commands |
| `flow` | Branching / merging — `condition`, `switch`, `delay`, `end` |
| `transform` | Pure data transforms — `map`, `filter`, `format` |

The category is metadata; the runtime treats every block the same way.

## Config

The `config` field of the spec is a Zod **object** schema. The hub:

1. Reads the schema, generates a JSON Schema, and uses it to render the block's config UI.
2. Validates the user's values when the workflow is saved.
3. Passes the validated config to your setup function — fully typed via `z.infer`.

```ts
config: z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
  retries: z.number().int().min(0).max(10).default(3),
});
```

In the setup function, `config.method` is typed as `'GET' | 'POST' | 'PUT' | 'DELETE'`, etc.

For BRIKA-specific config fields (durations, colours, expressions, code editors), use the [custom z module](schema-types.md):

```ts
config: z.object({
  duration: z.duration(undefined, 'How long to wait'),
  colour: z.color(),
  expr: z.expression(),
});
```

## Multiple inputs

Multiple inputs become multiple `Flow`s on `inputs`. Combine them with the combinators from [Reactive Streams](reactive-streams.md):

```ts
import { defineReactiveBlock, input, output, combine, map, z } from '@brika/sdk';

export const comfort = defineReactiveBlock(
  {
    id: 'comfort',
    inputs: {
      temperature: input(z.number(), { name: 'Temperature' }),
      humidity: input(z.number(), { name: 'Humidity' }),
    },
    outputs: {
      score: output(z.number(), { name: 'Score' }),
    },
    config: z.object({}),
  },
  ({ inputs, outputs }) => {
    combine(inputs.temperature, inputs.humidity)
      .pipe(map(([t, h]) => 100 - Math.abs(22 - t) * 2 - Math.abs(50 - h) * 0.5))
      .to(outputs.score);
  }
);
```

`combine` emits whenever **any** input fires, using the latest value from each. `zip` emits only when **every** input has fired in lockstep. `all` waits for each to fire at least once and then behaves like `combine`. See [Reactive Streams](reactive-streams.md) for all the variants.

## Triggers — blocks with no inputs

Triggers are blocks that emit on their own — clocks, schedules, file watchers, webhook listeners. Use a `Source` plus `start()`:

```ts
import { defineReactiveBlock, output, interval, z } from '@brika/sdk';

export const clock = defineReactiveBlock(
  {
    id: 'clock',
    inputs: {},
    outputs: {
      tick: output(z.number(), { name: 'Tick' }),
    },
    config: z.object({
      intervalMs: z.duration(1000, 'Interval'),
    }),
  },
  ({ outputs, config, start }) => {
    start(interval(config.intervalMs)).to(outputs.tick);
  }
);
```

`start(value)`, `start(source)`, and `start(factory)` all lift a value or producer into a `Flow` whose subscription is tracked by the cleanup registry — when the workflow stops, the underlying timer/socket/subscription is torn down automatically.

## Async work

Setup is not async. If you need to do async work, call it from inside a subscription handler:

```ts
inputs.trigger.on(async () => {
  const res = await fetch(config.url);
  outputs.body.emit(await res.text());
});
```

Awaits inside `.on()` are fire-and-forget. There is no backpressure — if the upstream emits faster than your handler can process, every event is still delivered. Use `throttle`, `debounce`, or `switchMap` to control that — see [Reactive Streams](reactive-streams.md).

## Validation errors

When `outputs.X.emit(value)` is called with a value that does not match the output's schema, the emission is silently dropped and a warning is logged. Reasons:

* The whole purpose of typed ports is to keep type mismatches from leaking into downstream blocks. A connected block that expects `{ temp: number }` should never receive a string.
* The plugin can keep running even when one emission is malformed — better than crashing the whole process.

If you see the warning, fix the producing block; the schema is the source of truth.

## What you can return

The block setup function can return:

* `void` (or nothing) — no cleanup needed.
* `() => void` — a cleanup function called when the block is stopped.
* `Promise<void>` — the runtime awaits it. Don't do this; do async work from inside subscriptions instead.

## See also

* **[Reactive Streams](reactive-streams.md)** — operators, combinators, sources.
* **[Schema Types](schema-types.md)** — `z.generic`, `z.passthrough`, `z.resolved`, `z.duration`, …
* **[Sparks](sparks.md)** — broadcast typed events across plugins.
* **[Architecture — Reactive Engine](../architecture/reactive-engine.md)** — how the stream scheduler actually works.
