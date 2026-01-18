# Preferences API

Complete reference for plugin preferences in the `@brika/sdk` package.

## Overview

Preferences allow plugins to receive configuration from `brika.yml` and react to changes.

```typescript
import { getPreferences, onPreferencesChange, log } from "@brika/sdk";
```

---

## Functions

### getPreferences

Get the current plugin preferences (configuration).

```typescript
function getPreferences<T extends Record<string, unknown>>(): T
```

**Type Parameters:**

| Parameter | Description |
|-----------|-------------|
| `T` | Type of preferences object |

**Returns:** Current preferences object

**Example:**

```typescript
import { getPreferences, log } from "@brika/sdk";

interface MyPreferences {
  apiKey: string;
  debug: boolean;
  maxRetries: number;
  endpoint: string;
}

const prefs = getPreferences<MyPreferences>();

log.info("Configuration loaded", {
  debug: prefs.debug,
  endpoint: prefs.endpoint,
});

if (prefs.debug) {
  log.debug("Running in debug mode");
}
```

---

### onPreferencesChange

Register a handler that runs when preferences are updated.

```typescript
function onPreferencesChange<T extends Record<string, unknown>>(
  handler: (preferences: T) => void
): () => void
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `handler` | `PreferencesChangeHandler<T>` | Function called with new preferences |

**Returns:** Unsubscribe function

**Example:**

```typescript
import { onPreferencesChange, log } from "@brika/sdk";

interface MyPreferences {
  apiKey: string;
  debug: boolean;
  pollInterval: number;
}

// React to changes
const unsubscribe = onPreferencesChange<MyPreferences>((prefs) => {
  log.info("Preferences updated", {
    debug: prefs.debug,
    pollInterval: prefs.pollInterval,
  });

  // Reconfigure based on new settings
  if (prefs.debug) {
    enableDebugMode();
  } else {
    disableDebugMode();
  }
});

// Later, if needed:
unsubscribe();
```

---

## Configuration in brika.yml

Preferences are defined in `brika.yml`:

```yaml
plugins:
  "@brika/plugin-timer":
    enabled: true
    preferences:
      defaultDuration: 5000
      sound: "chime.wav"
      vibrate: true

  "@brika/plugin-weather":
    enabled: true
    preferences:
      apiKey: "your-api-key"
      location: "New York"
      units: "metric"
      refreshInterval: 300000
```

---

## Usage Patterns

### Initial Configuration

```typescript
import { getPreferences, onInit, log } from "@brika/sdk";

interface Config {
  apiEndpoint: string;
  timeout: number;
  retries: number;
}

let config: Config;

onInit(() => {
  config = getPreferences<Config>();
  log.info("Plugin configured", {
    endpoint: config.apiEndpoint,
    timeout: config.timeout,
  });
});
```

### Dynamic Reconfiguration

```typescript
import { getPreferences, onPreferencesChange, log } from "@brika/sdk";

interface Config {
  pollInterval: number;
  enabled: boolean;
}

let pollTimer: Timer | null = null;

function startPolling(interval: number) {
  stopPolling();
  pollTimer = setInterval(poll, interval);
  log.info("Polling started", { interval });
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    log.info("Polling stopped");
  }
}

// Initial setup
const config = getPreferences<Config>();
if (config.enabled) {
  startPolling(config.pollInterval);
}

// React to changes
onPreferencesChange<Config>((newConfig) => {
  if (newConfig.enabled) {
    startPolling(newConfig.pollInterval);
  } else {
    stopPolling();
  }
});
```

### Validated Configuration

```typescript
import { getPreferences, log } from "@brika/sdk";

interface Config {
  maxItems: number;
  timeout: number;
}

function getValidatedConfig(): Config {
  const raw = getPreferences<Partial<Config>>();

  return {
    maxItems: Math.max(1, Math.min(100, raw.maxItems ?? 10)),
    timeout: Math.max(1000, raw.timeout ?? 5000),
  };
}

const config = getValidatedConfig();
log.info("Using validated config", config);
```

### Feature Flags

```typescript
import { getPreferences, onPreferencesChange, log } from "@brika/sdk";

interface Features {
  enableBeta: boolean;
  enableAnalytics: boolean;
  enableNotifications: boolean;
}

// Check feature flag
function isFeatureEnabled(feature: keyof Features): boolean {
  const features = getPreferences<Features>();
  return features[feature] ?? false;
}

// Use in code
if (isFeatureEnabled("enableBeta")) {
  log.info("Beta features enabled");
  initBetaFeatures();
}
```

---

## Best Practices

### 1. Define Interface Types

```typescript
// Define clear interface
interface PluginConfig {
  apiKey: string;
  debug: boolean;
  maxRetries: number;
}

// Use typed access
const config = getPreferences<PluginConfig>();
```

### 2. Provide Defaults

```typescript
interface Config {
  timeout?: number;
  retries?: number;
}

const config = getPreferences<Config>();
const timeout = config.timeout ?? 5000;
const retries = config.retries ?? 3;
```

### 3. Validate Critical Values

```typescript
const config = getPreferences<Config>();

if (!config.apiKey) {
  log.error("API key is required");
  throw new Error("Missing required configuration: apiKey");
}
```

### 4. Log Configuration Changes

```typescript
onPreferencesChange<Config>((newConfig) => {
  log.info("Configuration updated", {
    // Log non-sensitive values
    timeout: newConfig.timeout,
    retries: newConfig.retries,
    // Don't log secrets
    hasApiKey: !!newConfig.apiKey,
  });
});
```

### 5. Handle Missing Preferences Gracefully

```typescript
const config = getPreferences<Partial<Config>>();

// Use nullish coalescing for defaults
const settings = {
  host: config.host ?? "localhost",
  port: config.port ?? 3000,
  secure: config.secure ?? true,
};
```

---

## Type Definitions

```typescript
/** Handler for preference changes */
type PreferencesChangeHandler<T = Record<string, unknown>> = (
  preferences: T
) => void;
```
