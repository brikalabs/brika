# @brika/sdk

Plugin SDK for BRIKA home automation runtime. Build reactive blocks for visual workflow automation.

## Installation

```bash
bun add @brika/sdk
```

## Quick Start

```typescript
// plugins/my-plugin/src/main.ts
import { defineReactiveBlock, input, output, log, onStop, z } from "@brika/sdk";

// Define a reactive block with typed inputs/outputs
export const greet = defineReactiveBlock(
  {
    id: "greet",
    inputs: {
      trigger: input(z.generic(), { name: "Trigger" }),
    },
    outputs: {
      message: output(z.object({ text: z.string() }), { name: "Message" }),
    },
    config: z.object({
      name: z.string().describe("Name to greet"),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    inputs.trigger.on(() => {
      log("info", `Greeting ${config.name}`);
      outputs.message.emit({ text: `Hello, ${config.name}!` });
    });
  }
);

// Lifecycle hooks
onStop(() => log("info", "Plugin stopping"));

log("info", "Plugin loaded");
```

## Defining Reactive Blocks

Blocks are the building blocks of workflows. Each block has typed inputs, outputs, and configuration.

```typescript
import {
  defineReactiveBlock,
  input,
  output,
  combine,
  map,
  z,
} from "@brika/sdk";

export const temperatureAlert = defineReactiveBlock(
  {
    id: "temperature-alert",
    inputs: {
      temperature: input(z.number(), { name: "Temperature °C" }),
      humidity: input(z.number(), { name: "Humidity %" }),
    },
    outputs: {
      alert: output(z.object({ type: z.string(), message: z.string() }), {
        name: "Alert",
      }),
      normal: output(z.object({ temp: z.number(), hum: z.number() }), {
        name: "Normal",
      }),
    },
    config: z.object({
      maxTemp: z.number().default(30).describe("Max temperature threshold"),
      maxHumidity: z.number().default(80).describe("Max humidity threshold"),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    // Combine multiple inputs
    combine(inputs.temperature, inputs.humidity)
      .pipe(
        map(([temp, hum]) => {
          if (temp > config.maxTemp) {
            return { type: "hot", temp, hum };
          }
          if (hum > config.maxHumidity) {
            return { type: "humid", temp, hum };
          }
          return { type: "normal", temp, hum };
        })
      )
      .on((data) => {
        if (data.type === "normal") {
          outputs.normal.emit({ temp: data.temp, hum: data.hum });
        } else {
          log("warn", `Alert: ${data.type}`);
          outputs.alert.emit({
            type: data.type,
            message: `${data.type}: temp=${data.temp}, humidity=${data.hum}`,
          });
        }
      });
  }
);
```

## Port Types

### Generic Ports

Accept any type, inferred at connection time:

```typescript
inputs: {
  in: input(z.generic(), { name: "Input" }),
}
```

### Passthrough Ports

Output inherits type from an input:

```typescript
inputs: {
  in: input(z.number(), { name: "Input" }),
},
outputs: {
  out: output(z.passthrough("in"), { name: "Output" }),
}
```

### Typed Ports

Explicit Zod schema:

```typescript
inputs: {
  data: input(z.object({ value: z.number() }), { name: "Data" }),
},
outputs: {
  result: output(z.string(), { name: "Result" }),
}
```

## Custom Schema Types

The SDK provides special schema types for UI rendering:

```typescript
import { z } from "@brika/sdk";

config: z.object({
  // Duration picker (ms, s, m, h)
  delay: z.duration(undefined, "Wait duration"),

  // Color picker
  color: z.color("LED color"),

  // Code editor
  script: z.code("javascript", "Script to run"),

  // Password/secret input
  apiKey: z.secret("API key"),

  // Expression with variable autocomplete
  expr: z.expression("Dynamic value"),
});
```

## Reactive Operators

Import operators from `@brika/sdk`:

