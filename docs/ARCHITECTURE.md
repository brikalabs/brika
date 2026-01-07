# BRIKA Architecture

> **BRIKA** = **B**lock-based **R**eactive **I**ntelligent **K**nowledge **A**utomation

A Bun-first, plugin-first home automation runtime designed for stability and extensibility.

## Table of Contents

1. [System Overview](#system-overview)
2. [Monorepo Structure](#monorepo-structure)
3. [Core Components](#core-components)
4. [Plugin System](#plugin-system)
5. [Reactive Block Engine](#reactive-block-engine)
6. [IPC Protocol](#ipc-protocol)
7. [API Reference](#api-reference)
8. [Data Flow](#data-flow)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                              BRIKA Hub                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ API Server  │ │ EventBus    │ │ BlockReg    │ │ StateStore  │   │
│  │ (HTTP/SSE)  │ │ (pub/sub)   │ │ (blocks)    │ │ (persist)   │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ Scheduler   │ │ RulesEngine │ │ Automations │ │ LogRouter   │   │
│  │ (cron/int)  │ │ (triggers)  │ │ (workflows) │ │ (logging)   │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                      Plugin Manager                           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │   │
│  │  │ Timer   │  │ Echo    │  │ Blocks  │  │ Custom  │  ...    │   │
│  │  │ Plugin  │  │ Plugin  │  │ Builtin │  │ Plugin  │         │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘         │   │
│  │       │            │            │            │  Binary IPC   │   │
│  └───────┴────────────┴────────────┴────────────┴───────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
           │
           │ HTTP/SSE
           ▼
┌─────────────────────┐
│      React UI       │
│  (TanStack Router)  │
│  (TanStack Query)   │
│  (React Flow)       │
└─────────────────────┘
```

---

## Monorepo Structure

```
brika/
├── apps/
│   ├── hub/                    # Bun Hub runtime
│   │   └── src/
│   │       ├── main.ts         # Entry point
│   │       └── runtime/        # Core services
│   │           ├── app.ts                # Application bootstrap
│   │           ├── automations/          # Workflow engine
│   │           ├── blocks/               # Block registry
│   │           ├── config/               # YAML config loader
│   │           ├── events/               # Event bus (pub/sub)
│   │           ├── http/                 # API server + routes
│   │           ├── logs/                 # Centralized logging
│   │           ├── plugins/              # Plugin lifecycle manager
│   │           ├── rules/                # Rules engine
│   │           ├── scheduler/            # Cron/interval scheduler
│   │           └── state/                # Persistent state
│   │
│   └── ui/                     # React frontend
│       └── src/
│           ├── components/ui/  # shadcn/ui components
│           ├── features/       # Feature modules
│           │   ├── dashboard/
│           │   ├── plugins/
│           │   ├── workflows/  # React Flow editor
│           │   └── ...
│           └── lib/            # Utilities
│
├── packages/
│   ├── sdk/                    # Plugin SDK
│   │   └── src/
│   │       ├── blocks/         # Reactive block API
│   │       ├── api.ts          # Lifecycle & events
│   │       └── context.ts      # Plugin context
│   │
│   ├── flow/                   # Reactive flow library
│   │   └── src/
│   │       ├── flow.ts         # Flow implementation
│   │       ├── operators.ts    # map, filter, delay, etc.
│   │       └── sources.ts      # interval, fromEvent, etc.
│   │
│   ├── events/                 # Event system
│   ├── ipc/                    # Binary IPC protocol
│   └── shared/                 # Shared types & DI
│
├── plugins/                    # Local plugins
│   ├── blocks-builtin/         # Core workflow blocks
│   ├── timer/                  # Timer blocks
│   ├── mock-devices/           # Mock IoT devices
│   └── example-echo/           # Example plugin
│
├── automations/                # YAML workflow files
│   └── *.yml
│
└── brika.yml                   # Hub configuration
```

---

## Core Components

### Hub Services

| Service            | File                               | Purpose                                    |
|--------------------|------------------------------------|--------------------------------------------|
| `PluginManager`    | `plugins/plugin-manager.ts`        | Plugin lifecycle, IPC, process supervision |
| `BlockRegistry`    | `blocks/block-registry.ts`         | Register blocks from plugins               |
| `EventBus`         | `events/event-bus.ts`              | Pub/sub event system with glob patterns    |
| `AutomationEngine` | `automations/automation-engine.ts` | Workflow management and execution          |
| `WorkflowExecutor` | `automations/workflow-executor.ts` | Execute reactive workflow blocks           |
| `SchedulerService` | `scheduler/scheduler-service.ts`   | Cron and interval scheduling               |
| `RulesEngine`      | `rules/rules-engine.ts`            | Event-triggered rule evaluation            |
| `StateStore`       | `state/state-store.ts`             | Persistent JSON state                      |
| `LogRouter`        | `logs/log-router.ts`               | Centralized logging with SSE               |
| `ApiServer`        | `http/api-server.ts`               | HTTP REST API                              |
| `ConfigLoader`     | `config/config-loader.ts`          | YAML configuration                         |

### Dependency Injection

Uses `tsyringe` with Angular-style `inject()`:

```typescript
import { singleton, inject } from "@brika/shared";

@singleton()
export class MyService {
  private readonly events = inject(EventBus);
  private readonly blocks = inject(BlockRegistry);
}
```

---

## Plugin System

### Plugin ID Format

Plugin IDs use the full package name from `package.json`:

```
@brika/plugin-timer              # Plugin ID
@brika/plugin-timer:timer        # Block ID (pluginId:blockId)
@brika/blocks-builtin:condition  # Block ID
```

### Plugin Structure

```
plugins/timer/
├── package.json              # With blocks array
├── icon.svg                  # Optional plugin icon
├── locales/                  # i18n translations
│   └── en/plugin.json
└── src/
    └── main.ts               # Entry: exports blocks
```

### package.json Schema

```json
{
  "$schema": "https://schema.brika.dev/plugin.schema.json",
  "name": "@brika/plugin-timer",
  "version": "0.2.0",
  "description": "Timer and countdown blocks",
  "author": "BRIKA Team",
  "keywords": ["timer", "countdown"],
  "type": "module",
  "main": "./src/main.ts",
  "exports": { ".": "./src/main.ts" },
  "blocks": [
    {
      "id": "timer",
      "name": "Timer",
      "description": "One-shot timer",
      "category": "trigger",
      "icon": "timer",
      "color": "#22c55e"
    }
  ],
  "dependencies": {
    "@brika/sdk": "workspace:*"
  }
}
```

### Defining Reactive Blocks

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
        z.object({ name: z.string(), duration: z.number() }),
        { name: "Completed" }
      ),
    },
    config: z.object({
      name: z.string().optional().describe("Timer name"),
      duration: z.duration(undefined, "Duration to wait"),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    inputs.trigger.on(() => {
      if (timeout) clearTimeout(timeout);

      log("info", `Timer started: ${config.duration}ms`);

      timeout = setTimeout(() => {
        outputs.completed.emit({
          name: config.name ?? "timer",
          duration: config.duration,
        });
        timeout = null;
      }, config.duration);
    });

    // Return cleanup function
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }
);

onStop(() => log("info", "Timer plugin stopping"));
log("info", "Timer plugin loaded");
```

### Plugin Lifecycle

1. Hub reads `package.json` to get plugin ID and block metadata
2. Plugin process spawned via `bun <entry>`
3. Plugin sends `hello` message with capabilities
4. Plugin registers blocks via IPC (runtime + package.json metadata merged)
5. Hub starts block instances when workflows run
6. Heartbeat ping/pong maintains health
7. On stop: graceful shutdown via IPC, then SIGTERM/SIGKILL

---

## Reactive Block Engine

### Block Types

| Block     | Category    | Purpose                        |
|-----------|-------------|--------------------------------|
| Clock     | `trigger`   | Periodic tick source           |
| Timer     | `trigger`   | One-shot delayed trigger       |
| Countdown | `trigger`   | Progress countdown             |
| Condition | `flow`      | If/else branching              |
| Switch    | `flow`      | Multi-way branching            |
| Delay     | `flow`      | Wait duration                  |
| Merge     | `flow`      | Combine inputs (wait for all)  |
| Split     | `flow`      | Send to multiple outputs       |
| Transform | `transform` | Extract/reshape data           |
| Log       | `action`    | Log message                    |
| HTTP      | `action`    | HTTP requests                  |
| End       | `action`    | Terminate workflow             |

### Workflow Format

```yaml
id: motion-lights
name: Motion Lights
enabled: true

blocks:
  - id: clock
    type: "@brika/blocks-builtin:clock"
    config:
      interval: 5000
    position: { x: 100, y: 100 }

  - id: log
    type: "@brika/blocks-builtin:log"
    config:
      message: "Tick received"
      level: info
    position: { x: 300, y: 100 }

connections:
  - from: clock
    fromPort: tick
    to: log
    toPort: in
```

### Port Types

| Type        | Description                           |
|-------------|---------------------------------------|
| `generic`   | Accepts any type, inferred at runtime |
| `passthrough` | Inherits type from specified input  |
| Zod schema  | Explicit type (number, object, etc.)  |

---

## IPC Protocol

Binary framed protocol over stdin/stdout:

```
┌──────────────┬────────────────────────────────────┐
│ Length (4B)  │ JSON Payload (variable)            │
│ big-endian   │                                    │
└──────────────┴────────────────────────────────────┘
```

### Message Types

| Type            | Direction    | Purpose                 |
|-----------------|--------------|-------------------------|
| `hello`         | Plugin → Hub | Plugin identification   |
| `ready`         | Plugin → Hub | Plugin ready            |
| `registerBlock` | Plugin → Hub | Register a block        |
| `startBlock`    | Hub → Plugin | Start block instance    |
| `stopBlock`     | Hub → Plugin | Stop block instance     |
| `pushInput`     | Hub → Plugin | Push data to input port |
| `blockEmit`     | Plugin → Hub | Block output emission   |
| `blockLog`      | Plugin → Hub | Block log message       |
| `log`           | Plugin → Hub | Plugin log message      |
| `emit`          | Plugin → Hub | Emit event              |
| `subscribe`     | Plugin → Hub | Subscribe to events     |
| `event`         | Hub → Plugin | Event notification      |
| `preferences`   | Hub → Plugin | Plugin configuration    |
| `ping`          | Hub → Plugin | Heartbeat               |
| `pong`          | Plugin → Hub | Heartbeat response      |
| `stop`          | Hub → Plugin | Shutdown request        |
| `uninstall`     | Hub → Plugin | Uninstall notification  |

---

## API Reference

### Endpoints

| Method | Endpoint                      | Description          |
|--------|-------------------------------|----------------------|
| GET    | `/api/health`                 | Health check         |
| GET    | `/api/stats`                  | Dashboard statistics |
| GET    | `/api/plugins`                | List plugins         |
| GET    | `/api/plugins/:id`            | Plugin details       |
| GET    | `/api/plugins/:id/icon`       | Plugin icon          |
| POST   | `/api/plugins/enable`         | Enable plugin        |
| POST   | `/api/plugins/disable`        | Disable plugin       |
| POST   | `/api/plugins/reload`         | Reload plugin        |
| GET    | `/api/blocks`                 | List all blocks      |
| GET    | `/api/blocks/categories`      | Blocks by category   |
| GET    | `/api/workflows`              | List workflows       |
| GET    | `/api/workflows/:id`          | Get workflow         |
| POST   | `/api/workflows`              | Save workflow        |
| DELETE | `/api/workflows/:id`          | Delete workflow      |
| POST   | `/api/workflows/enable`       | Enable workflow      |
| POST   | `/api/workflows/disable`      | Disable workflow     |
| GET    | `/api/workflows/:id/events`   | SSE workflow events  |
| GET    | `/api/events`                 | Query events         |
| POST   | `/api/events`                 | Emit event           |
| GET    | `/api/stream/logs`            | SSE log stream       |
| GET    | `/api/stream/events`          | SSE event stream     |

---

## Data Flow

### Block Execution Flow

```
Workflow Started
         ↓
    WorkflowExecutor.run()
         ↓
    For each block:
      1. PluginManager.startBlock()
      2. Plugin creates BlockInstance
      3. Hub pushes inputs via pushInput
      4. Block processes, emits via blockEmit
      5. Hub routes to connected blocks
         ↓
    Workflow running (reactive)
```

### Event Flow

```
Plugin.emit("motion.detected", payload)
         ↓ (IPC: emit)
    Hub.EventBus.emit()
         ↓
    ├─→ RulesEngine (evaluate matching rules)
    ├─→ AutomationEngine (trigger matching workflows)
    ├─→ Subscribed Plugins (forward via IPC)
    └─→ SSE Clients (real-time updates)
```

---

## Configuration

### brika.yml

```yaml
hub:
  port: 3001
  host: "0.0.0.0"

plugins:
  heartbeatInterval: 5000
  heartbeatTimeout: 15000

install:
  - ref: "workspace:blocks-builtin"
    enabled: true
  - ref: "workspace:timer"
    enabled: true
  - ref: "npm:@brika/plugin-hue"
    version: "^1.0.0"
    enabled: false

rules: []
schedules: []
```

### Plugin References

| Format       | Example                    | Description                  |
|--------------|----------------------------|------------------------------|
| `workspace:` | `workspace:timer`          | Local plugin in `./plugins/` |
| `npm:`       | `npm:@brika/plugin-hue`    | npm registry package         |
| `git:`       | `git:github.com/user/repo` | Git repository               |
| `file:`      | `file:./path/to/plugin`    | Direct file path             |
