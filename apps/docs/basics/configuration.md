# Configuration

BRIKA uses YAML configuration files for runtime settings and workflows.

## Main Configuration

The main configuration file is `brika.yml` in the project root.

```yaml
# brika.yml
hub:
  port: 3001
  host: "0.0.0.0"

plugins:
  # Local plugins (development)
  - path: ./plugins/blocks-builtin
  - path: ./plugins/timer

  # External plugins (production)
  # - package: "@brika/plugin-hue"
  #   version: "1.0.0"

workflows:
  directory: ./workflows
```

## Plugin Configuration

Plugins can have their own configuration:

```yaml
# brika.yml
plugins:
  - path: ./plugins/my-plugin
    config:
      apiKey: "your-api-key"
      debug: true
```

Access configuration in your plugin:

```typescript
import { getPreferences, onPreferencesChange } from "@brika/sdk";

interface MyConfig {
  apiKey: string;
  debug: boolean;
}

const config = getPreferences<MyConfig>();
console.log(config.apiKey);

// React to changes
onPreferencesChange<MyConfig>((newConfig) => {
  console.log("Config updated:", newConfig);
});
```

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
  -v ./brika.yml:/app/brika.yml \
  -v ./workflows:/app/workflows \
  -v ./data:/app/.brika \
  maxscharwath/brika:latest
```
