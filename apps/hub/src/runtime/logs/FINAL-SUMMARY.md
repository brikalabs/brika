# Logging System - Final Implementation

## Architecture

```
logs/
├── formatters/
│   ├── terminal-formatter.ts   # Modern colored output
│   └── types.ts               # Formatter interfaces
├── transports/
│   ├── console-transport.ts   # stdout/stderr transport
│   └── transport.ts          # Transport interface
├── utils/
│   ├── call-site.ts          # Stack trace capture
│   └── ring-buffer.ts        # Circular buffer
├── log-router.ts             # Main Logger class
└── log-store.ts              # Database persistence
```

## Key Features

### 1. Clean Error Handling

**Simple API - just pass the error:**
```typescript
try {
  await riskyOperation();
} catch (err) {
  logger.error("Failed to perform operation", { userId: "123" }, err);
}
```

**Output:**
```
2026-01-21 18:05:15 ✘ error hub                Failed to load plugin @plugin-loader.ts:40
                    ├─ pluginName: "@brika/blocks-builtin"
                    └─ version: "latest"
                    Error: Cannot resolve npm package: @brika/blocks-builtin.
                      at resolvePluginEntry (config-loader.ts:313)
                      at async load (plugin-loader.ts:40)
                      at async start (bootstrap.ts:69)
```

Errors are displayed **separately** from metadata, not mixed in!

### 2. Configurable Source

**Set default source:**
```typescript
logger.setSource("automation");
```

**Or specify per log:**
```typescript
logger.info("Task started", { taskId: "123" }, "automation");
```

**Available sources:**
- `hub` - Hub core (default)
- `plugin` - Plugin system
- `installer` - Package installer
- `registry` - Plugin registry
- `stderr` - Standard error
- `automation` - Automation engine

### 3. Descriptive Messages

All messages are clear, complete sentences:

```typescript
// ✅ Good
logger.info("Configuration loaded successfully", { configPath, pluginCount });
logger.error("Failed to load plugin", { pluginName, version }, error);

// ❌ Bad (old style)
logger.info("config.loaded", { path });
logger.error("plugin.load.failed", { name, error: String(error) });
```

### 4. Rich Metadata

Include contextual information for debugging:

```typescript
logger.info("Configuration loaded successfully", {
  configPath: this.configPath,
  pluginCount: this.#config.plugins.length,
  ruleCount: this.#config.rules.length,
  scheduleCount: this.#config.schedules.length,
});
```

### 5. Professional Output

**With colors (auto-detected TTY):**
```
2026-01-21 15:42:13 ℹ info  hub                Configuration loaded successfully
                    ├─ configPath: "/Users/you/project/.brika/brika.yml"
                    ├─ pluginCount: 5
                    ├─ ruleCount: 3
                    └─ scheduleCount: 2
```

**Without colors:**
```
2026-01-21 15:42:13 INFO  hub                Configuration loaded successfully
                    ├─ configPath: "/Users/you/project/.brika/brika.yml"
                    ├─ pluginCount: 5
                    ├─ ruleCount: 3
                    └─ scheduleCount: 2
```

## Configuration

### Environment Variables

- `BRIKA_LOG_LEVEL` - Minimum level (debug, info, warn, error). Default: `info`
- `NO_COLOR` - Set to any value to disable colors
- `FORCE_COLOR` - Set to `1` or `true` to force colors
- `BRIKA_LOG_COLOR` - Set to `1` to enable, `0` to disable

Priority: `NO_COLOR` > `FORCE_COLOR` > `BRIKA_LOG_COLOR` > Auto-detect TTY

## API Reference

### Logger Methods

```typescript
class Logger {
  // Set default source for all logs
  setSource(source: LogSource): void;

  // Log methods
  debug(message: string, meta?: Record<string, Json>, source?: LogSource): void;
  info(message: string, meta?: Record<string, Json>, source?: LogSource): void;
  warn(message: string, meta?: Record<string, Json>, error?: unknown, source?: LogSource): void;
  error(message: string, meta?: Record<string, Json>, error?: unknown, source?: LogSource): void;

  // Subscribe to log events
  subscribe(fn: (event: LogEvent) => void): () => void;

  // Add custom transport
  addTransport(transport: Transport): void;

  // Query recent logs from ring buffer
  query(): LogEvent[];
}
```

## Implementation Details

### Error Handling

Errors are stored in a reserved `__error` meta key and formatted specially:
- Error name, message, and stack extracted automatically
- Stack traces displayed with proper indentation
- Error cause chains supported
- Non-Error values handled gracefully

### Source Detection

- Default source is `"hub"`
- Can be overridden per-log via parameter
- Can be set as default via `setSource()`
- Properly typed as `LogSource` union

### Call Site Capture

- Automatically captures file path and line number
- Uses stack trace inspection
- Displayed as `@file.ts:line` in logs

### Formatting

- ISO-8601 timestamp: `YYYY-MM-DD HH:MM:SS`
- Tree structure for metadata: `├─` and `└─`
- Source width: 18 characters (padded/truncated)
- Level-specific colors and symbols
- Multi-line values (like stacks) properly indented

## Code Quality

- ✅ **Simple & Clean** - No boilerplate, minimal code
- ✅ **Type-safe** - Full TypeScript support
- ✅ **Professional** - Production-ready patterns
- ✅ **Extensible** - Transport & formatter interfaces
- ✅ **Performant** - Ring buffer, efficient formatting
- ✅ **Standards-compliant** - ISO-8601, NO_COLOR, etc.

## Total Lines of Code

| File | Lines | Purpose |
|------|-------|---------|
| log-router.ts | 140 | Main logger |
| terminal-formatter.ts | 145 | Output formatting |
| console-transport.ts | 41 | Console output |
| call-site.ts | 22 | Stack capture |
| ring-buffer.ts | 55 | Memory storage |
| **Total** | **403** | **Complete system** |

Professional logging in under 500 lines! 🚀
