# CLI Reference

Reference for the `create-brika` command-line tool.

## Installation

The CLI is available via `bun create`:

```bash
bun create brika [plugin-name] [options]
```

Or install globally:

```bash
bun add -g create-brika
```

## Usage

### Interactive Mode

Run without arguments to launch the interactive wizard:

```bash
bun create brika
```

The wizard prompts for:

1. **Plugin name** — kebab-case identifier (e.g., `my-plugin`)
2. **Description** — Brief description of your plugin
3. **Category** — Type of plugin (trigger, action, transform, flow)
4. **Author** — Your name (defaults to git config)

### With Plugin Name

Provide a name to skip the first prompt:

```bash
bun create brika my-plugin
```

### Options

| Option | Description |
|--------|-------------|
| `-h, --help` | Show help message |
| `--no-git` | Skip git repository initialization |
| `--no-install` | Skip dependency installation |

### Examples

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

## Generated Structure

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

### package.json

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

### src/index.ts

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

## Categories

When prompted for category, choose based on your plugin's purpose:

| Category | Description | Examples |
|----------|-------------|----------|
| `trigger` | Starts workflows | Timers, sensors, webhooks |
| `action` | Performs operations | Send message, control device |
| `transform` | Processes data | Map, filter, format |
| `flow` | Controls execution | Condition, delay, split |

## Next Steps

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
