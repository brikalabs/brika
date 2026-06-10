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

### Required, defaults, and conditional fields

A config field is REQUIRED in the editor only when it is neither `.optional()`
nor `.default(...)`: defaulted fields are filled by the runtime, so the editor
never flags them. To show a field only when another field has a given value,
attach a `showWhen` condition via `.meta()`:

```ts
config: z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  body: z
    .string()
    .optional()
    .meta({ showWhen: { field: 'method', equals: ['POST', 'PUT', 'PATCH'] } })
    .describe('Request body'),
}),
```

The editor hides the field (and skips its required check) until the condition
holds; `equals` accepts a single value or an array of allowed values.

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

A handler that throws (or rejects) does not crash the block or die as an unhandled rejection: the runtime captures the error and records it in the workflow's run trace as a structured error entry, keyed to your block. Other subscribers still receive the event.

For flaky side effects (HTTP calls, device commands), the SDK ships a bounded backoff helper:

```ts
import { retry } from '@brika/sdk';

const res = await retry(() => fetch(config.url), { attempts: 3, backoffMs: 250 });
```

## Logging into the run trace

`ctx.log` is a block-scoped logger whose entries land in the workflow's RUN trace (visible in the editor's Runs panel), with an optional structured payload, unlike the global `log`, which goes to the plugin's global journal:

```ts
run: ({ inputs, outputs, log }) => {
  inputs.in.on(async (data) => {
    log.info('processing', { size: JSON.stringify(data).length });
    // ...
  });
};
```

Use it for anything a user debugging a run would want to see: per-step progress, token usage, cost. The `runBlock` test harness captures these entries on `h.logs`.

## Validation errors

When `outputs.X.emit(value)` is called with a value that does not match the output's schema, the emission is dropped and the failure is reported into the run trace (port + zod error) through the block's scoped log channel. Reasons:

* The whole purpose of typed ports is to keep type mismatches from leaking into downstream blocks. A connected block that expects `{ temp: number }` should never receive a string.
* The plugin can keep running even when one emission is malformed — better than crashing the whole process.

The same applies to inbound data: an input value that fails the port schema is dropped loudly, not silently. If you see the warning in a run, fix the producing block; the schema is the source of truth.

## What you can return

The block setup function can return:

* `void` (or nothing) — no cleanup needed.
* `() => void` — a cleanup function called when the block is stopped.
* `Promise<void>` — the runtime awaits it. Don't do this; do async work from inside subscriptions instead.

## Custom block views

By default a block has no UI of its own: the hub reads its `config` schema, generates a JSON Schema, and renders a generic form (see [Config](#config)). Zero-config blocks get that form for free and never need anything more.

When the generic form is not enough, a block can ship **its own React views**. There are two independent surfaces, each opt-in from the block's `package.json` entry:

| Surface | File | Manifest flag | Renders in |
|---|---|---|---|
| Config panel | `src/blocks/<id>.view.tsx` | `"view": true` | The block's settings panel in the workflow editor |
| Node body | `src/blocks/<id>.node.tsx` | `"nodeView": true` | The block's node on the workflow canvas |

```json
"blocks": [
  {
    "id": "timer",
    "name": "Timer",
    "category": "trigger",
    "view": true,
    "nodeView": true
  }
]
```

The filename (minus the `.view.tsx` / `.node.tsx` suffix) must match the block `id`. Each file's **default export** is the React component; a view fully owns its surface, replacing the generic form (for `.view.tsx`) or the default node label (for `.node.tsx`).

### Hooks

Views import their hooks from `@brika/sdk/block-views`. They only work inside a block view's render function.

| Hook | Returns |
|---|---|
| `useBlockConfig<T>()` | The block instance's current config, typed as `T`. |
| `useUpdateBlockConfig()` | A merge-patch updater: call `update({ field: value })` to persist a partial config change. |
| `useBlockId()` | This block instance's ID. |
| `useBlockType()` | The block's type (its manifest `id`). |
| `useBlockData<T>()` | The block's latest emitted value, typed as `T`. Use it for live previews on the node body. `undefined` until the block has emitted. |
| `useBlockVariables()` | The typed variables available from upstream event types, for building field autocompletion. |

### A config view

The config view owns the whole settings panel. Read config with `useBlockConfig<T>()`, write it with `useUpdateBlockConfig()`. The built-in `condition` block (`plugins/blocks-builtin/src/blocks/condition.view.tsx`) renders a visual rule builder:

```tsx
import { useBlockConfig, useUpdateBlockConfig } from '@brika/sdk/block-views';
import { Input, Label } from '@brika/sdk/ui-kit';

interface ConditionConfig {
  field?: string;
  operator?: string;
  value?: unknown;
}

export default function ConditionView() {
  const config = useBlockConfig<ConditionConfig>();
  const update = useUpdateBlockConfig();

  return (
    <Label className="text-xs">
      Field
      <Input
        value={config.field ?? ''}
        onChange={(e) => update({ field: e.target.value })}
        className="bg-background font-mono"
      />
    </Label>
  );
}
```

### A node-body view

The node-body view renders a compact summary on the canvas. It commonly pairs `useBlockConfig` with `useBlockData<T>()` to preview the live value flowing through the block, as the built-in `text` block does (`plugins/blocks-builtin/src/blocks/text.node.tsx`):

```tsx
import { useBlockConfig, useBlockData } from '@brika/sdk/block-views';

interface TextConfig {
  content?: string;
}

export default function TextNode() {
  const config = useBlockConfig<TextConfig>();
  const data = useBlockData<unknown>();

  return (
    <div className="space-y-1.5">
      <p className="text-foreground text-sm">{config.content ?? 'Set text in the config panel'}</p>
      {data !== undefined && (
        <code className="font-mono text-[10px]">
          {typeof data === 'object' ? JSON.stringify(data) : String(data)}
        </code>
      )}
    </div>
  );
}
```

### Views run in the host

Unlike [bricks](bricks.md), block views are **real React running in the host UI, same-origin**. That means a view can:

* `fetch()` hub APIs directly. The built-in `spark-receiver` view (`plugins/blocks-builtin/src/blocks/spark-receiver.view.tsx`) calls `fetch('/api/sparks')` and renders a dropdown grouped by plugin, replacing what used to be a hardcoded spark field on the host config panel:

  ```tsx
  useEffect(() => {
    fetch('/api/sparks')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: RegisteredSpark[]) => setSparks(Array.isArray(data) ? data : []));
  }, []);
  ```

* Call **plugin actions** via `useAction` / `useCallAction` from `@brika/sdk/ui-kit/hooks` (the same hooks pages and bricks use). The Matter `command` view drives its device picker from a `listDevices` action this way. There is **no** block-instance-scoped action hook: use the plugin's actions.

Both `@brika/sdk/block-views` and `@brika/sdk/ui-kit/hooks` are wired through the `globalThis.__brika` bridge, so they resolve to the host's instances at load time. See [Externals Rewrite](../architecture/externals-rewrite.md).

## See also

* **[Reactive Streams](reactive-streams.md)** — operators, combinators, sources.
* **[Schema Types](schema-types.md)** — `z.generic`, `z.passthrough`, `z.resolved`, `z.duration`, …
* **[Sparks](sparks.md)** — broadcast typed events across plugins.
* **[Architecture — Reactive Engine](../architecture/reactive-engine.md)** — how the stream scheduler actually works.
