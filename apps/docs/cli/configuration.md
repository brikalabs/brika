# Configuration File

The hub reads its configuration from `${BRIKA_HOME}/brika.yml` (default: `.brika/brika.yml` in the current working directory). On first start the hub creates this file with sensible defaults. Edit it by hand at any time — the hub re-reads the file on restart.

## Full schema

```yaml
hub:
  port: 3001
  host: 127.0.0.1
  corsAllowlist: []           # exact production origins to allow (see below); empty keeps LAN/dev defaults
  plugins:
    installDir: ./plugins/.installed
    heartbeatInterval: 5000   # ms between ping → pong
    heartbeatTimeout: 15000   # ms before marking a plugin unresponsive
  logs:
    retentionDays: 7          # delete log rows older than this; 0 = keep forever
    pruneIntervalMs: 3600000  # how often the retention sweep runs
  shutdown:
    gracePeriodMs: 10000      # max time to drain requests + tear down before forcing exit

plugins:
  "@brika/plugin-timer":
    version: "^1.0.0"
  my-local-plugin:
    version: "workspace:./plugins/my-plugin"
    config:
      apiKey: __secret_apiKey   # presence sentinel; real value lives in the secret store
      pollInterval: 60

rules: []        # reserved for future use
schedules: []    # reserved for future use
```

## `hub.*`

| Field | Default | Description |
|---|---|---|
| `hub.port` | `3001` | TCP port to listen on |
| `hub.host` | `127.0.0.1` | Bind address. Use `0.0.0.0` for LAN/Docker (plus a firewall rule!) |
| `hub.corsAllowlist` | `[]` | Exact production origins the API accepts credentialed CORS requests from. Empty keeps the built-in LAN/dev defaults. See [CORS Allowlist](../architecture/cors.md) |
| `hub.plugins.installDir` | `./plugins/.installed` | Where the registry installs plugins, relative to `.brika/` |
| `hub.plugins.heartbeatInterval` | `5000` ms | Ping interval; the supervisor sends a ping RPC this often |
| `hub.plugins.heartbeatTimeout` | `15000` ms | Mark a plugin unresponsive (then kill + restart) after this many ms without a pong |
| `hub.logs.retentionDays` | `7` | Drop log rows older than this. `0` disables retention (file grows forever) |
| `hub.logs.pruneIntervalMs` | `3600000` (1 h) | How often the retention sweep runs |
| `hub.shutdown.gracePeriodMs` | `10000` ms | On SIGINT/SIGTERM/SIGHUP, drain in-flight HTTP requests and tear down subsystems within this budget. A hard timeout then force-closes connections, flushes logs, and exits so shutdown can't hang. Must be a positive integer; invalid values fall back to the default |

The hub also has internal defaults for IPC call timeout (`30 s`), kill grace period (`3 s`), and the restart policy (`5 crashes / 60 s` = crash loop, `30 s` of stability resets backoff, `1 s` base / `60 s` max delay). These are not configurable from `brika.yml` today — see [`PluginManagerConfig`](../architecture/plugin-supervisor.md).

> Environment variables override config values. `BRIKA_PORT=8080 brika start` wins over `hub.port: 3001`.

### `hub.corsAllowlist`

A list of **exact** production origins the HTTP API will accept credentialed cross-origin (CORS) requests from. Pin the public origin(s) you serve the UI from:

```yaml
hub:
  corsAllowlist:
    - https://app.example.com
    - https://admin.example.com
```

Each entry must be an absolute `http(s)` origin (scheme + host + optional port, no path) and is validated when the config loads — a malformed entry is rejected and the list falls back to empty. Matching is exact (never prefix/substring), so `https://app.example.com` will not match a look-alike like `https://app.example.com.evil.com`.

The list is **additive**: when it is empty (the default), the hub still allows the built-in LAN/dev origins (loopback, RFC1918, `*.local`, `hub.brika.dev`), so local development needs no configuration. `BRIKA_CORS_ALLOWLIST` (comma-separated) overrides this field. See [CORS Allowlist](../architecture/cors.md) for the full security rationale.

## `plugins`

A map of `package-name → entry`. Each entry has a `version` and an optional `config`.

### `version` formats

| Format | Behaviour |
|---|---|
| `"^1.0.0"`, `"~1.2", `"1.2.3"` | Standard semver — fetched from npm via the registry |
| `"workspace:*"` | Local workspace package — found by name under `plugins/` in the workspace root |
| `"workspace:./relative/path"` | Local plugin at an explicit path |
| `"file:/abs/path"` | Direct local path (no resolution) |

For workspace plugins the hub walks up from `.brika/` looking for a `bun.lock` + `package.json` with a `workspaces` field — that's the workspace root.

### `config`

A free-form object passed to the plugin as its preferences (`getPreferences()`). The plugin's manifest declares the schema for these values; the hub validates against it and emits a `preferences` IPC message whenever they change.

### Secret values

Any key starting with `__secret_` is a **presence sentinel**, not a real value. The real value lives in the [Secret Store](../architecture/secret-store.md) (OS keychain or encrypted file). The hub strips real secret values from the YAML on save so they never leak into version control or backups of `brika.yml`.

When you set a secret through the UI or API, the hub:

1. Writes the actual value to the secret store under a stable key.
2. Writes a `__secret_<key>: null` sentinel into the YAML so the config diff shows that *some* secret exists for that field.
3. Re-pushes the resolved value to the plugin via IPC.

## Hot reload

Editing `brika.yml` directly does **not** trigger a hot reload — the hub reads it at startup. Restart the hub (`brika stop && brika start`) to pick up changes. The UI's preferences editor, which mutates the same file via the API, updates the running plugin live.

## Where to put it

`brika.yml` is per-workspace, in `${BRIKA_HOME}/brika.yml`. The CLI and hub both resolve `${BRIKA_HOME}` to `<cwd>/.brika` by default. Set `BRIKA_HOME` if you want to run a hub against a config in a different directory.

In Docker setups, mount the directory containing `brika.yml`:

```yaml
services:
  brika:
    image: ghcr.io/brikalabs/brika:latest
    volumes:
      - ./config:/app/.brika
    ports:
      - "3001:3001"
```

## See also

* **[The .brika Directory](../basics/data-directory.md)** — what else lives in `.brika/`.
* **[Environment Variables](environment.md)** — env overrides.
* **[Secret Store](../architecture/secret-store.md)** — how `__secret_*` sentinels resolve to real values.
* **[Plugin Supervisor](../architecture/plugin-supervisor.md)** — heartbeat, restart policy, hot-reload of preferences.
