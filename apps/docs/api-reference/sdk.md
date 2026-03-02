# SDK Reference

Complete API reference for the `@brika/sdk` package.

## Installation

```bash
bun add @brika/sdk
```

## Quick Start

```typescript
import {
  defineReactiveBlock,
  input,
  output,
  combine,
  map,
  log,
  onStop,
  z,
} from "@brika/sdk";

export const myBlock = defineReactiveBlock(
  {
    id: "my-block",
    inputs: {
      temperature: input(z.number(), { name: "Temperature" }),
      humidity: input(z.number(), { name: "Humidity" }),
    },
    outputs: {
      comfort: output(z.object({ score: z.number() }), { name: "Comfort" }),
    },
    config: z.object({
      threshold: z.number().default(25),
    }),
  },
  ({ inputs, outputs, config }) => {
    combine(inputs.temperature, inputs.humidity)
      .pipe(map(([t, h]) => ({ score: (t + h) / 2 })))
      .to(outputs.comfort);
  }
);

onStop(() => log.info("Plugin stopping"));
log.info("Plugin loaded");
```

---

## Block Definition

### defineReactiveBlock

Creates a reactive block with typed inputs, outputs, and configuration.

```typescript
function defineReactiveBlock<TInputs, TOutputs, TConfig>(
  spec: ReactiveBlockSpec<TInputs, TOutputs, TConfig>,
  setup: BlockSetup<TInputs, TOutputs, TConfig>
): CompiledReactiveBlock
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `spec` | `ReactiveBlockSpec` | Block specification with id, ports, and config |
| `setup` | `BlockSetup` | Setup function called when block starts |

**Returns:** `CompiledReactiveBlock` - A compiled block that can be executed by workflows.

#### ReactiveBlockSpec

```typescript
interface ReactiveBlockSpec<TInputs, TOutputs, TConfig> {
  id: string;                    // Unique block ID (matches package.json)
  name?: string;                 // Display name (optional, can use package.json)
  description?: string;          // Description (optional)
  category?: string;             // Category: "trigger" | "action" | "flow" | "transform"
  icon?: string;                 // Lucide icon name
  color?: string;                // Hex color (e.g., "#3b82f6")
  inputs: TInputs;               // Input port definitions
  outputs: TOutputs;             // Output port definitions
  config: TConfig;               // Zod configuration schema
}
```

#### BlockContext

The setup function receives a context object:

```typescript
interface BlockContext<TInputs, TOutputs, TConfig> {
  blockId: string;               // Block instance ID
  workflowId: string;            // Parent workflow ID
  inputs: InputFlows<TInputs>;   // Typed input flows
  outputs: OutputEmitters<TOutputs>; // Typed output emitters
  config: z.infer<TConfig>;      // Parsed configuration
  start<T>(source: Source<T>): Flow<T>; // Start a source flow
}
```

> **Note:** Use the global `log` import for logging within blocks.

**Example:**

```typescript
export const temperatureAlert = defineReactiveBlock(
  {
    id: "temperature-alert",
    inputs: {
      temperature: input(z.number(), { name: "Temperature °C" }),
    },
    outputs: {
      alert: output(z.string(), { name: "Alert" }),
      normal: output(z.number(), { name: "Normal" }),
    },
    config: z.object({
      maxTemp: z.number().default(30).describe("Max temperature threshold"),
    }),
  },
  ({ inputs, outputs, config }) => {
    inputs.temperature.on((temp) => {
      if (temp > config.maxTemp) {
        log.warn(`High temperature: ${temp}°C`);
        outputs.alert.emit(`Temperature ${temp}°C exceeds ${config.maxTemp}°C`);
      } else {
        outputs.normal.emit(temp);
      }
    });
  }
);
```

---

### input

Creates a typed input port definition.

```typescript
function input<T>(schema: T, meta: PortMeta): InputDef<T>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `schema` | `ZodType \| GenericRef` | Zod schema or `z.generic()` |
| `meta` | `PortMeta` | Port metadata with name and description |

**PortMeta:**

```typescript
interface PortMeta {
  name: string;          // Display name
  description?: string;  // Tooltip description
}
```

