<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/7239873c-b9f8-4b7b-97e8-d3e6d2dcd642">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/0b551246-0b02-40ab-aef4-9ded18583a33">
    <img alt="BRIKA" src="https://github.com/user-attachments/assets/0b551246-0b02-40ab-aef4-9ded18583a33" width="250">
  </picture>
</p>

<p align="center"><strong>Build. Run. Integrate. Keep Automating.</strong></p>

<p align="center">
  <a href="https://github.com/brikalabs/brika/pkgs/container/brika"><img alt="Docker" src="https://img.shields.io/badge/GHCR-brikalabs%2Fbrika-blue?logo=github"></a>
  <a href="https://docs.brika.dev"><img alt="Docs" src="https://img.shields.io/badge/Docs-docs.brika.dev-blue?logo=gitbook&logoColor=white"></a>
  <a href="https://bun.sh"><img alt="Bun" src="https://img.shields.io/badge/Runtime-Bun-f472b6?logo=bun&logoColor=white"></a>
  <a href="#license"><img alt="License" src="https://img.shields.io/badge/License-MIT-green"></a>
</p>

A self-hosted automation hub that runs locally on your machine. Write type-safe plugins, build reactive workflows, design live dashboards, and control everything through a web UI — all in a single self-contained binary.

- **Reactive Blocks** — Type-safe workflow nodes with Zod schemas and composable stream operators
- **Client-Rendered Bricks** — Dashboard components written as real React, compiled to browser ESM with scoped Tailwind
- **Isolated Plugins** — Each plugin runs in a separate Bun process with binary IPC — crash one, the rest keep running
- **Visual Editor** — Drag-and-drop workflow builder powered by React Flow
- **Typed Actions** — Define server-side functions, call them from the browser — IDs auto-generated at build time

---

## Installation

### macOS / Linux

```sh
curl -fsSL https://brika.dev/install.sh | bash
```

### Windows (PowerShell)

```powershell
iwr -useb https://brika.dev/install.ps1 | iex
```

### Docker

```sh
docker run -d -p 3001:3001 --name brika ghcr.io/brikalabs/brika
```

