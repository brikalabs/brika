# ELIA Architecture

> **ELIA** = **E**vent-driven **L**ogical **I**ntelligence **A**rchitecture

A Bun-first, plugin-first home automation runtime designed for stability and extensibility.

## Table of Contents

1. [System Overview](#system-overview)
2. [Monorepo Structure](#monorepo-structure)
3. [Core Components](#core-components)
4. [Plugin System](#plugin-system)
5. [Block-based Workflow Engine](#block-based-workflow-engine)
6. [IPC Protocol](#ipc-protocol)
7. [API Reference](#api-reference)
8. [Data Flow](#data-flow)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                              ELIA Hub                                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ API Server  │ │ EventBus    │ │ BlockReg    │ │ ToolReg     │   │
│  │ (HTTP/SSE)  │ │ (pub/sub)   │ │ (blocks)    │ │ (tools)     │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ Scheduler   │ │ RulesEngine │ │ Automations │ │ StateStore  │   │
│  │ (cron/int)  │ │ (triggers)  │ │ (workflows) │ │ (persist)   │   │
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
elia/
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
│   │           ├── http/                 # API server
│   │           ├── logs/                 # Centralized logging
│   │           ├── plugins/              # Plugin lifecycle manager
│   │           ├── rules/                # Rules engine
│   │           ├── scheduler/            # Cron/interval scheduler
│   │           ├── state/                # Persistent state
│   │           ├── store/                # Plugin store (npm)
│   │           └── tools/                # Tool registry
│   │
│   └── ui/                     # React frontend
│       └── src/
│           ├── components/ui/  # shadcn/ui components
│           ├── features/       # Feature modules
│           │   ├── dashboard/
│           │   ├── plugins/
│           │   ├── tools/
│           │   ├── workflows/  # React Flow editor
│           │   └── ...
│           └── lib/            # Utilities
│
├── packages/
│   ├── sdk/                    # Plugin SDK
│   │   └── src/
│   │       ├── blocks/         # Block definition API
│   │       ├── ipc.ts          # Binary IPC framing
│   │       ├── runtime.ts      # Plugin runtime
│   │       └── tool.ts         # Tool definition API
│   │
│   └── shared/                 # Shared types
│       └── src/
│           ├── di/             # Dependency injection
│           └── types.ts        # Wire-safe DTOs
│
├── plugins/                    # Local plugins
│   ├── blocks-builtin/         # Core workflow blocks
│   ├── timer/                  # Timer functionality
│   └── example-echo/           # Example plugin
│
├── automations/                # YAML workflow files
│   └── *.yml
│
└── elia.yml                    # Hub configuration
```

---

## Core Components

### Hub Services

| Service            | File                               | Purpose                                    |
|--------------------|------------------------------------|--------------------------------------------|
| `PluginManager`    | `plugins/plugin-manager.ts`        | Plugin lifecycle, IPC, process supervision |
| `ToolRegistry`     | `tools/tool-registry.ts`           | Register and call tools from plugins       |
| `BlockRegistry`    | `blocks/block-registry.ts`         | Register blocks for workflows              |
| `EventBus`         | `events/event-bus.ts`              | Pub/sub event system with glob patterns    |
| `AutomationEngine` | `automations/automation-engine.ts` | Workflow management and execution          |
| `WorkflowExecutor` | `automations/workflow-executor.ts` | Execute workflow blocks                    |
| `SchedulerService` | `scheduler/scheduler-service.ts`   | Cron and interval scheduling               |
| `RulesEngine`      | `rules/rules-engine.ts`            | Event-triggered rule evaluation            |
| `StateStore`       | `state/state-store.ts`             | Persistent JSON state                      |
| `LogRouter`        | `logs/log-router.ts`               | Centralized logging with SSE               |
| `ApiServer`        | `http/api-server.ts`               | HTTP REST API                              |
| `ConfigLoader`     | `config/config-loader.ts`          | YAML configuration                         |

### Dependency Injection

Uses `tsyringe` with Angular-style `inject()`:

```typescript
import { singleton, inject } from "@elia/shared";

@singleton()
export class MyService {
  private readonly events = inject(EventBus);
  private readonly tools = inject(ToolRegistry);
}
```

---

## Plugin System

### Plugin ID Format

Plugin IDs use the full package name from `package.json`:

```
@elia/plugin-timer          # Plugin ID
@elia/plugin-timer:set      # Tool ID (pluginId:toolId)
@elia/blocks-builtin:condition  # Block ID (pluginId:blockId)
```

### Plugin Structure

```
plugins/timer/
├── package.json              # With $schema for autocomplete
├── icon.png                  # Optional plugin icon
└── src/
    ├── index.ts              # Entry: exports tools
    ├── state.ts              # Shared runtime & state
    └── tools/
        ├── index.ts          # Barrel export
        ├── set.ts            # export const set = defineTool(...)
        ├── list.ts
        └── cancel.ts
```

### package.json Schema

```json
{
  "$schema": "../../packages/sdk/elia-plugin.schema.json",
  "name": "@elia/plugin-timer",
  "version": "0.1.0",
  "description": "Timer functionality",
  "author": "ELIA Team",
  "keywords": ["timer", "reminder"],
  "icon": "./icon.png",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@elia/sdk": "workspace:*"
  }
}
```

### Defining Tools

```typescript
import { defineTool, z } from "@elia/sdk";

export const set = defineTool({
  id: "set",
  description: "Set a timer",
  schema: z.object({
    name: z.string().optional().describe("Timer name"),
    seconds: z.number().min(1).max(86400).describe("Duration"),
  }),
}, async (args, ctx) => {
  // args is fully typed: { name?: string; seconds: number }
  return { ok: true, content: `Timer set for ${args.seconds}s` };
});
```

### Defining Blocks

```typescript
import { defineBlock, z, expr } from "@elia/sdk";

export const conditionBlock = defineBlock({
  id: "condition",
  name: "Condition",
  description: "Branch based on condition",
  category: "flow",
  icon: "git-branch",
  color: "#f59e0b",
  inputs: [{ id: "in", name: "Input" }],
  outputs: [
    { id: "then", name: "Then", type: "success" },
    { id: "else", name: "Else", type: "error" },
  ],
  schema: z.object({
    expression: z.string().describe("Expression to evaluate"),
  }),
}, async (config, ctx, runtime) => {
  const result = expr(config.expression, ctx);
  return { output: result ? "then" : "else", data: result };
});
```

### Plugin Lifecycle

1. Hub reads `package.json` to get plugin ID and metadata
2. Plugin process spawned via `bun <entry>`
3. Plugin sends `hello` message with capabilities
4. Plugin registers tools/blocks via IPC
5. Hub proxies tool calls and block executions
6. Heartbeat ping/pong maintains health
7. On stop: graceful shutdown via IPC, then SIGTERM/SIGKILL

---

## Block-based Workflow Engine

### Workflow YAML Format

```yaml
id: motion-lights
name: Motion Lights
enabled: true
trigger:
  event: motion.detected

blocks:
  - id: check-time
    type: "@elia/blocks-builtin:condition"
    config:
      expression: "{{ new Date().getHours() >= 18 }}"
    position: { x: 100, y: 100 }

  - id: turn-on
    type: "@elia/blocks-builtin:action"
    config:
      tool: "hue:light.on"
      args: { brightness: 100 }
    position: { x: 300, y: 50 }

connections:
  - from: check-time
    fromPort: then
    to: turn-on
    toPort: in
```

### Block Types

| Block     | ID          | Purpose                   |
|-----------|-------------|---------------------------|
| Action    | `action`    | Call a tool               |
| Condition | `condition` | If/else branching         |
| Switch    | `switch`    | Multi-way branching       |
| Delay     | `delay`     | Wait duration             |
| Set       | `set`       | Set workflow variable     |
| Log       | `log`       | Log message               |
| Emit      | `emit`      | Emit event                |
| Merge     | `merge`     | Combine paths             |
| Parallel  | `parallel`  | Split into parallel paths |
| End       | `end`       | Terminate workflow        |

### Expression Syntax

Use `{{ }}` for dynamic values:

```yaml
expression: "{{ trigger.payload.brightness > 50 }}"
message: "Motion in {{ trigger.payload.zone }}"
args:
  level: "{{ vars.brightness }}"
```

Available context:

- `trigger.type`, `trigger.payload`, `trigger.source`, `trigger.ts`
- `vars.*` - Workflow variables set by Set block
- `input` - Data from previous block
- `item`, `index` - Loop context

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

| Type            | Direction    | Purpose               |
|-----------------|--------------|-----------------------|
| `hello`         | Plugin → Hub | Plugin identification |
| `ready`         | Plugin → Hub | Plugin ready          |
| `registerTool`  | Plugin → Hub | Register a tool       |
| `registerBlock` | Plugin → Hub | Register a block      |
| `callTool`      | Hub → Plugin | Execute tool          |
| `toolResult`    | Plugin → Hub | Tool result           |
| `executeBlock`  | Hub → Plugin | Execute block         |
| `blockResult`   | Plugin → Hub | Block result          |
| `log`           | Plugin → Hub | Log message           |
| `emit`          | Plugin → Hub | Emit event            |
| `subscribe`     | Plugin → Hub | Subscribe to events   |
| `event`         | Hub → Plugin | Event notification    |
| `ping`          | Hub → Plugin | Heartbeat             |
| `pong`          | Plugin → Hub | Heartbeat response    |
| `stop`          | Hub → Plugin | Shutdown request      |

---

## API Reference

### Endpoints

| Method | Endpoint                     | Description          |
|--------|------------------------------|----------------------|
| GET    | `/api/health`                | Health check         |
| GET    | `/api/stats`                 | Dashboard statistics |
| GET    | `/api/plugins`               | List plugins         |
| GET    | `/api/plugins/:id`           | Plugin details       |
| GET    | `/api/plugins/:id/icon`      | Plugin icon          |
| POST   | `/api/plugins/enable`        | Enable plugin        |
| POST   | `/api/plugins/disable`       | Disable plugin       |
| POST   | `/api/plugins/reload`        | Reload plugin        |
| GET    | `/api/tools`                 | List tools           |
| POST   | `/api/tools/call`            | Call a tool          |
| GET    | `/api/blocks`                | List blocks          |
| GET    | `/api/blocks/categories`     | Blocks by category   |
| GET    | `/api/workflows`             | List workflows       |
| POST   | `/api/workflows`             | Save workflow        |
| POST   | `/api/workflows/:id/trigger` | Trigger workflow     |
| GET    | `/api/events`                | Query events         |
| POST   | `/api/events`                | Emit event           |
| GET    | `/api/schedules`             | List schedules       |
| GET    | `/api/rules`                 | List rules           |
| GET    | `/api/stream/logs`           | SSE log stream       |
| GET    | `/api/stream/events`         | SSE event stream     |

---

## Data Flow

### Tool Call Flow

```
UI/API → Hub.ApiServer → ToolRegistry.call()
                              ↓
                         PluginManager.callTool()
                              ↓ (IPC: callTool)
                         Plugin Process
                              ↓
                         Tool Handler
                              ↓ (IPC: toolResult)
                         Hub ← Result
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

### Workflow Execution Flow

```
Event matches trigger
         ↓
    AutomationEngine.trigger()
         ↓
    WorkflowExecutor.run()
         ↓
    ┌─────────────────────────┐
    │ For each block:         │
    │   1. Resolve block type │
    │   2. Send to plugin     │
    │   3. Get result         │
    │   4. Follow output port │
    └─────────────────────────┘
         ↓
    Workflow complete
```

---

## Configuration

### elia.yml

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
  - ref: "npm:@elia/plugin-hue"
    version: "^1.0.0"
    enabled: false

rules: []
schedules: []
```

### Plugin References

| Format       | Example                    | Description                  |
|--------------|----------------------------|------------------------------|
| `workspace:` | `workspace:timer`          | Local plugin in `./plugins/` |
| `npm:`       | `npm:@elia/plugin-hue`     | npm registry package         |
| `git:`       | `git:github.com/user/repo` | Git repository               |
| `file:`      | `file:./path/to/plugin.ts` | Direct file path             |