**Examples:**

```typescript
// Typed input
temperature: input(z.number(), { name: "Temperature °C" })

// Object input
settings: input(z.object({ min: z.number(), max: z.number() }), { name: "Settings" })

// Generic input (accepts any type)
trigger: input(z.generic(), { name: "Trigger" })
```

---

### output

Creates a typed output port definition.

```typescript
function output<T>(schema: T, meta: PortMeta): OutputDef<T>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `schema` | `ZodType \| PassthroughRef \| GenericRef` | Zod schema, passthrough, or generic |
| `meta` | `PortMeta` | Port metadata with name and description |

**Examples:**

```typescript
// Typed output
result: output(z.string(), { name: "Result" })

// Passthrough (inherits type from input)
out: output(z.passthrough("in"), { name: "Output" })

// Generic output
data: output(z.generic(), { name: "Data" })
```

---

## Schema Types

Import the custom `z` module for type-safe schemas:

```typescript
import { z } from "@brika/sdk";
```

### Standard Zod Types

All standard Zod types are available:

```typescript
z.string()
z.number()
z.boolean()
z.array(z.string())
z.object({ key: z.string() })
z.enum(["a", "b", "c"])
z.optional(z.string())
z.union([z.string(), z.number()])
z.record(z.string(), z.number())
z.tuple([z.string(), z.number()])
```

### BRIKA Custom Types

#### z.generic()

Accepts any type. Type is inferred from connections in the UI.

```typescript
input(z.generic(), { name: "Any Input" })
```

#### z.passthrough(inputId)

Output inherits type from the specified input port.

```typescript
inputs: {
  in: input(z.number(), { name: "Input" }),
},
outputs: {
  out: output(z.passthrough("in"), { name: "Output" }), // Same type as 'in'
}
```

#### z.duration(options?, description?)

Duration in milliseconds. UI renders a duration picker with unit selector.

```typescript
z.duration(undefined, "Wait duration")
z.duration({ min: 100, max: 60000 }, "Timeout")
z.duration(undefined, "Interval").default(1000)
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `min` | `number` | Minimum value in ms |
| `max` | `number` | Maximum value in ms |

#### z.color(description?)

Hex color value. UI renders a color picker.

```typescript
z.color("LED color")
```

**Returns:** Hex string (e.g., `#ff5500`)

#### z.code(language, description?)

Code snippet. UI renders a code editor with syntax highlighting.

```typescript
z.code("javascript", "Script to execute")
z.code("json", "JSON configuration")
```

**Supported languages:** javascript, typescript, json, html, css, sql, yaml, markdown

#### z.secret(description?)

Secret value (password, API key). UI renders a masked input.

```typescript
z.secret("API key")
```

#### z.expression(description?)

Expression with variable interpolation. UI provides autocomplete.

```typescript
z.expression("Dynamic value")
```

#### z.filePath(description?)

File path. UI renders a file picker.

```typescript
z.filePath("Config file path")
```

#### z.url(description?)

URL with validation. UI renders a URL input.

```typescript
z.url("Webhook URL")
```

#### z.sparkType(description?)

Reference to a spark type. UI renders a spark picker dropdown.

```typescript
z.sparkType("Spark type to listen for")
```

---

## Reactive Operators

### Transform Operators

#### map

Transform each value.

```typescript
import { map } from "@brika/sdk";

inputs.celsius
  .pipe(map((c) => c * 1.8 + 32))
  .to(outputs.fahrenheit);
```

#### filter

Only emit values that pass the predicate.

```typescript
import { filter } from "@brika/sdk";

inputs.temperature
  .pipe(filter((t) => t > 25))
  .to(outputs.hot);
```

#### tap

Side effect without transforming.

```typescript
import { tap } from "@brika/sdk";

inputs.value
  .pipe(tap((v) => log.debug(`Got value: ${v}`)))
  .to(outputs.result);
```

#### scan

Accumulate values like reduce.

```typescript
import { scan } from "@brika/sdk";

inputs.value
  .pipe(scan((acc, v) => acc + v, 0))
  .to(outputs.total);
```

### Timing Operators

#### delay

Delay each emission by ms.