```typescript
import {
  map,
  filter,
  delay,
  debounce,
  throttle,
  combine,
  merge,
  interval,
} from "@brika/sdk";

// Transform data
inputs.temperature.pipe(map((t) => t * 1.8 + 32)).to(outputs.fahrenheit);

// Filter values
inputs.motion.pipe(filter((m) => m.confidence > 0.8)).to(outputs.detected);

// Delay output
inputs.trigger.pipe(delay(1000)).to(outputs.delayed);

// Debounce rapid inputs
inputs.search.pipe(debounce(300)).to(outputs.query);

// Throttle high-frequency data
inputs.sensor.pipe(throttle(100)).to(outputs.sampled);

// Combine multiple inputs (waits for all)
combine(inputs.a, inputs.b)
  .pipe(map(([a, b]) => a + b))
  .to(outputs.sum);

// Merge multiple inputs (emits on any)
merge(inputs.button1, inputs.button2).to(outputs.anyButton);
```

## Starting Sources

Use `start()` for source blocks that generate data:

```typescript
import { interval } from "@brika/sdk";

export const clock = defineReactiveBlock(
  {
    id: "clock",
    inputs: {},
    outputs: {
      tick: output(z.object({ count: z.number(), ts: z.number() }), {
        name: "Tick",
      }),
    },
    config: z.object({
      interval: z.duration(undefined, "Tick interval"),
    }),
  },
  ({ outputs, config, start }) => {
    start(interval(config.interval))
      .pipe(map((count) => ({ count: count + 1, ts: Date.now() })))
      .to(outputs.tick);
  }
);
```

## Lifecycle & Events

```typescript
import { log, emit, on, onInit, onStop, onUninstall } from "@brika/sdk";

// Logging
log("info", "Message", { extra: "data" });
log("warn", "Warning");
log("error", "Error");

// Emit events
emit("device.updated", { id: "light-1", state: "on" });

// Subscribe to events
const unsub = on("motion.*", (event) => {
  log("debug", `Motion: ${event.type}`, event.payload);
});

// Lifecycle hooks
onInit(() => {
  log("info", "Plugin initialized");
});

onStop(() => {
  log("info", "Plugin stopping");
  // Cleanup resources
});

onUninstall(() => {
  log("info", "Plugin being uninstalled");
  // Permanent cleanup (delete files, revoke tokens, etc.)
});
```

## Plugin Configuration (Preferences)

Access plugin configuration from `brika.yml`:

```typescript
import { getPreferences, onPreferencesChange } from "@brika/sdk";

interface MyPrefs {
  apiKey: string;
  debug: boolean;
}

// Get current preferences
const prefs = getPreferences<MyPrefs>();
log("info", `Debug mode: ${prefs.debug}`);

// React to changes
onPreferencesChange<MyPrefs>((newPrefs) => {
  log("info", "Preferences updated");
});
```

## Package.json Schema

Use the schema for IDE autocomplete:

```json
{
  "$schema": "https://schema.brika.dev/plugin.schema.json",
  "name": "@brika/plugin-my-plugin",
  "version": "0.1.0",
  "description": "My plugin description",
  "author": "Your Name",
  "keywords": ["automation", "iot"],
  "type": "module",
  "main": "./src/main.ts",
  "exports": {
    ".": "./src/main.ts"
  },
  "blocks": [
    {
      "id": "my-block",
      "name": "My Block",
      "description": "Does something",
      "category": "action",
      "icon": "zap",
      "color": "#3b82f6"
    }
  ],
  "dependencies": {
    "@brika/sdk": "workspace:*"
  }
}
```

## Exports

```typescript
// Block definition
export {
  defineReactiveBlock,
  input,
  output,
  isCompiledReactiveBlock,
} from "@brika/sdk";

// Schema
export { z } from "@brika/sdk";

// Reactive operators
export {
  map,
  filter,
  delay,
  debounce,
  throttle,
  combine,
  merge,
  interval,
} from "@brika/sdk";

// Lifecycle & Events
export {
  log,
  emit,
  on,
  onEvent,
  onInit,
  onStop,
  onUninstall,
  getPreferences,
  onPreferencesChange,
} from "@brika/sdk";

// Types
export type {
  BlockContext,
  BlockInstance,
  CompiledReactiveBlock,
  InputDef,
  OutputDef,
  ReactiveBlockSpec,
} from "@brika/sdk";
```
