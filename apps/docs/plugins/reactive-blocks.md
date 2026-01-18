# Reactive Blocks

Blocks are the building blocks of workflows. Each block has typed inputs, outputs, and configuration.

## Block Anatomy

```typescript
import { defineReactiveBlock, input, output, z } from "@brika/sdk";

export const myBlock = defineReactiveBlock(
  {
    // Unique ID (matches package.json blocks[].id)
    id: "my-block",

    // Input ports
    inputs: {
      trigger: input(z.generic(), { name: "Trigger" }),
      data: input(z.number(), { name: "Data" }),
    },

    // Output ports
    outputs: {
      result: output(z.string(), { name: "Result" }),
      error: output(z.string(), { name: "Error" }),
    },

    // Configuration schema
    config: z.object({
      multiplier: z.number().default(1),
    }),
  },
  // Executor function
  ({ inputs, outputs, config, log, start }) => {
    inputs.data.on((value) => {
      const result = value * config.multiplier;
      outputs.result.emit(`Result: ${result}`);
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

Generic ports are useful for passthrough blocks or when the type doesn't matter.

### Typed Ports

Explicit Zod schema for type safety:

```typescript
inputs: {
  temperature: input(z.number(), { name: "Temperature °C" }),
  settings: input(z.object({
    min: z.number(),
    max: z.number(),
  }), { name: "Settings" }),
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

## Reactive Operators

Transform and combine data streams using operators:

### map

Transform values:

```typescript
inputs.temperature
  .pipe(map((celsius) => celsius * 1.8 + 32))
  .to(outputs.fahrenheit);
```

### filter

Filter values based on a condition:

```typescript
inputs.motion
  .pipe(filter((m) => m.confidence > 0.8))
  .to(outputs.detected);
```

### delay

Delay emission:

```typescript
inputs.trigger
  .pipe(delay(1000)) // 1 second
  .to(outputs.delayed);
```

### debounce

Debounce rapid inputs:

```typescript
inputs.search
  .pipe(debounce(300)) // 300ms
  .to(outputs.query);
```

### throttle

Throttle high-frequency data:

```typescript
inputs.sensor
  .pipe(throttle(100)) // Max once per 100ms
  .to(outputs.sampled);
```

### combine

Wait for all inputs before emitting:

```typescript
combine(inputs.a, inputs.b)
  .pipe(map(([a, b]) => a + b))
  .to(outputs.sum);
```

### merge

Emit when any input fires:

```typescript
merge(inputs.button1, inputs.button2)
  .to(outputs.anyButton);
```

## Source Blocks

Source blocks generate data without inputs. Use `start()`:

```typescript
import { interval } from "@brika/sdk";

export const clock = defineReactiveBlock(
  {
    id: "clock",
    inputs: {},
    outputs: {
      tick: output(z.object({ count: z.number(), ts: z.number() }), { name: "Tick" }),
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

## Configuration Schema

Use Zod for type-safe configuration:

```typescript
config: z.object({
  // Basic types
  name: z.string().default("default"),
  count: z.number().min(1).max(100).default(10),
  enabled: z.boolean().default(true),

  // Enums
  mode: z.enum(["fast", "slow", "auto"]).default("auto"),

  // Optional
  description: z.string().optional(),

  // Custom UI types (see Schema Types)
  delay: z.duration(undefined, "Wait duration"),
  color: z.color("LED color"),
  script: z.code("javascript", "Script to run"),
  apiKey: z.secret("API key"),
})
```

## Connecting to Outputs

There are two ways to emit to outputs:

### Direct Emission

```typescript
inputs.trigger.on(() => {
  outputs.result.emit("Hello!");
});
```

### Using .to()

```typescript
inputs.trigger
  .pipe(map(() => "Hello!"))
  .to(outputs.result);
```

## Error Handling

Handle errors gracefully:

```typescript
({ inputs, outputs, log }) => {
  inputs.data.on((value) => {
    try {
      const result = processData(value);
      outputs.success.emit(result);
    } catch (err) {
      log.error('Processing failed', { error: err });
      outputs.error.emit(String(err));
    }
  });
}
```

## Best Practices

1. **Keep blocks focused** — One block, one responsibility
2. **Use typed ports** — Avoid generic ports when possible
3. **Validate configuration** — Use Zod constraints (min, max, regex)
4. **Handle errors** — Always catch and emit errors
5. **Log appropriately** — Use `log.info()`, `log.debug()`, `log.warn()`, `log.error()`
6. **Clean up resources** — Return a cleanup function from setup or use `onStop`

## Next Steps

* [Lifecycle Hooks](lifecycle-hooks.md) — Handle plugin events
* [Reactive Operators](../api-reference/operators.md) — Full operator reference
* [Schema Types](../api-reference/schema-types.md) — Custom UI types