```typescript
import { delay } from "@brika/sdk";

inputs.trigger.pipe(delay(1000)).to(outputs.delayed);
```

#### debounce

Wait for silence before emitting.

```typescript
import { debounce } from "@brika/sdk";

inputs.search.pipe(debounce(300)).to(outputs.query);
```

#### throttle

Rate limit emissions.

```typescript
import { throttle } from "@brika/sdk";

inputs.sensor.pipe(throttle(100)).to(outputs.sampled);
```

### Control Operators

#### take

Take first N values.

```typescript
import { take } from "@brika/sdk";

inputs.value.pipe(take(5)).to(outputs.first5);
```

#### skip

Skip first N values.

```typescript
import { skip } from "@brika/sdk";

inputs.value.pipe(skip(2)).to(outputs.afterFirst2);
```

#### distinct

Only emit when value changes.

```typescript
import { distinct } from "@brika/sdk";

inputs.value.pipe(distinct()).to(outputs.changed);
```

### Combinators

#### combine

Combine latest values from multiple flows.

```typescript
import { combine } from "@brika/sdk";

combine(inputs.a, inputs.b)
  .pipe(map(([a, b]) => a + b))
  .to(outputs.sum);
```

#### merge

Emit when any source emits.

```typescript
import { merge } from "@brika/sdk";

merge(inputs.btn1, inputs.btn2).to(outputs.anyButton);
```

#### zip

Pair values from multiple flows.

```typescript
import { zip } from "@brika/sdk";

zip(inputs.a, inputs.b).to(outputs.paired);
```

#### race

Emit from whichever flow emits first.

```typescript
import { race } from "@brika/sdk";

race(inputs.fast, inputs.slow).to(outputs.winner);
```

#### all

Wait for all flows to emit at least once.

```typescript
import { all } from "@brika/sdk";

all(inputs.a, inputs.b, inputs.c).to(outputs.ready);
```

### Sources

#### interval

Emit incrementing numbers at regular intervals.

```typescript
import { interval } from "@brika/sdk";

start(interval(1000))
  .pipe(map((n) => ({ tick: n, ts: Date.now() })))
  .to(outputs.tick);
```

#### timer

Emit once after a delay.

```typescript
import { timer } from "@brika/sdk";

start(timer(5000)).to(outputs.timeout);
```

### Advanced Operators

#### buffer

Collect values until trigger emits.

```typescript
import { buffer } from "@brika/sdk";

inputs.data.pipe(buffer(inputs.flush)).to(outputs.batch);
```

#### sample

Emit latest value when trigger fires.

```typescript
import { sample } from "@brika/sdk";

inputs.data.pipe(sample(inputs.tick)).to(outputs.sampled);
```

#### switchMap

Switch to new flow on each value.

```typescript
import { switchMap } from "@brika/sdk";

inputs.query
  .pipe(switchMap((q) => fetchResults(q)))
  .to(outputs.results);
```

#### flatMap

Flatten nested flows.

```typescript
import { flatMap } from "@brika/sdk";

inputs.ids
  .pipe(flatMap((id) => fetchItem(id)))
  .to(outputs.items);
```

---

## Logging

### log

Logging with automatic source location tracking.

```typescript
import { log } from "@brika/sdk";
```

#### log.debug(message, meta?)

Debug messages (only shown when debug logging is enabled).

```typescript
log.debug("Processing item", { itemId: 123 });
```

#### log.info(message, meta?)

Informational messages.

```typescript
log.info("Connection established", { host: "localhost" });
```

#### log.warn(message, meta?)

Warning messages.

```typescript
log.warn("Retry attempt failed", { attempt: 2, maxRetries: 3 });
```

#### log.error(message, meta?)

Error messages. Automatically captures stack traces from Error objects.

```typescript
try {
  await riskyOperation();
} catch (err) {
  log.error("Operation failed", { error: err });
}
```

---

## Sparks

Sparks are typed, persisted events for inter-plugin communication. See the [Sparks documentation](sparks.md) for full details.

### defineSpark

Define a typed spark with Zod schema validation.

