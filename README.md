# ELIA

> **E**vent-driven **L**ogical **I**ntelligence **A**rchitecture

A Bun-first, plugin-first home automation runtime with block-based visual workflows.

## Features

- **Isolated Plugins** - Each plugin runs as a separate Bun process with binary IPC
- **Block-based Workflows** - Visual automation builder using React Flow
- **Event-driven** - Pub/sub event bus with glob pattern matching
- **Type-safe Tools** - Zod-validated tool definitions with full TypeScript support
- **Modern UI** - React + TanStack Router/Query + shadcn/ui

## Quick Start

```bash
# Install dependencies
bun install

# Start Hub + UI
bun run dev

# Or run separately:
bun run --cwd apps/hub dev    # Hub on :3001
bun run --cwd apps/ui dev     # UI on :5173
```

Open:
- **Hub API**: http://localhost:3001/api/health
- **UI**: http://localhost:5173

## Project Structure

```
elia/
├── apps/
│   ├── hub/          # Bun runtime (API, plugins, automations)
│   └── ui/           # React frontend
├── packages/
│   ├── sdk/          # Plugin SDK (@elia/sdk)
│   └── shared/       # Shared types (@elia/shared)
├── plugins/          # Local plugins
│   ├── blocks-builtin/   # Core workflow blocks
│   ├── timer/            # Timer functionality
│   └── example-echo/     # Example plugin
├── automations/      # YAML workflow files
├── elia.yml          # Hub configuration
└── docs/             # Documentation
```

## Creating a Plugin

```typescript
// plugins/my-plugin/src/index.ts
import { createPluginRuntime, defineTool, z } from "@elia/sdk";

const { api, start, use } = createPluginRuntime({
  id: "@elia/plugin-my-plugin",
  version: "0.1.0",
});

export const greet = defineTool({
  id: "greet",
  description: "Greet someone",
  schema: z.object({
    name: z.string().describe("Name to greet"),
  }),
}, async (args) => {
  return { ok: true, content: `Hello, ${args.name}!` };
});

use(greet);
await start();
```

Add to `elia.yml`:

```yaml
install:
  - ref: "workspace:my-plugin"
    enabled: true
```

## Creating a Workflow

```yaml
# automations/hello.yml
id: hello-workflow
name: Hello World
enabled: true
trigger:
  event: button.pressed

blocks:
  - id: log-it
    type: "@elia/blocks-builtin:log"
    config:
      message: "Button was pressed!"
      level: info
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - Detailed system design
- [Agent Guide](docs/agent.md) - AI assistant reference

## Tech Stack

| Layer         | Technology                        |
|---------------|-----------------------------------|
| Runtime       | Bun                               |
| Backend       | TypeScript, Zod                   |
| Frontend      | React, Vite, TanStack, React Flow |
| UI Components | shadcn/ui, Tailwind CSS v4        |
| DI            | tsyringe                          |

## License

MIT
