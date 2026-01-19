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

## Sparks

Sparks are typed, persisted events for inter-plugin communication. See the [Sparks documentation](../api-reference/sparks.md) for full details.

### Defining Sparks

Define sparks in your plugin's `package.json` and code:

```typescript
import { defineSpark, z } from "@brika/sdk";

export const deviceUpdated = defineSpark({
  id: "device-updated",
  schema: z.object({
    deviceId: z.string(),
    state: z.string(),
    ts: z.number(),
  }),
});

// Emit with full type safety
deviceUpdated.emit({
  deviceId: "light-1",
  state: "on",
  ts: Date.now(),
});
```

### Subscribing to Sparks

Subscribe to sparks in reactive blocks using `subscribeSpark`:

```typescript
import { subscribeSpark, map } from "@brika/sdk";

// In a reactive block executor:
start(subscribeSpark("other-plugin:device-updated"))
  .pipe(map((event) => event.payload))
  .to(outputs.data);
```

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
  defineSpark,
  input,
  output,
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

// Define a spark for inter-plugin communication
export const dataFetched = defineSpark({
  id: "data-fetched",
  schema: z.object({
    count: z.number(),
    ts: z.number(),
  }),
});

// Initialize on startup
onInit(async () => {
  const config = getPreferences<PluginConfig>();
  connection = await connect(config.apiEndpoint);
  log.info('Connected to API', { endpoint: config.apiEndpoint });
});

// Watch for config changes
onPreferencesChange<PluginConfig>(async (newConfig) => {
  log.info('Reconnecting with new config');
  connection?.close();
  connection = await connect(newConfig.apiEndpoint);
});

// Cleanup on stop
onStop(() => {
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
        // Emit a spark for other plugins to react to
        dataFetched.emit({ count: data.length, ts: Date.now() });
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
* [Sparks](../api-reference/sparks.md) — Typed event system
