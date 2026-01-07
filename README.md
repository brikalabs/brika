# BRIKA

[![Docker](https://img.shields.io/badge/Docker-maxscharwath%2Fbrika-blue?logo=docker)](https://hub.docker.com/r/maxscharwath/brika)

A Bun-first home automation runtime with reactive block-based visual workflows.

## Features

- **Reactive Blocks** — Type-safe workflow blocks with Zod schemas and reactive streams
- **Isolated Plugins** — Each plugin runs in a separate process with binary IPC
- **Visual Editor** — Block-based automation builder with React Flow
- **Event-driven** — Pub/sub event bus with glob pattern matching

## Quick Start

```bash
bun install
bun run dev
```

- **UI**: http://localhost:5173
- **API**: http://localhost:3001/api/health

## Docker

Run BRIKA with Docker:

```bash
docker run -d \
  --name brika \
  -p 3001:3001 \
  -v ./config:/app/.brika \
  maxscharwath/brika:latest
```

The UI and API are available at http://localhost:3001

### Docker Compose

```yaml
services:
  brika:
    image: maxscharwath/brika:latest
    container_name: brika
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./config:/app/.brika
```

```bash
docker compose up -d
```

## Project Structure

```
brika/
├── apps/
│   ├── hub/          # Bun runtime (API, plugins, workflows)
│   └── ui/           # React frontend (TanStack, React Flow)
├── packages/
│   ├── sdk/          # Plugin SDK
│   ├── flow/         # Reactive streams
│   ├── events/       # Event system
│   ├── ipc/          # Binary IPC protocol
│   └── shared/       # Shared types & DI
├── plugins/
│   ├── blocks-builtin/   # Core blocks (condition, delay, log, etc.)
│   ├── timer/            # Timer & countdown blocks
│   └── example-echo/     # Example plugin
└── docs/
```

## Creating a Plugin

```typescript
// plugins/my-plugin/src/main.ts
import { defineReactiveBlock, input, output, log, onStop, z } from "@brika/sdk";

export const greet = defineReactiveBlock(
  {
    id: "greet",
    inputs: {
      trigger: input(z.generic(), { name: "Trigger" }),
    },
    outputs: {
      message: output(z.string(), { name: "Message" }),
    },
    config: z.object({
      name: z.string().default("World"),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    inputs.trigger.on(() => {
      log("info", `Greeting ${config.name}`);
      outputs.message.emit(`Hello, ${config.name}!`);
    });
  }
);

onStop(() => log("info", "Stopping"));
log("info", "Plugin loaded");
```

```json
{
  "name": "@brika/plugin-my-plugin",
  "version": "0.1.0",
  "main": "./src/main.ts",
  "blocks": [
    { "id": "greet", "name": "Greet", "category": "action", "icon": "hand", "color": "#3b82f6" }
  ],
  "dependencies": { "@brika/sdk": "workspace:*" }
}
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [SDK Reference](packages/sdk/README.md)

## Tech Stack

| Layer    | Stack                              |
|----------|------------------------------------|
| Runtime  | Bun, TypeScript, Zod               |
| Frontend | React, Vite, TanStack, React Flow  |
| UI       | shadcn/ui, Tailwind CSS v4         |

## License

MIT
