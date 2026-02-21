# CLI Reference

## BRIKA CLI

The `brika` command-line tool manages the hub, plugins, and browser access.

### Installation

#### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/maxscharwath/brika/master/scripts/install.sh | sh
```

#### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/maxscharwath/brika/master/scripts/install.ps1 | iex
```

The installer downloads the binary for your platform, places it in `~/.brika/bin/`, and adds it to your shell PATH. A bundled Bun runtime is included.

### Commands

| Command | Description |
|---------|-------------|
| `brika start` | Start the hub (detaches by default) |
| `brika stop` | Stop a running hub in the current directory |
| `brika status` | Show whether the hub is running |
| `brika open` | Open the web UI in the default browser |
| `brika plugin` | Manage plugins (install, uninstall, list) |
| `brika version` | Show version and platform info |
| `brika update` | Update to the latest release in-place |
| `brika uninstall` | Remove BRIKA from this machine |
| `brika help` | Show help |

### `brika start`

Start the hub. By default the process detaches into the background.

| Flag | Description |
|------|-------------|
| `-p, --port <port>` | Listen port (default: `3001`) |
| `--host <addr>` | Listen address (default: `127.0.0.1`) |
| `-f, --foreground` | Keep attached to terminal |
| `-o, --open` | Open the UI in the default browser after start |

```bash
brika start --open             # Start and open the UI
brika start -p 8080            # Start on port 8080
brika start --host 0.0.0.0    # Listen on all interfaces
brika start --foreground       # Stay attached to terminal
```

### `brika stop`

Stop the hub running in the current directory. Uses the PID stored in `.brika/brika.pid`.

### `brika status`

Show whether the hub is running and its PID.

### `brika open`

Open the web UI in the default browser. The hub must be running.

### `brika plugin`

Manage plugins via the hub's HTTP API. The hub must be running.

| Subcommand | Description |
|------------|-------------|
| `brika plugin install <name>[@version]` | Install a plugin from the registry |
| `brika plugin uninstall <name>` | Uninstall a plugin |
| `brika plugin list` | List installed plugins |
| `brika plugin help` | Show plugin subcommand help |

```bash
brika plugin install @brika/plugin-timer           # Install a plugin
brika plugin install @brika/plugin-timer@1.0.0     # Install a specific version
brika plugin uninstall @brika/plugin-timer          # Uninstall a plugin
brika plugin list                                   # List installed plugins
```

### `brika version`

Show BRIKA version and platform information.

### `brika update`

Update BRIKA to the latest release in-place.

### `brika uninstall`

Remove BRIKA from this machine. Removes the install directory and cleans up shell PATH entries.

| Flag | Description |
|------|-------------|
| `--purge` | Also remove the `.brika/` workspace directory (config, plugins, logs) |

```bash
brika uninstall            # Remove binary + clean PATH
brika uninstall --purge    # Also delete .brika/ workspace data
```

### Global Flags

| Flag | Description |
|------|-------------|
| `-v, --version` | Print version number |
| `-h, --help` | Show help |

---

## `create-brika` CLI

Reference for the `create-brika` plugin scaffolding tool.

### Installation

The CLI is available via `bun create`:

```bash
bun create brika [plugin-name] [options]
```

Or install globally:

```bash
bun add -g create-brika
```

### Usage

#### Interactive Mode

Run without arguments to launch the interactive wizard:

```bash
bun create brika
```

The wizard prompts for:

1. **Plugin name** — kebab-case identifier (e.g., `my-plugin`)
2. **Description** — Brief description of your plugin
3. **Category** — Type of plugin (trigger, action, transform, flow)
4. **Author** — Your name (defaults to git config)

#### With Plugin Name

Provide a name to skip the first prompt:

```bash
bun create brika my-plugin
```

#### Options

| Option | Description |
|--------|-------------|
| `-h, --help` | Show help message |
| `--no-git` | Skip git repository initialization |
| `--no-install` | Skip dependency installation |

#### Examples

```bash
# Interactive mode
bun create brika

# Create with name
bun create brika my-plugin

# Skip git init
bun create brika my-plugin --no-git

# Skip dependency installation
bun create brika my-plugin --no-install

# Skip both
bun create brika my-plugin --no-git --no-install
```

### Generated Structure

The CLI creates the following structure:

```
my-plugin/
├── package.json          # Plugin manifest with blocks
├── tsconfig.json         # TypeScript configuration
├── README.md             # Documentation
├── .gitignore            # Git ignore patterns
├── src/
│   └── index.ts          # Block definitions
└── locales/
    └── en/
        └── plugin.json   # i18n translations
```

#### package.json

The generated `package.json` includes:

```json
{
  "$schema": "https://schema.brika.dev/plugin.schema.json",
  "name": "@brika/plugin-my-plugin",
  "version": "0.1.0",
  "description": "Your description",
  "blocks": [
    {
      "id": "my-plugin",
      "name": "MyPlugin",
      "description": "Your description",
      "category": "action",
      "icon": "box",
      "color": "#3b82f6"
    }
  ],
  "dependencies": {
    "@brika/sdk": "^0.2.0"
  }
}
```

#### src/index.ts

The generated entry point includes a starter block:

```typescript
import {
  defineReactiveBlock,
  input,
  log,
  onStop,
  output,
  z,
} from "@brika/sdk";

export const myPlugin = defineReactiveBlock(
  {
    id: "my-plugin",
    inputs: {
      in: input(z.generic(), { name: "Input" }),
    },
    outputs: {
      out: output(z.passthrough("in"), { name: "Output" }),
    },
    config: z.object({
      enabled: z.boolean().default(true).describe("Enable processing"),
    }),
  },
  ({ inputs, outputs, config }) => {
    inputs.in.on((data) => {
      if (!config.enabled) return;
      log.info("Processing data", { data });
      outputs.out.emit(data);
    });
  }
);

onStop(() => log.info("Plugin stopping"));
log.info("Plugin loaded");
```

### Categories

When prompted for category, choose based on your plugin's purpose:

| Category | Description | Examples |
|----------|-------------|----------|
| `trigger` | Starts workflows | Timers, sensors, webhooks |
| `action` | Performs operations | Send message, control device |
| `transform` | Processes data | Map, filter, format |
| `flow` | Controls execution | Condition, delay, split |

### Next Steps

After creating your plugin:

```bash
cd my-plugin
bun link          # Link for local development
bun run tsc       # Type check
```

Then add it to your `brika.yml`:

```yaml
plugins:
  - path: ./my-plugin
```

See [Create a Plugin](../plugins/create-plugin.md) for more details.
