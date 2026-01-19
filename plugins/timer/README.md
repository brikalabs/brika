# @brika/plugin-timer

Timer and countdown blocks for BRIKA workflows. Create delayed triggers, countdowns with progress, and time-based automation logic.

## Available Blocks

### Timer

A one-shot timer that fires after a configured duration.

**Inputs:**
- `trigger` (generic) — Starts the timer when data is received

**Outputs:**
- `completed` — Emits when timer finishes with `{ name, duration, triggeredAt, completedAt }`

**Config:**
- `name` (string, optional) — Timer name
- `duration` (duration) — How long to wait

**Usage:**

```yaml
blocks:
  - id: start-timer
    type: "@brika/plugin-timer:timer"
    config:
      name: "Break Reminder"
      duration: 1800000  # 30 minutes in ms

  - id: notify
    type: "@brika/blocks-builtin:log"
    config:
      message: "Timer completed!"

connections:
  - from: start-timer
    fromPort: completed
    to: notify
    toPort: in
```

### Countdown

A countdown that emits progress ticks and completion/cancellation events.

**Inputs:**
- `start` (generic) — Starts the countdown
- `cancel` (generic) — Cancels the countdown

**Outputs:**
- `tick` — Periodic progress: `{ remaining, total, progress }`
- `completed` — When countdown finishes: `{ total }`
- `cancelled` — When cancelled: `{ remaining }`

**Config:**
- `duration` (duration) — Total countdown time
- `tickInterval` (duration, default: 1000) — Interval between ticks

**Usage:**

```yaml
blocks:
  - id: countdown
    type: "@brika/plugin-timer:countdown"
    config:
      duration: 60000      # 1 minute
      tickInterval: 1000   # Update every second

  - id: progress-log
    type: "@brika/blocks-builtin:log"
    config:
      message: "{{ Math.round(inputs.in.progress * 100) }}% complete"

connections:
  - from: countdown
    fromPort: tick
    to: progress-log
    toPort: in
```

## Examples

### Simple Delayed Action

```yaml
id: delayed-action
name: Delayed Action
enabled: true

blocks:
  - id: clock
    type: "@brika/blocks-builtin:clock"
    config:
      interval: 60000  # Check every minute

  - id: timer
    type: "@brika/plugin-timer:timer"
    config:
      name: "action-delay"
      duration: 5000  # 5 second delay

  - id: action
    type: "@brika/blocks-builtin:log"
    config:
      message: "Delayed action executed!"

connections:
  - from: clock
    fromPort: tick
    to: timer
    toPort: trigger
  - from: timer
    fromPort: completed
    to: action
    toPort: in
```

### Countdown with Progress

```yaml
id: countdown-demo
name: Countdown Demo
enabled: true

blocks:
  - id: start
    type: "@brika/blocks-builtin:clock"
    config:
      interval: 30000

  - id: countdown
    type: "@brika/plugin-timer:countdown"
    config:
      duration: 10000
      tickInterval: 1000

  - id: progress
    type: "@brika/blocks-builtin:log"
    config:
      message: "Countdown: {{ inputs.in.remaining }}ms remaining"
      level: debug

  - id: done
    type: "@brika/blocks-builtin:log"
    config:
      message: "Countdown complete!"
      level: info

connections:
  - from: start
    fromPort: tick
    to: countdown
    toPort: start
  - from: countdown
    fromPort: tick
    to: progress
    toPort: in
  - from: countdown
    fromPort: completed
    to: done
    toPort: in
```

## Implementation

```typescript
import { defineReactiveBlock, input, output, log, onStop, z } from "@brika/sdk";

export const timer = defineReactiveBlock(
  {
    id: "timer",
    inputs: {
      trigger: input(z.generic(), { name: "Trigger" }),
    },
    outputs: {
      completed: output(
        z.object({
          name: z.string(),
          duration: z.number(),
          triggeredAt: z.number(),
          completedAt: z.number(),
        }),
        { name: "Completed" }
      ),
    },
    config: z.object({
      name: z.string().optional().describe("Timer name"),
      duration: z.duration(undefined, "Duration to wait"),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    let activeTimer: ReturnType<typeof setTimeout> | null = null;

    inputs.trigger.on(() => {
      if (activeTimer) clearTimeout(activeTimer);

      const triggeredAt = Date.now();
      const name = config.name ?? "timer";

      log.info(`Timer "${name}" started for ${config.duration}ms`);

      activeTimer = setTimeout(() => {
        outputs.completed.emit({
          name,
          duration: config.duration,
          triggeredAt,
          completedAt: Date.now(),
        });
        activeTimer = null;
      }, config.duration);
    });

    return () => {
      if (activeTimer) clearTimeout(activeTimer);
    };
  }
);

onStop(() => log.info("Timer plugin stopping"));
log.info("Timer plugin loaded");
```

## Installation

Add to your `brika.yml`:

```yaml
install:
  - ref: "workspace:timer"
    enabled: true
```

Or install from npm:

```yaml
install:
  - ref: "npm:@brika/plugin-timer"
    enabled: true
```
