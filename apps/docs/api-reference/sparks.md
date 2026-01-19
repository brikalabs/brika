# Sparks

Sparks are typed, persisted events that enable inter-plugin communication with full schema validation and historical querying.

## Overview

While the [Event System](events.md) provides lightweight pub/sub communication, Sparks offer additional features:

- **Type Safety**: Zod schemas ensure payloads are validated at compile-time and runtime
- **Persistence**: All spark events are stored in SQLite for historical analysis
- **Schema Documentation**: Sparks are declared in `package.json` with names and descriptions
- **Debugging**: The web UI allows viewing, filtering, and manually emitting sparks

```typescript
import { defineSpark, subscribeSpark, z } from "@brika/sdk";
```

---

## Defining Sparks

### Basic Definition

Sparks must be declared in your plugin's `package.json` and defined in code using `defineSpark()`:

**package.json:**

```json
{
  "name": "my-plugin",
  "sparks": [
    {
      "id": "sensor-reading",
      "name": "Sensor Reading",
      "description": "Emitted when a sensor reports a new value"
    }
  ]
}
```

**src/index.ts:**

```typescript
import { defineSpark, z } from "@brika/sdk";

export const sensorReading = defineSpark({
  id: "sensor-reading",
  schema: z.object({
    sensorId: z.string(),
    value: z.number(),
    unit: z.string(),
    ts: z.number(),
  }),
});
```

### Emitting Sparks

The `defineSpark()` function returns a compiled spark with a fully-typed `emit()` method:

```typescript
// Fully typed - TypeScript will error if payload doesn't match schema
sensorReading.emit({
  sensorId: "temp-1",
  value: 22.5,
  unit: "celsius",
  ts: Date.now(),
});
```

### Spark Naming

Sparks are automatically namespaced with your plugin ID:

| Plugin ID | Spark ID | Full Type |
|-----------|----------|-----------|
| `my-plugin` | `sensor-reading` | `my-plugin:sensor-reading` |
| `timer` | `timer-started` | `timer:timer-started` |
| `lights` | `state-changed` | `lights:state-changed` |

---

## Subscribing to Sparks

### In Reactive Blocks

Use `subscribeSpark()` to create a reactive source that emits spark events:

```typescript
import { defineReactiveBlock, subscribeSpark, output, z, map } from "@brika/sdk";

export const sparkListener = defineReactiveBlock(
  {
    id: "spark-listener",
    inputs: {},
    outputs: {
      payload: output(z.resolved("spark", "sparkType"), { name: "Payload" }),
    },
    config: z.object({
      sparkType: z.sparkType("Spark to listen for"),
    }),
  },
  ({ config, outputs, start }) => {
    start(subscribeSpark(config.sparkType))
      .pipe(map((event) => event.payload))
      .to(outputs.payload);
  }
);
```

### Spark Event Structure

When subscribing, you receive `SparkEvent` objects:

```typescript
interface SparkEvent {
  id: string;       // Unique event ID
  type: string;     // Full spark type (e.g., "timer:timer-started")
  source: string;   // Plugin that emitted the spark
  payload: unknown; // Event payload (matches schema)
  ts: number;       // Timestamp (Unix ms)
}
```

---

## Complete Example

### Timer Plugin

**package.json:**

```json
{
  "name": "timer",
  "sparks": [
    {
      "id": "timer-started",
      "name": "Timer Started",
      "description": "Emitted when a timer begins counting"
    },
    {
      "id": "timer-completed",
      "name": "Timer Completed",
      "description": "Emitted when a timer finishes"
    }
  ]
}
```

**src/index.ts:**

```typescript
import { defineSpark, z, onInit } from "@brika/sdk";

// Define sparks with schemas
export const timerStarted = defineSpark({
  id: "timer-started",
  schema: z.object({
    timerId: z.string(),
    name: z.string(),
    duration: z.number(),
  }),
});

export const timerCompleted = defineSpark({
  id: "timer-completed",
  schema: z.object({
    timerId: z.string(),
    name: z.string(),
    elapsed: z.number(),
  }),
});

// Use sparks
onInit(() => {
  const timerId = crypto.randomUUID();

  timerStarted.emit({
    timerId,
    name: "Morning Alarm",
    duration: 30000,
  });

  setTimeout(() => {
    timerCompleted.emit({
      timerId,
      name: "Morning Alarm",
      elapsed: 30000,
    });
  }, 30000);
});
```

### Automation Plugin (Consumer)

```typescript
import { defineReactiveBlock, subscribeSpark, output, z, map, log } from "@brika/sdk";

export const timerReactor = defineReactiveBlock(
  {
    id: "timer-reactor",
    inputs: {},
    outputs: {
      timerName: output(z.string(), { name: "Timer Name" }),
    },
    config: z.object({}),
  },
  ({ outputs, start }) => {
    // Subscribe to timer completion sparks
    start(subscribeSpark("timer:timer-completed"))
      .pipe(
        map((event) => {
          log.info("Timer completed!", { timer: event.payload });
          return event.payload.name;
        })
      )
      .to(outputs.timerName);
  }
);
```

