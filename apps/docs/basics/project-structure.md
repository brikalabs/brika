# Project Structure

BRIKA is organized as a Bun monorepo with workspaces.

## Directory Layout

```
brika/
├── apps/
│   ├── hub/              # Bun runtime (API, plugins, workflows)
│   ├── ui/               # React frontend (TanStack, React Flow)
│   ├── registry/         # Plugin registry (Cloudflare Worker)
│   └── schema-cdn/       # Schema CDN (Cloudflare Worker)
├── packages/
│   ├── sdk/              # Plugin SDK
│   ├── flow/             # Reactive streams library
│   ├── events/           # Event system
│   ├── ipc/              # Binary IPC protocol
│   ├── shared/           # Shared types & dependency injection
│   ├── router/           # HTTP router
│   └── schema/           # JSON Schema generation
├── plugins/
│   ├── blocks-builtin/   # Core blocks (condition, delay, log, etc.)
│   ├── timer/            # Timer & countdown blocks
│   └── example-echo/     # Example plugin
├── workflows/            # Workflow YAML files
└── docs/                 # Documentation
```

## Apps

### Hub (`apps/hub/`)

The core runtime that:

* Loads and manages plugins via IPC
* Executes workflows
* Provides the REST API
* Handles the event bus

### UI (`apps/ui/`)

React-based frontend featuring:

* Visual workflow editor with React Flow
* Dashboard and plugin management
* TanStack Router and Query
* shadcn/ui components

### Registry (`apps/registry/`)

Cloudflare Worker that serves the verified plugins registry.

### Schema CDN (`apps/schema-cdn/`)

Cloudflare Worker that serves JSON schemas for IDE validation.

## Packages

### SDK (`packages/sdk/`)

The plugin development kit providing:

* `defineReactiveBlock` for creating blocks
* Reactive operators (map, filter, delay, etc.)
* Logging and event APIs
* Lifecycle hooks

### Flow (`packages/flow/`)

Reactive streams library used internally by the SDK.

### Events (`packages/events/`)

Event system with glob pattern matching for pub/sub.

### IPC (`packages/ipc/`)

Binary IPC protocol for hub-plugin communication.

### Shared (`packages/shared/`)

Shared utilities:

* Dependency injection (`@singleton`, `inject`)
* Common types

## Plugins

### blocks-builtin

Core workflow blocks:

* Condition (if/else branching)
* Delay (wait before continuing)
* Log (output to logs)
* Merge (combine inputs)

### timer

Timer-related blocks:

* Countdown timers
* Interval triggers

### example-echo

Example plugin demonstrating SDK usage.

## Key Files

| File | Purpose |
|------|---------|
| `brika.yml` | Main configuration |
| `workflows/*.yml` | Workflow definitions |
| `apps/hub/src/main.ts` | Hub entry point |
| `apps/ui/src/main.tsx` | UI entry point |
| `plugins/*/src/index.ts` | Plugin entry points |
| `packages/sdk/src/index.ts` | SDK exports |
