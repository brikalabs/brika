# @brika/workflow

Event-driven workflow engine. Blocks are reactive flow handlers.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            WorkflowRuntime                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                  │
│   │ Timer Block │     │ Join Block  │     │ Action Block│                  │
│   │ (source)    │     │ (operator)  │     │ (sink)      │                  │
│   │             │     │             │     │             │                  │
│   │ [no inputs] │     │ [a] [b]     │     │ [in]        │                  │
│   │   (tick)    │───▶│   (out)     │───▶│ [no outputs]│                  │
│   └─────────────┘     └─────────────┘     └─────────────┘                  │
│                                                                             │
│   Data flows through EventBus ◄───────────────────────────────────────────┤
│   Port buffers keep last value ◄──────────────────────────────────────────┤
│   UI subscribes via SSE ◄─────────────────────────────────────────────────┤
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Blocks are Flow Handlers

- **No execution status** - blocks don't "run", they react to events
- **No persistence** - blocks are stateless, data flows through
- **Simple lifecycle**: `onStart()` → [active, reacting to events] → `onStop()`

### Block States

```typescript
type BlockState = 'running' | 'paused' | 'stopped';
```

- **running**: Block is active, processing events
- **paused**: Block is suspended, events are buffered
- **stopped**: Block is fully stopped

### Port Buffers

Each port keeps its last value for:
- UI inspection (see current data)
- Retrigger (resend last value through the flow)
- Debugging (inject test data)

## Usage

### Create and Start a Workflow

```typescript
import { WorkflowRuntime, parseWorkspace } from "@brika/workflow";

const workflow = parseWorkspace(tomlContent);

const runtime = new WorkflowRuntime(workflow, {
  blocks: blockRegistry,
  tools: toolExecutor,
  onLog: (blockId, level, msg) => console.log(`[${blockId}] ${msg}`),
  onBlockStateChange: (blockId, state) => console.log(`${blockId}: ${state}`),
});

await runtime.start();
```

### Observe Events (for UI)

```typescript
// Subscribe to all events
const unsubscribe = runtime.observe((event) => {
  console.log(`${event.sourceBlockId}:${event.sourcePort} → ${event.targetBlockId}:${event.targetPort}`);
  console.log("Data:", event.data);
});

// Create SSE stream
import { createEventStream } from "@brika/workflow";
const stream = createEventStream(runtime.eventBus);
```

### Inspect Port Values

```typescript
// Get last value for a port
const buffer = runtime.getPortBuffer("sensor", "temperature");
console.log("Last value:", buffer?.value);
console.log("Event count:", buffer?.count);

// Get all port buffers
const allBuffers = runtime.getAllPortBuffers();
```

### Retrigger and Inject Data

```typescript
// Resend last value from a port
await runtime.retrigger("sensor", "temperature");

// Inject test data into a port
await runtime.inject("sensor", "temperature", 42);
```

### Pause/Resume Blocks (Debugging)

```typescript
// Pause a block (events will be buffered)
runtime.pauseBlock("processor");

// Check state
console.log(runtime.getBlockState("processor")); // "paused"

// Resume (flushes buffered events)
await runtime.resumeBlock("processor");

// Stop a single block
await runtime.stopBlock("processor");
```

## Workflow Definition (TOML)

```toml
version = "1"

[workspace]
id = "motion-lights"
name = "Motion-Activated Lights"
enabled = true

[plugins]
"@brika/blocks-builtin" = "^0.1.0"
"@brika/plugin-hue" = "^1.0.0"

[[blocks]]
id = "motion-sensor"
type = "@brika/plugin-hue:motion"
config = { device = "sensor-01" }

[blocks.outputs]
detected = ["debounce:in"]

[[blocks]]
id = "debounce"
type = "@brika/blocks-builtin:debounce"
config = { delay = 500 }

[blocks.inputs]
in = ["motion-sensor:detected"]

[blocks.outputs]
out = ["lights:command"]

[[blocks]]
id = "lights"
type = "@brika/plugin-hue:control"
config = { devices = ["light-01", "light-02"] }

[blocks.inputs]
command = ["debounce:out"]
```

## Defining Blocks (SDK)

Use `defineReactiveBlock` from `@brika/sdk`:

```typescript
import { defineReactiveBlock, input, output, combine, z } from "@brika/sdk";

export const comfortBlock = defineReactiveBlock({
  id: "comfort-index",
  inputs: {
    temperature: input(z.number(), { name: "Temperature °C" }),
    humidity: input(z.number(), { name: "Humidity %" }),
  },
  outputs: {
    comfort: output(z.object({ score: z.number() }), { name: "Comfort" }),
    alert: output(z.string(), { name: "Alert" }),
  },
  config: z.object({ threshold: z.number().default(26) }),
}, ({ inputs, outputs, config }) => {
  // All subscriptions auto-cleaned when block stops!

  combine(inputs.temperature, inputs.humidity)
    .pipe(map(([t, h]) => ({ score: Math.round(100 - Math.abs(t - 22) * 5) })))
    .to(outputs.comfort);

  inputs.temperature.on(temp => {
    if (temp > config.threshold) {
      outputs.alert.emit(`Too hot: ${temp}°C`);
    }
  });
});
```

## API Reference

### WorkflowRuntime

| Method | Description |
|--------|-------------|
| `start()` | Start the workflow |
| `stop()` | Stop the workflow |
| `pauseBlock(id)` | Pause a block (buffer events) |
| `resumeBlock(id)` | Resume a paused block |
| `stopBlock(id)` | Stop a single block |
| `getBlockState(id)` | Get block state |
| `getBlockStates()` | Get all block states |
| `observe(fn)` | Subscribe to events |
| `getPortBuffer(blockId, portId)` | Get last value |
| `getAllPortBuffers()` | Get all port buffers |
| `retrigger(blockId, portId)` | Resend last value |
| `inject(blockId, portId, data)` | Inject test data |

### EventBus

| Method | Description |
|--------|-------------|
| `emit(blockId, portId, data)` | Emit data from a port |
| `observe(fn)` | Subscribe to all events |
| `getPortBuffer(blockId, portId)` | Get last value |
| `getAllBuffers()` | Get all port buffers |
| `retrigger(blockId, portId)` | Resend last value |
| `inject(blockId, portId, data)` | Inject data |

### PortBuffer

```typescript
interface PortBuffer {
  portRef: string;      // "blockId:portId"
  value: Serializable;  // Last value
  timestamp: number;    // When it was set
  count: number;        // Event count
}
```
