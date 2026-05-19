# Configuration

BRIKA uses YAML configuration files for runtime settings and workflows.

## Main Configuration

The main configuration file is `brika.yml` in the project root.

```yaml
# brika.yml
hub:
  port: 3001
  host: "0.0.0.0"

# Plugins are keyed by package name; each entry needs a version specifier.
plugins:
  # Workspace plugin resolved by package name in ./plugins/
  "@brika/plugin-blocks-builtin":
    version: "workspace:*"
  # Workspace plugin at an explicit relative path
  "@brika/plugin-timer":
    version: "workspace:./plugins/timer"
  # NPM-published plugin (installed via `brika plugin install`)
  # "@brika/plugin-hue":
  #   version: "^1.0.0"
```

## Plugin Configuration

Each plugin entry may carry a `config` map of preference values:

```yaml
# brika.yml
plugins:
  "@brika/plugin-my-plugin":
    version: "workspace:*"
    config:
      apiKey: "your-api-key"
      debug: true
```

Access configuration in your plugin. Pass a Zod schema to validate at the
boundary (recommended — the unchecked generic overload is kept for
backward compat but does not catch shape drift):

```typescript
import { getPreferences, onPreferencesChange, z } from "@brika/sdk";

const ConfigSchema = z.object({
  apiKey: z.string(),
  debug: z.boolean(),
});

const config = getPreferences(ConfigSchema);
console.log(config.apiKey); //              ^? string

// React to changes (typed payload)
onPreferencesChange<z.infer<typeof ConfigSchema>>((newConfig) => {
  console.log("Config updated:", newConfig);
});
```

> **Note:** the older `- path:` / `- package:` array form is **not** parsed —
> the loader returns zero plugins for it. Always use the object form keyed by
> package name.

## Workflow Files

Workflows are stored as YAML files in the `workflows/` directory:

```yaml
# workflows/morning-routine.yml
name: Morning Routine
description: Turn on lights at sunrise
trigger:
  type: schedule
  cron: "0 6 * * *"
blocks:
  - id: light-on
    type: "@brika/plugin-hue:set-light"
    config:
      lightId: "living-room"
      state: on
      brightness: 80
```

## Environment Variables

Some settings can be configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIKA_PORT` | 3001 | API server port |
| `BRIKA_HOST` | 0.0.0.0 | API server host |
| `BRIKA_LOG_LEVEL` | info | Log level (debug, info, warn, error) |
| `BRIKA_DATA_DIR` | ./.brika | Data directory |

### Authentication

See [Authentication](../architecture/authentication.md) for full details.

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIKA_DATA_DIR` | ./.brika | Directory for auth.db and other data |

Auth is configured programmatically at bootstrap. The password policy and session TTL are set in the auth config object (see the authentication docs).

## Docker Configuration

When running in Docker, mount your configuration:

```bash
docker run -d \
  --pull=always \
  -v ./brika.yml:/app/brika.yml \
  -v ./workflows:/app/workflows \
  -v ./data:/app/.brika \
  ghcr.io/brikalabs/brika:latest
```