```typescript
import { defineSpark, z } from "@brika/sdk";

export const deviceUpdated = defineSpark({
  id: "device-updated",
  schema: z.object({
    deviceId: z.string(),
    state: z.string(),
    ts: z.number(),
  }),
});

// Emit with full type safety
deviceUpdated.emit({
  deviceId: "light-1",
  state: "on",
  ts: Date.now(),
});
```

### subscribeSpark

Subscribe to spark events in reactive blocks.

```typescript
import { subscribeSpark } from "@brika/sdk";

// In a reactive block executor:
start(subscribeSpark("timer:timer-completed"))
  .pipe(map((event) => event.payload))
  .to(outputs.data);
```

---

## Lifecycle

### onInit

Register a handler that runs when the plugin initializes.

```typescript
import { onInit } from "@brika/sdk";

onInit(() => {
  log.info("Plugin initialized");
  // Setup connections, load resources
});
```

**Signature:**

```typescript
function onInit(handler: () => void | Promise<void>): () => void
```

### onStop

Register a cleanup handler that runs when the plugin stops.

```typescript
import { onStop } from "@brika/sdk";

onStop(() => {
  log.info("Plugin stopping");
  // Close connections, cancel timers
});
```

**Signature:**

```typescript
function onStop(handler: () => void | Promise<void>): () => void
```

### onUninstall

Register a handler that runs when the plugin is permanently uninstalled. Runs before `onStop`.

```typescript
import { onUninstall } from "@brika/sdk";

onUninstall(() => {
  log.info("Plugin being uninstalled");
  // Delete files, revoke tokens
});
```

**Signature:**

```typescript
function onUninstall(handler: () => void | Promise<void>): () => void
```

---

## Preferences

### getPreferences

Get plugin configuration from `brika.yml`.

```typescript
import { getPreferences } from "@brika/sdk";

interface MyConfig {
  apiKey: string;
  debug: boolean;
}

const config = getPreferences<MyConfig>();
log.info(`Debug mode: ${config.debug}`);
```

**Signature:**

```typescript
function getPreferences<T extends Record<string, unknown>>(): T
```

### onPreferencesChange

React to configuration changes.

```typescript
import { onPreferencesChange } from "@brika/sdk";

onPreferencesChange<MyConfig>((newConfig) => {
  log.info("Configuration updated");
  // Reconfigure based on new settings
});
```

**Signature:**

```typescript
function onPreferencesChange<T>(handler: (prefs: T) => void): () => void
```

---

## Brick Data

Server-side APIs for pushing data to client-rendered bricks.

### setBrickData

Push data to all client-rendered instances of a brick type. Data becomes available in the browser via `useBrickData<T>()`.

```typescript
import { setBrickData } from "@brika/sdk";

setBrickData("compact", { temperature: 21, city: "Zurich" });
```

**Signature:**

```typescript
function setBrickData(brickTypeId: string, data: unknown): void
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `brickTypeId` | `string` | Brick type ID (matches `package.json` brick entry) |
| `data` | `unknown` | Arbitrary serializable data — available via `useBrickData()` |

### onBrickConfigChange

Register a handler called when a brick instance's config changes (e.g., user edits settings in the config sheet).

```typescript
import { onBrickConfigChange } from "@brika/sdk";

onBrickConfigChange((instanceId, config) => {
  if (typeof config.city === "string") {
    ensurePolling(config.city);
  }
});
```

**Signature:**

```typescript
function onBrickConfigChange(
  handler: (instanceId: string, config: Record<string, unknown>) => void
): () => void
```

Returns an unsubscribe function.

---

## Brick Views (Client-Side)

Hooks available in client-rendered brick components. Import from `@brika/sdk/brick-views`.

### useBrickData

Subscribe to data pushed from the plugin process via `setBrickData()`.

```typescript
import { useBrickData } from "@brika/sdk/brick-views";

const data = useBrickData<MyDataType>();
```

**Signature:**

```typescript
function useBrickData<T>(): T | undefined
```

Returns `undefined` until data arrives.

### useBrickConfig

Read the per-instance config for this brick.

```typescript
import { useBrickConfig } from "@brika/sdk/brick-views";

