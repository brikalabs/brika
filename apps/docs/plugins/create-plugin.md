# Create a Plugin

This guide walks you through creating your first BRIKA plugin.

## Prerequisites

* [Bun](https://bun.sh/) 1.0 or later
* Basic TypeScript knowledge

## Quick Start with CLI

The fastest way to create a new plugin is using the CLI:

```bash
bun create brika my-plugin
```

This launches an interactive wizard that:

1. Asks for plugin details (name, description, category, author)
2. Creates the complete plugin structure
3. Installs dependencies
4. Initializes a git repository

### CLI Options

```bash
# Interactive mode (prompts for all options)
bun create brika

# With plugin name
bun create brika my-plugin

# Skip git and dependency installation
bun create brika my-plugin --no-git --no-install

# Show help
bun create brika --help
```

### What Gets Created

```
my-plugin/
├── package.json          # Plugin manifest with blocks
├── tsconfig.json         # TypeScript configuration
├── README.md             # Documentation
├── .gitignore
├── src/
│   └── index.ts          # Block definitions
└── locales/
    ├── en/
    │   └── plugin.json   # English translations
    └── fr/
        └── plugin.json   # French translations
```

## Manual Setup

If you prefer to create a plugin manually, follow these steps:

### Step 1: Create Plugin Directory

```bash
mkdir -p plugins/my-plugin/src
cd plugins/my-plugin
```

### Step 2: Create package.json

Create `package.json` with the plugin manifest:

```json
{
  "$schema": "https://schema.brika.dev/plugin.schema.json",
  "name": "@brika/plugin-my-plugin",
  "version": "0.1.0",
  "displayName": "MyPlugin",
  "description": "My first BRIKA plugin",
  "author": "Your Name",
  "keywords": ["automation", "iot"],
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "blocks": [
    {
      "id": "greet",
      "category": "action",
      "icon": "hand",
      "color": "#3b82f6"
    }
  ],
  "dependencies": {
    "@brika/sdk": "^0.2.0"
  }
}
```

> **Note:** Block `name` and `description` are defined in the `locales/` translation files, not in `package.json`. The `displayName` field is a fallback for the store when translations aren't loaded.

### Block Categories

| Category | Description |
|----------|-------------|
| `trigger` | Starts a workflow (timers, events, etc.) |
| `action` | Performs an action (send message, control device) |
| `flow` | Controls flow (condition, delay, loop) |
| `transform` | Transforms data (map, filter, format) |

### Block Icons

Use any [Lucide icon](https://lucide.dev/icons) name (e.g., `hand`, `timer`, `zap`, `bell`).

### Step 3: Create the Entry Point

Create `src/index.ts`:

```typescript
import {
  defineReactiveBlock,
  input,
  output,
  log,
  onStop,
  z,
} from "@brika/sdk";

// Define a reactive block
export const greet = defineReactiveBlock(
  {
    id: "greet",
    inputs: {
      trigger: input(z.generic(), { name: "Trigger" }),
    },
    outputs: {
      message: output(z.object({ text: z.string() }), { name: "Message" }),
    },
    config: z.object({
      name: z.string().default("World").describe("Name to greet"),
    }),
  },
  ({ inputs, outputs, config }) => {
    inputs.trigger.on(() => {
      log.info(`Greeting ${config.name}`);
      outputs.message.emit({ text: `Hello, ${config.name}!` });
    });
  }
);

// Lifecycle hooks
onStop(() => log.info("Plugin stopping"));

log.info("Plugin loaded");
```

### Step 4: Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["bun-types"]
  },
  "include": ["src"]
}
```

### Step 5: Install Dependencies

```bash
bun install
```

### Step 6: Register the Plugin

Add your plugin to `brika.yml`:

```yaml
plugins:
  - path: ./plugins/my-plugin
```

## Test Your Plugin

Start the development server:

```bash
bun run dev
```

1. Open the UI at http://localhost:5173
2. Navigate to the Plugins page
3. Verify your plugin is loaded
4. Create a workflow and add your block

## Complete Example

Here's a more complete example with multiple blocks:

```typescript
import {
  defineReactiveBlock,
  input,
  output,
  combine,
  log,
  onStop,
  z,
} from "@brika/sdk";

// Simple greeting block
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
  ({ inputs, outputs, config }) => {
    inputs.trigger.on(() => {
      outputs.message.emit(`Hello, ${config.name}!`);
    });
  }
);

// Temperature converter
export const tempConverter = defineReactiveBlock(
  {
    id: "temp-converter",
    inputs: {
      celsius: input(z.number(), { name: "Celsius" }),
    },
    outputs: {
      fahrenheit: output(z.number(), { name: "Fahrenheit" }),
      kelvin: output(z.number(), { name: "Kelvin" }),
    },
    config: z.object({}),
  },
  ({ inputs, outputs }) => {
    inputs.celsius.on((c) => {
      outputs.fahrenheit.emit(c * 1.8 + 32);
      outputs.kelvin.emit(c + 273.15);
    });
  }
);

// Alert block with multiple inputs
export const alert = defineReactiveBlock(
  {
    id: "alert",
    inputs: {
      temperature: input(z.number(), { name: "Temperature" }),
      humidity: input(z.number(), { name: "Humidity" }),
    },
    outputs: {
      warning: output(z.string(), { name: "Warning" }),
    },
    config: z.object({
      maxTemp: z.number().default(30),
      maxHumidity: z.number().default(80),
    }),
  },
  ({ inputs, outputs, config }) => {
    combine(inputs.temperature, inputs.humidity).on(([temp, hum]) => {
      if (temp > config.maxTemp) {
        outputs.warning.emit(`High temperature: ${temp}°C`);
      }
      if (hum > config.maxHumidity) {
        outputs.warning.emit(`High humidity: ${hum}%`);
      }
    });
  }
);

onStop(() => log.info("Plugin stopping"));
log.info("My plugin loaded with 3 blocks");
```

## Next Steps

* [Reactive Blocks](reactive-blocks.md) — Learn about block inputs, outputs, and operators
* [Lifecycle Hooks](lifecycle-hooks.md) — Handle startup, shutdown, and events
* [SDK Reference](../api-reference/sdk.md) — Full API documentation
