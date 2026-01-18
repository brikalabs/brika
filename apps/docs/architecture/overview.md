# System Overview

BRIKA is a Bun-first home automation runtime with reactive block-based visual workflows.

## High-Level Architecture

```mermaid
flowchart TB
    subgraph UI [UI - React]
        Dashboard
        PluginsUI[Plugins]
        WorkflowEditor[Workflow Editor]
    end

    subgraph Hub [Hub - Bun]
        APIServer[API Server]
        EventBus[Event Bus]
        WorkflowExecutor[Workflow Executor]
        PluginManager[Plugin Manager]
    end

    subgraph Plugins [Plugins - Isolated Processes]
        Timer[Timer Plugin]
        Builtin[Builtin Blocks]
        Custom[Custom Plugin]
    end

    UI -->|HTTP/SSE| Hub
    Hub -->|Binary IPC| Plugins
```

## Core Components

### Hub

The central runtime that orchestrates everything:

* **API Server** — REST API and SSE for real-time updates
* **Event Bus** — Pub/sub messaging with glob patterns
* **Workflow Executor** — Runs block-based automations
* **Plugin Manager** — Loads and manages plugin processes

**Key files:**

* `apps/hub/src/main.ts` — Entry point
* `apps/hub/src/runtime/http/api-server.ts` — API endpoints
* `apps/hub/src/runtime/plugins/plugin-manager.ts` — Plugin loading
* `apps/hub/src/runtime/automations/workflow-executor.ts` — Workflow execution

### UI

React-based frontend with:

* **Dashboard** — Overview and statistics
* **Plugin Manager** — Browse and configure plugins
* **Workflow Editor** — Visual block-based editor (React Flow)
* **Logs Viewer** — Real-time log streaming

**Key files:**

* `apps/ui/src/main.tsx` — Entry point
* `apps/ui/src/features/` — Feature modules

### Plugins

Isolated processes that provide blocks:

* Run in separate Bun processes
* Communicate via binary IPC
* Define reactive blocks for workflows
* Access event bus for messaging

**Key files:**

* `packages/sdk/src/index.ts` — SDK exports
* `plugins/*/src/main.ts` — Plugin entry points

## Data Flow

### 1. Plugin Loading

```mermaid
flowchart TD
    A[Hub starts] --> B[Plugin Manager reads brika.yml]
    B --> C[For each plugin]
    C --> D[Spawn Bun process]
    C --> E[Establish IPC channel]
    C --> F[Register blocks]
    D & E & F --> G[Plugins ready]
```

### 2. Workflow Execution

```mermaid
flowchart TD
    A[User creates workflow in UI] --> B[Workflow saved to automations/*.yml]
    B --> C[Workflow Executor loads workflow]
    C --> D[Trigger: event, schedule, or manual]
    D --> E[Instantiate blocks]
    D --> F[Connect inputs/outputs]
    D --> G[Execute reactive flow]
    E & F & G --> H[Blocks process data]
    H --> I[Results emitted to outputs]
```

### 3. Event Flow

```mermaid
flowchart TD
    A[Plugin emits event] --> B[IPC message to Hub]
    B --> C[Event Bus receives event]
    C --> D[Match against subscriptions]
    D --> E[Forward to matching subscribers]
    E --> F[Subscribers handle event]
```

## Communication Protocols

### HTTP API

RESTful API for CRUD operations:

```
GET  /api/plugins        # List plugins
GET  /api/workflows      # List workflows
POST /api/workflows      # Create workflow
GET  /api/health         # Health check
```

### SSE (Server-Sent Events)

Real-time streaming for:

* Log entries
* Plugin status
* Workflow execution events

### Binary IPC

Efficient communication between hub and plugins:

* Message passing (not shared memory)
* Structured binary protocol
* Low latency, high throughput

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun, TypeScript |
| Validation | Zod |
| Frontend | React, Vite, TanStack |
| UI Components | shadcn/ui, Tailwind CSS |
| Workflow Editor | React Flow |
| IPC | Custom binary protocol |

## Scalability

### Current Design

* Single hub process
* Multiple plugin processes
* In-memory event bus
* File-based workflow storage

### Future Considerations

* Distributed hub (multiple instances)
* Persistent event store
* Database-backed workflows
* Remote plugin execution