---

## REST API

The hub exposes a REST API for querying sparks:

### List Registered Sparks

```
GET /api/sparks/
```

Returns all registered spark definitions:

```json
[
  {
    "type": "timer:timer-started",
    "id": "timer-started",
    "pluginId": "timer",
    "name": "Timer Started",
    "description": "Emitted when a timer begins counting",
    "schema": {
      "type": "object",
      "properties": {
        "timerId": { "type": "string" },
        "name": { "type": "string" },
        "duration": { "type": "number" }
      }
    }
  }
]
```

### Get Spark History

```
GET /api/sparks/history?type=timer:timer-started&limit=50&cursor=123
```

Query parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by spark type (optional) |
| `source` | string | Filter by source plugin (optional) |
| `limit` | number | Results per page (1-1000, default 100) |
| `cursor` | number | Pagination cursor for next page |

Response:

```json
{
  "sparks": [
    {
      "id": 456,
      "type": "timer:timer-started",
      "source": "timer",
      "payload": { "timerId": "abc", "name": "Alarm", "duration": 30000 },
      "ts": 1705123456789
    }
  ],
  "nextCursor": 455
}
```

### Get Spark Definition

```
GET /api/sparks/:type
```

Returns a specific spark definition by its full type.

### Emit Spark (Debug)

```
POST /api/sparks/emit
Content-Type: application/json

{
  "type": "timer:timer-started",
  "payload": {
    "timerId": "test-123",
    "name": "Test Timer",
    "duration": 5000
  }
}
```

Emits a spark event with `source: "debug"`. Useful for testing workflows.

---

## Web UI

The Sparks page (`/sparks`) provides:

### Registry Tab

- View all registered sparks grouped by plugin
- See names, descriptions, and JSON schemas
- Manually emit sparks for testing

### Event Stream Tab

- Real-time stream of spark events
- Pause/resume event collection
- Filter by spark type
- View full payloads
- Re-emit historical events

---

## Sparks vs Events

| Feature | Events | Sparks |
|---------|--------|--------|
| Type safety | Runtime only | Compile-time + runtime |
| Persistence | In-memory only | SQLite database |
| Schema | None | Zod schemas |
| Declaration | None required | package.json |
| UI | None | Full inspection UI |
| Use case | Lightweight signals | Important, queryable events |

**Use Events when:**
- You need simple pub/sub
- Events are ephemeral
- No schema validation needed

**Use Sparks when:**
- Events should be persisted
- Type safety is important
- You need historical querying
- Events are part of your plugin's public API

---

## Best Practices

### 1. Use Descriptive IDs

```typescript
// Good - clear and specific
defineSpark({ id: "temperature-threshold-exceeded", ... });

// Avoid - too generic
defineSpark({ id: "alert", ... });
```

### 2. Include Timestamps

```typescript
const reading = defineSpark({
  id: "sensor-reading",
  schema: z.object({
    value: z.number(),
    ts: z.number(),  // Always include timestamp
  }),
});
```

### 3. Document in package.json

```json
{
  "sparks": [
    {
      "id": "door-opened",
      "name": "Door Opened",
      "description": "Emitted when a door sensor detects opening. Payload includes door ID and timestamp."
    }
  ]
}
```

### 4. Keep Payloads Focused

```typescript
// Good - focused payload
const doorOpened = defineSpark({
  id: "door-opened",
  schema: z.object({
    doorId: z.string(),
    ts: z.number(),
  }),
});

// Avoid - too much data
const doorOpened = defineSpark({
  id: "door-opened",
  schema: z.object({
    doorId: z.string(),
    ts: z.number(),
    allDoorStates: z.record(z.boolean()),  // Don't include unrelated data
    lastWeekHistory: z.array(z.unknown()), // Don't include bulk data
  }),
});
```

### 5. Version Your Schemas

If you need to change a spark's schema, consider creating a new spark:

```typescript
// v1 - keep for backwards compatibility
export const sensorReadingV1 = defineSpark({
  id: "sensor-reading",
  schema: z.object({ value: z.number() }),
});

// v2 - new spark with enhanced schema
export const sensorReadingV2 = defineSpark({
  id: "sensor-reading-v2",
  schema: z.object({
    value: z.number(),
    unit: z.string(),
    accuracy: z.number(),
  }),
});
```

---

## Next Steps

- [Events](events.md) — Lightweight pub/sub communication
- [Reactive Blocks](../plugins/reactive-blocks.md) — Building workflow blocks
- [Schema Types](schema-types.md) — Custom configuration types
