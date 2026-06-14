# create-brika

Scaffold a new BRIKA plugin with a single command.

## Usage

```bash
bun create brika my-plugin
# or:
bunx create-brika my-plugin
```

This launches an interactive wizard that:

1. Asks for plugin details (name, description, category, author, features)
2. Fetches the latest `@brika/sdk` version from npm and pins the new plugin to it
3. Creates the complete plugin structure
4. Initializes a git repository (unless `--no-git`)
5. Installs dependencies (unless `--no-install`)

## Options

```bash
# Interactive mode (prompts for all options)
bun create brika

# With plugin name
bun create brika my-plugin

# Skip git initialization
bun create brika my-plugin --no-git

# Skip dependency installation
bun create brika my-plugin --no-install

# Show help
bun create brika --help
```

## Generated Structure

The exact files depend on which features (blocks, bricks, sparks) you select:

```
my-plugin/
├── package.json          # Plugin manifest
├── tsconfig.json         # TypeScript configuration
├── README.md             # Documentation
├── .gitignore
├── src/
│   ├── index.ts          # Plugin entry
│   ├── blocks/           # Block definitions      (if blocks selected)
│   ├── bricks/           # Brick descriptor + view (if bricks selected)
│   └── sparks/           # Spark definitions       (if sparks selected)
└── locales/
    ├── en/               # i18n translations
    └── fr/
```

## Categories

When prompted for category, choose based on your plugin's purpose:

| Category | Description | Examples |
|----------|-------------|----------|
| `trigger` | Starts workflows | Timers, sensors, webhooks |
| `action` | Performs operations | Send notification, control device |
| `transform` | Processes data | Map, filter, format |
| `flow` | Controls execution | Condition, delay, split |

## After Creating

```bash
cd my-plugin
brika dev               # Build + load into your running hub, hot-reload on edits
bun run typecheck       # Type check (brika check --types)
```

To load the plugin from disk via config, add it to your `brika.yml` keyed by package name:

```yaml
plugins:
  "@brika/plugin-my-plugin":
    version: "workspace:./my-plugin"
```

## License

MIT
