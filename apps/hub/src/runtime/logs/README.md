# Brika Logging System

Professional logging system with pluggable transports and formatters, inspired by Winston and Pino.

## Architecture

```
logs/
├── formatters/          # Format log events into strings
│   ├── terminal-formatter.ts   # Modern colored terminal output
│   └── types.ts                # Formatter interfaces
├── transports/          # Route logs to destinations
│   ├── console-transport.ts    # stdout/stderr transport
│   └── transport.ts            # Transport interface
├── utils/              # Shared utilities
│   ├── call-site.ts            # Stack trace capture
│   └── ring-buffer.ts          # Circular buffer
├── log-router.ts       # Main Logger class
└── log-store.ts        # Database persistence
```

## Features

### Modern Terminal Output

Professional formatting following patterns from Vercel, Next.js, and modern CLI tools:

- **Vibrant colors** - Using `picocolors` for reliable cross-platform colors
- **Auto TTY detection** - Colors automatically enabled in terminals
- **Clean visual hierarchy** - Important info stands out
- **Smart metadata display** - Nested on new line when present
- **Source location tracking** - Automatic call site capture
- **Level-based styling** - Icons and colors per log level

### Pluggable Architecture

- **Transport Interface** - Route logs anywhere (console, file, remote)
- **Formatter Interface** - Customize output format
- **Ring Buffer** - Efficient in-memory log storage
- **Subscribers** - React to log events in real-time

## Usage

### Basic Logging

```typescript
import { Logger } from "@brika/hub/runtime/logs";
import { container } from "@brika/shared";

const logger = container.resolve(Logger);

logger.info("Server started", { port: 3000 });
logger.warn("Cache miss", { key: "user:123" });

// Error logging with full stack trace - just pass the error!
try {
  await riskyOperation();
} catch (err) {
  logger.error("Failed to perform operation", { userId: "123", operation: "sync" }, err);
}
```

### Adding Custom Transports

```typescript
import type { Transport } from "@brika/hub/runtime/logs/transports";

class FileTransport implements Transport {
  write(event: LogEvent): void {
    // Write to file
  }
}

logger.addTransport(new FileTransport());
```

### Subscribing to Events

```typescript
const unsubscribe = logger.subscribe((event) => {
  if (event.level === "error") {
    sendToErrorTracking(event);
  }
});

// Later...
unsubscribe();
```

## Configuration

### Environment Variables

- `BRIKA_LOG_LEVEL` - Minimum level for the **whole pipeline** (debug, info,
  warn, error). Default: `info`. A log below this floor short-circuits in
  `Logger.#log` **before** any work — no call-site capture, no meta merge, no
  ring/store write, no transport or subscriber fan-out. This is what makes
  disabled `debug` logging effectively free. (Plugin logs arrive pre-formed
  via `emit()` and are not gated by this floor.)
- `BRIKA_LOG_CALLSITE` - Minimum level at which the (relatively expensive)
  stack-trace call-site capture runs. Accepts a level name (`debug`/`info`/
  `warn`/`error`), `all`, or `off`/`none`. Default: `warn` — `file:line`
  matters most for problems, and skipping it on the high-volume info path is
  the single biggest per-log saving.

### Performance notes

- **Early level gate** — see `BRIKA_LOG_LEVEL` above.
- **Lazy call-site capture** — see `BRIKA_LOG_CALLSITE` above.
- **Batched persistence** — `Logger.emit()` funnels events through
  `LogStore.enqueue()`, which buffers and writes on the next tick in a single
  transaction instead of one synchronous SQLite insert per line. The buffer
  is drained on `close()` (including the crash-handler path), so no tail is
  lost. `LogStore.insert()` remains a synchronous read-after-write path for
  direct callers and tests.

### Color Detection

Colors are **automatically enabled** when running in a terminal (TTY). You can control this with:

- `NO_COLOR` - Set to any value to disable colors (standard)
- `FORCE_COLOR` - Set to `1` or `true` to force colors (standard)
- `BRIKA_LOG_COLOR` - Set to `1` to enable, `0` to disable (Brika-specific)

Priority order:
1. `NO_COLOR` (disables if set)
2. `FORCE_COLOR` (enables if set to 1/true)
3. `BRIKA_LOG_COLOR` (enables if 1, disables if 0)
4. Auto-detect TTY (default behavior)

## Output Examples

### Single metadata field
```
2026-01-21 12:34:56 ℹ info  hub:plugin-loader    Plugin loaded @bootstrap/index.ts:42
                    └─ port: 3000
```

### Multiple metadata fields
```
2026-01-21 12:34:57 ▲ warn  hub:cache-manager    Cache miss @cache/redis.ts:89
                    ├─ key: "user:123"
                    ├─ ttl: 300
                    └─ source: "database"
```

### Error with full context and stack trace
```
2026-01-21 12:34:58 ✘ error hub:database         Connection failed @db/client.ts:156
                    ├─ host: "localhost"
                    ├─ port: 5432
                    └─ retries: 3
                    Error: Cannot connect to database
                      at connect (db/client.ts:45)
                      at initialize (db/pool.ts:12)
                      at start (bootstrap.ts:68)
```

Errors are displayed separately with clean stack traces, not mixed with metadata!

## Design Principles

1. **Simple & Clean** - Easy to read, minimal noise
2. **Professional** - Production-ready logging patterns
3. **Extensible** - Add transports, formatters, subscribers
4. **Performant** - Ring buffer for efficient in-memory storage
5. **Type-safe** - Full TypeScript support
