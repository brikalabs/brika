# create-brika

Scaffold a new BRIKA plugin with a single command.

## Usage

```bash
bun create brika my-plugin
```

This launches an interactive wizard that:

1. Asks for plugin details (name, description, category, author)
2. Fetches the latest SDK version from npm
3. Creates the complete plugin structure
4. Installs dependencies
5. Initializes a git repository

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

```
my-plugin/
├── package.json          # Plugin manifest with blocks
├── tsconfig.json         # TypeScript configuration
├── README.md             # Documentation
├── .gitignore
├── src/
│   └── index.ts          # Block definitions
└── locales/
    └── en/
        └── plugin.json   # i18n translations
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
bun link          # Link for local development
bun run tsc       # Type check
```

Add to your `brika.yml`:

```yaml
plugins:
  - path: ./my-plugin
```

## License

MIT