The installer downloads the binary for your platform, places it in `~/.brika/bin/` (or `%LOCALAPPDATA%\brika\bin\` on Windows), and adds it to your shell PATH. A bundled Bun runtime is included — no separate Node.js or Bun install needed.

---

## Quick Start

```sh
# Start the hub and open the web UI
brika start --open

# Or start first, open later
brika start
brika open

# Stop the hub
brika stop
```

On first start BRIKA creates a `.brika/` directory in the current working directory containing configuration, installed plugins, and logs.

---

## Commands

| Command              | Description                                                              |
|----------------------|--------------------------------------------------------------------------|
| `brika start`        | Start the hub (detaches by default)                                      |
| `brika stop`         | Stop a running hub                                                       |
| `brika restart`      | Restart the running hub                                                  |
| `brika status`       | Show whether the hub is running                                          |
| `brika open`         | Open the web UI in the default browser                                   |
| `brika log`          | Show and search application logs                                         |
| `brika auth`         | Manage authentication and tokens                                         |
| `brika plugin`       | Manage plugins (install, uninstall, list)                                |
| `brika version`      | Show version and platform info                                           |
| `brika update`       | Update to the latest version                                             |
| `brika uninstall`    | Remove BRIKA from this machine (`--purge` to also delete `.brika/` data) |
| `brika completions`  | Set up shell tab-completion (bash, zsh, fish)                            |
| `brika help`         | Show help for a command                                                  |

### Start Flags

| Flag                   | Description                                    |
|------------------------|------------------------------------------------|
| `-p, --port <port>`    | Listen port (default: `3001`)                  |
| `--host <addr>`        | Listen address (default: `127.0.0.1`)          |
| `-f, --foreground`     | Keep attached to terminal (default: detach)    |
| `-o, --open`           | Open the UI in the default browser after start |

### Log Flags

| Flag                      | Description                                    |
|---------------------------|------------------------------------------------|
| `-f, --follow`            | Live tail via SSE (Ctrl+C to stop)             |
| `-l, --level <level>`     | Filter by level (debug, info, warn, error)     |
| `-s, --source <source>`   | Filter by source (hub, plugin, ...)            |
| `-p, --plugin <name>`     | Filter by plugin name                          |
| `-q, --search <text>`     | Search text in messages                        |
| `-n, --limit <count>`     | Number of logs to show (default: 50)           |
| `--clear`                 | Clear all stored logs                          |

### Global Flags

| Flag                 | Description                      |
|----------------------|----------------------------------|
| `-C, --cwd <path>`  | Set the `.brika` data directory  |
| `-v, --version`      | Print version number             |
| `-h, --help`         | Show help                        |
| `--no-color`         | Disable colored output           |

```sh
brika start --open             # Start and open the UI
brika start -p 8080            # Start on port 8080
brika start --host 0.0.0.0    # Listen on all interfaces (e.g. Docker/VM)
brika start --foreground       # Stay attached to terminal
brika status                   # Check if hub is running
brika log                      # Show recent logs
brika log -f                   # Live tail logs
brika log --level error -n 100 # Last 100 error logs
brika update                   # Update to latest version
brika completions              # Install shell completions
```

### Plugin Management

Manage plugins directly from the CLI. The hub must be running.

```sh
brika plugin install @brika/plugin-timer           # Install a plugin
brika plugin install @brika/plugin-timer@1.0.0     # Install a specific version
brika plugin uninstall @brika/plugin-timer          # Uninstall a plugin
brika plugin list                                   # List installed plugins
brika plugin help                                   # Show plugin subcommand help
```

### Authentication

Manage users and access tokens.

```sh
brika auth user add          # Create a new user
brika auth user edit         # Edit an existing user
brika auth user list         # List all users
brika auth user delete       # Delete a user
```

---

## Configuration

On first start BRIKA creates `.brika/brika.yml` with defaults. Edit it to change the hub settings or add plugins:

```yaml
hub:
  port: 3001
  host: 127.0.0.1
  plugins:
    installDir: ./plugins/.installed
    heartbeatInterval: 5000    # ms between plugin health checks
    heartbeatTimeout: 15000    # ms before a plugin is considered unresponsive

plugins:
  "@brika/plugin-timer":
    version: "^1.0.0"
  my-local-plugin:
    version: "workspace:./plugins/my-plugin"

rules: []
schedules: []
```

Environment variables override config file values:

| Variable           | Description                         | Default     |
|--------------------|-------------------------------------|-------------|
| `BRIKA_PORT`       | Listen port                         | `3001`      |
| `BRIKA_HOST`       | Listen address                      | `127.0.0.1` |
| `BRIKA_HOME`       | Override `.brika` directory path    | `.brika`    |
| `BRIKA_STATIC_DIR` | Serve custom UI from this directory | *(bundled)* |
| `BRIKA_BUN_PATH`   | Path to Bun binary for plugins      | *(bundled)* |

---

## Process Management

`brika start` detaches the hub into the background by default. Use `--foreground` to keep it attached. The hub writes its PID to `.brika/brika.pid` on startup so `brika stop` and `brika status` can track it.

Starting a second instance in the same directory is rejected immediately:

```
Error: Another instance of Brika is already running in this directory (PID 12345).
Run 'brika stop' to stop it first.
```

---

## Installed Files

| Path                    | Description                            |
|-------------------------|----------------------------------------|
| `~/.brika/bin/brika`    | The BRIKA binary                       |
| `~/.brika/bin/bun`      | Bundled Bun runtime (used by plugins)  |
| `~/.brika/bin/ui/`      | Bundled web UI static files            |
| `~/.brika/bin/locales/` | Bundled UI translations                |
| `.brika/`               | Workspace directory (per project)      |
| `.brika/brika.yml`      | Hub configuration                      |
| `.brika/brika.pid`      | PID of the running hub                 |
| `.brika/logs/`          | Log files                              |
| `.brika/plugins/`       | Installed plugins                      |

On Windows the install directory is `%LOCALAPPDATA%\brika\bin\`.

---

## Docker

```bash
docker run -d \
  --name brika \
  -p 3001:3001 \
  -v ./config:/app/.brika \
  ghcr.io/brikalabs/brika:latest
```

### Docker Compose

```yaml
services:
  brika:
    image: ghcr.io/brikalabs/brika:latest
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

---

## Creating a Plugin

Plugins provide **blocks** (workflow nodes) and **bricks** (dashboard components). Scaffold one instantly:

```sh
bun create brika my-plugin
```

### Blocks — server-side workflow logic

```typescript
// src/index.ts — runs in an isolated Bun process
import { defineReactiveBlock, input, output, log, onStop, z } from "@brika/sdk";
import { setBrickData, onInit } from "@brika/sdk";

export const greet = defineReactiveBlock(
  {
    id: "greet",
    inputs: { trigger: input(z.generic(), { name: "Trigger" }) },
    outputs: { message: output(z.string(), { name: "Message" }) },
    config: z.object({ name: z.string().default("World") }),
  },
  ({ inputs, outputs, config }) => {
    inputs.trigger.on(() => {
      outputs.message.emit(`Hello, ${config.name}!`);
    });
  }
);

// Push data to client-rendered bricks
onInit(() => setBrickData("status", { greeting: "Hello!" }));

onStop(() => log.info("Stopping"));
log.info("Plugin loaded");
```

### Bricks — client-rendered dashboard UI

```tsx
// src/bricks/status.tsx — real React, runs in the browser
import { useBrickData } from "@brika/sdk/brick-views";

interface StatusData { greeting: string; }

export default function Status() {
  const data = useBrickData<StatusData>();
  if (!data) return <div className="p-4 text-muted-foreground">Loading...</div>;
  return <div className="p-4 text-2xl font-bold">{data.greeting}</div>;
}
```

```json
{
  "name": "@brika/plugin-my-plugin",
  "version": "0.1.0",
  "main": "./src/index.ts",
  "blocks": [
    { "id": "greet", "name": "Greet", "category": "action", "icon": "hand", "color": "#3b82f6" }
  ],
  "bricks": [
    { "id": "status", "name": "Status" }
  ],
  "dependencies": { "@brika/sdk": "workspace:*" }
}
```

---

## Development

Prerequisites: [Bun](https://bun.sh) ≥ 1.2

```sh
bun install              # Install dependencies

bun run dev              # Start hub + UI in dev mode (hot reload)
bun test                 # Run all tests
bun run build            # Build the standalone binary (output: apps/hub/dist/)
```

Or target a specific app:

```sh
bun run dev --filter=@brika/hub   # Hub only
bun run dev --filter=@brika/ui    # UI only (http://localhost:5173)
```

### Project Structure

```
apps/
  hub/              Hub server (Bun, TypeScript)
  ui/               Web UI (React, Vite)
packages/
  sdk/              Plugin SDK (blocks, bricks, actions, stores)
  compiler/         Build-time tooling (brick ESM, action IDs, Tailwind)
  di/               Dependency injection
  router/           HTTP router
  events/           Event system
  ipc/              Binary IPC protocol
  shared/           Shared types
plugins/
  blocks-builtin/   Core blocks (condition, delay, log, …)
  timer/            Timer & countdown blocks
  weather/          Weather dashboard bricks
  matter/           Matter/Thread smart home
  spotify/          Spotify integration
scripts/
  install.sh        Linux/macOS installer
  install.ps1       Windows installer
  uninstall.sh      Linux/macOS uninstaller
  uninstall.ps1     Windows uninstaller
```

---

## Tech Stack

| Layer    | Stack                                          |
|----------|------------------------------------------------|
| Runtime  | Bun, TypeScript, Zod v4                        |
| Frontend | React, Vite, TanStack Router/Query, React Flow |
| UI       | shadcn/ui, Tailwind CSS v4                     |
| Compiler | @brika/compiler (Bun.build)                    |
| IPC      | Custom binary protocol                         |

## Documentation

Full docs at **[docs.brika.dev](https://docs.brika.dev)** — architecture, SDK reference, plugin guides, and more.

## License

MIT