const config = useBrickConfig();
```

**Signature:**

```typescript
function useBrickConfig(): Record<string, unknown>
```

### useBrickSize

Read the current grid size of this brick instance.

```typescript
import { useBrickSize } from "@brika/sdk/brick-views";

const { width, height } = useBrickSize();
```

**Signature:**

```typescript
function useBrickSize(): { width: number; height: number }
```

### useCallBrickAction

Returns a stable callback to send an action to the plugin process for the current brick instance.

```typescript
import { useCallBrickAction } from "@brika/sdk/brick-views";

const callAction = useCallBrickAction();
await callAction("toggle", { deviceId: "light-1" });
```

**Signature:**

```typescript
function useCallBrickAction(): (actionId: string, payload?: unknown) => Promise<void>
```

---

## Shared Store

### defineSharedStore

Zustand-style reactive store shared across the plugin process.

```typescript
import { defineSharedStore } from "@brika/sdk";

const counterStore = defineSharedStore({ count: 0 });

// Read
counterStore.get().count;

// Write (notifies all subscribers)
counterStore.set(prev => ({ ...prev, count: prev.count + 1 }));

// Subscribe
const unsub = counterStore.subscribe(() => console.log(counterStore.get()));
```

**Signature:**

```typescript
function defineSharedStore<T>(initial: T): SharedStore<T>
```

**SharedStore interface:**

```typescript
interface SharedStore<T> {
  get(): T;
  set(value: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
}
```

| Method | Description |
|--------|-------------|
| `get()` | Read current state synchronously |
| `set(value)` | Update state, notify all subscribers (`Object.is` comparison) |
| `subscribe(fn)` | Subscribe to changes. Returns unsubscribe function |

---

## Actions

### defineAction

Define a server-side action that pages and bricks can call. Action IDs are auto-generated at build time from `hash(filePath + exportName)` — deterministic and collision-resistant.

```typescript
import { defineAction } from "@brika/sdk/actions";

export const getDevices = defineAction(async () => {
  return controller.getDevices();
});

export const toggleDevice = defineAction(async (input: { id: string }) => {
  return controller.toggle(input.id);
});
```

**Signature:**

```typescript
function defineAction<TInput = void, TOutput = unknown>(
  handler: (input: TInput) => TOutput | Promise<TOutput>
): ActionRef<TInput, TOutput>
```

**ActionRef:**

```typescript
interface ActionRef<TInput = void, TOutput = unknown> {
  readonly __actionId: string;
}
```

Action files must be separate modules (e.g., `src/actions.ts`) that import from `@brika/sdk/actions`. The build system detects them automatically and injects IDs.

---

## Types

### Exported Types

```typescript
import type {
  // Block types
  BlockContext,
  BlockInstance,
  BlockRuntimeContext,
  BlockSetup,
  CompiledReactiveBlock,
  ReactiveBlockSpec,
  
  // Port types
  InputDef,
  OutputDef,
  PortMeta,
  InputFlows,
  OutputEmitters,
  
  // Metadata types
  BlockDefinition,
  BlockPort,
  BlockSchema,
  PortDirection,
  
  // Event types
  EventHandler,
  EventPayload,
  
  // Lifecycle types
  InitHandler,
  StopHandler,
  UninstallHandler,
  PreferencesChangeHandler,
  BrickConfigChangeHandler,

  // Action types
  ActionRef,

  // Store types
  SharedStore,

  // Flow types
  Flow,
  Emitter,
  Source,
  Factory,
  Operator,
  Cleanup,
  
  // Utility types
  Json,
  JsonRecord,
  Serializable,
  PluginInfo,
  ToolResult,
  ToolCallContext,
  
  // Zod types
  ZodType,
  ZodObject,
  ZodRawShape,
  ZodInfer,
} from "@brika/sdk";
```

### Json

JSON-serializable value.

```typescript
type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [k: string]: Json | undefined };
```

### Serializable

Any value that can be serialized for IPC.

```typescript
type Serializable = Json | Serializable[] | { [k: string]: Serializable };
```

### ToolResult

Result from a tool call.

```typescript
interface ToolResult {
  ok: boolean;
  content?: string;
  data?: Json;
}
```
