# Lifecycle Hooks

Plugins can respond to lifecycle events using hooks.

## Available Hooks

### onInit

Runs when the plugin initializes:

```typescript
import { onInit, log } from "@brika/sdk";

onInit(() => {
  log.info('Plugin initialized');
  // Setup connections, load resources, etc.
});
```

Use `onInit` for:

* Establishing connections (databases, APIs)
* Loading configuration
* Initializing state

### onStop

Runs when the plugin stops (reload, update, or shutdown):

```typescript
import { onStop, log } from "@brika/sdk";

onStop(() => {
  log.info('Plugin stopping');
  // Cleanup resources, close connections, cancel timers
});
```

Use `onStop` for:

* Closing database connections
* Canceling timers and intervals
* Saving state
* Releasing resources

### onUninstall

Runs when the plugin is permanently uninstalled:

```typescript
import { onUninstall, log } from "@brika/sdk";

onUninstall(() => {
  log.info('Plugin being uninstalled');
  // Permanent cleanup: delete files, revoke tokens, etc.
});
```

Use `onUninstall` for:

* Deleting local files
* Revoking API tokens
* Cleaning up external resources

## Events

### Subscribing to Events

Listen to events from the hub event bus:

```typescript
import { on, log } from "@brika/sdk";

// Subscribe with pattern matching
const unsubscribe = on("device.*", (event) => {
  log.debug(`Device event: ${event.type}`, event.payload);
});

// Unsubscribe when done
onStop(() => {
  unsubscribe();
});
```

### Emitting Events

Emit events to the hub event bus:

```typescript
import { emit } from "@brika/sdk";

emit("device.updated", { id: "light-1", state: "on" });
emit("motion.detected", { zone: "living-room", confidence: 0.95 });
```

### Event Patterns

Use glob patterns for flexible matching:

| Pattern | Matches |
|---------|---------|
| `device.updated` | Exact match |
| `device.*` | `device.updated`, `device.deleted`, etc. |
| `*.updated` | `device.updated`, `user.updated`, etc. |
| `**` | All events |

## Preferences

### Reading Preferences

Access plugin configuration from `brika.yml`:

```typescript
import { getPreferences } from "@brika/sdk";

interface MyPrefs {
  apiKey: string;
  debug: boolean;
  timeout: number;
}

const prefs = getPreferences<MyPrefs>();
log.info(`Debug mode: ${prefs.debug}`);
```

### Watching Preference Changes

React to configuration changes:

```typescript
import { onPreferencesChange, log } from "@brika/sdk";

interface MyPrefs {
  apiKey: string;
  debug: boolean;
}

onPreferencesChange<MyPrefs>((newPrefs) => {
  log.info('Preferences updated');
  // Reconfigure based on new settings
});
```

## Logging

The SDK provides logging at two levels:

### Plugin-Level Logging

Outside block definitions, you can use convenience methods:

```typescript
import { log } from "@brika/sdk";

// Convenience methods (plugin-level only)
log.debug("Debug information", { detail: "value" });
log.info("Informational message");
log.warn("Warning message", { code: 123 });
log.error("Error occurred", { error: err });

```

### Block-Level Logging

Inside `defineReactiveBlock`, use the provided `log`:

```typescript
defineReactiveBlock(
  { /* spec */ },
  ({ inputs, outputs, config, log }) => {
    inputs.trigger.on(() => {
      log.info(`Block triggered with value: ${config.value}`);
      log.debug('Processing data');
    });
  }
);
```

### Error Logging

Errors are automatically extracted with stack traces when using `log.error`:

```typescript
try {
  await riskyOperation();
} catch (err) {
  // At plugin level, use log.error for automatic stack capture
  log.error("Operation failed", { error: err, context: "startup" });
}
```

## Complete Example

```typescript
import {
  defineReactiveBlock,
  input,
  output,
  on,
  emit,
  onInit,
  onStop,
  getPreferences,
  onPreferencesChange,
  log,
  z,
} from "@brika/sdk";

interface PluginConfig {
  apiEndpoint: string;
  pollInterval: number;
}

let connection: Connection | null = null;
let unsubscribe: (() => void) | null = null;

// Initialize on startup
onInit(async () => {
  const config = getPreferences<PluginConfig>();
  connection = await connect(config.apiEndpoint);
  log.info('Connected to API', { endpoint: config.apiEndpoint });
});

// Subscribe to events
unsubscribe = on("system.reload", () => {
  log.info('System reload requested');
});

// Watch for config changes
onPreferencesChange<PluginConfig>(async (newConfig) => {
  log.info('Reconnecting with new config');
  connection?.close();
  connection = await connect(newConfig.apiEndpoint);
});

// Cleanup on stop
onStop(() => {
  unsubscribe?.();
  connection?.close();
  log.info('Plugin stopped');
});

// Define blocks
export const fetchData = defineReactiveBlock(
  {
    id: "fetch-data",
    inputs: {
      trigger: input(z.generic(), { name: "Trigger" }),
    },
    outputs: {
      data: output(z.any(), { name: "Data" }),
      error: output(z.string(), { name: "Error" }),
    },
    config: z.object({}),
  },
  ({ inputs, outputs, log }) => {
    inputs.trigger.on(async () => {
      try {
        const data = await connection?.fetch();
        outputs.data.emit(data);
        emit("data.fetched", { count: data.length });
      } catch (err) {
        log.error('Fetch failed', { error: err });
        outputs.error.emit(String(err));
      }
    });
  }
);

log.info('Plugin loaded');
```

## Next Steps

* [SDK Reference](../api-reference/sdk.md) — Full API documentation
* [Events](../api-reference/events.md) — Event system details
