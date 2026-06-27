# Configuration File

The hub reads its configuration from `${BRIKA_HOME}/brika.yml` (default: `.brika/brika.yml` in the current working directory). On first start the hub creates this file with sensible defaults. Edit it by hand at any time — the hub re-reads the file on restart.

`brika.yml` is the only file you edit by hand. Everything the hub manages (databases, installed plugins, identity, caches, secrets) lives in the hidden `.brika/.system/` folder next to it; leave that folder alone.

### Units

Tuning values accept readable units, normalised on the next save:

- **Durations:** `5s`, `15s`, `1h`, `7d` — or a raw number of milliseconds. `0` means "disabled".
- **Sizes:** `512mb`, `2gb`, `256mib` — or a raw number of bytes. `0` means "disabled".

## Full schema

```yaml
hub:
  port: 3001
  host: 127.0.0.1
  corsAllowlist: []          # exact production origins to allow (see below); empty keeps LAN/dev defaults
  plugins:
    heartbeat: 5s            # interval between ping → pong
    heartbeatTimeout: 15s    # mark a plugin unresponsive after this long without a pong
    rssSoftLimit: 512mb      # graceful restart when a plugin's RSS stays above this; 0 disables
    idleReap: 0              # scale-to-zero: reap a plugin idle this long; 0 keeps it resident
    keepWarmCount: 0         # keep the N most-recently-active plugins resident past their idle window
    bytecode: false          # compile plugin bundles to bytecode for faster cold starts
    quotas:                  # operator-wide per-plugin disk-quota defaults (optional)
      data: 2gb              # a plugin's own package.json quotas still win over these
      cache: 2gb
      tmp: 256mb
  logs:
    retention: 7d            # delete log rows older than this; 0 = keep forever
    pruneInterval: 1h        # how often the retention sweep runs
  analytics:
    retention: 90d           # delete analytics events older than this; 0 = keep forever
    pruneInterval: 1h
  shutdown:
    gracePeriod: 10s         # max time to drain requests + tear down before forcing exit

plugins:
  "@brika/plugin-timer":
    version: "^1.0.0"
  my-local-plugin:
    version: "workspace:./plugins/my-plugin"
    config:
      apiKey: "my-plaintext-key"   # a secret typed by hand; see "Writing secrets" below
      pollInterval: 60

registry: https://registry.brika.dev   # npm registry probed for scoped installs (auto-routing)
npmRegistries: {}                       # explicit scope → registry overrides (auto-routing fills this)
searchStores:                           # /v1 stores searched for plugins
  - https://store.brika.dev

rules: []        # reserved for future use
schedules: []    # reserved for future use
```

## `hub.*`

| Field | Default | Description |
|---|---|---|
| `hub.port` | `3001` | TCP port to listen on |
| `hub.host` | `127.0.0.1` | Bind address. Use `0.0.0.0` for LAN/Docker (plus a firewall rule!) |
| `hub.corsAllowlist` | `[]` | Exact production origins the API accepts credentialed CORS requests from. Empty keeps the built-in LAN/dev defaults. See [CORS Allowlist](../architecture/cors.md) |
| `hub.plugins.heartbeat` | `5s` | Ping interval; the supervisor sends a ping RPC this often |
| `hub.plugins.heartbeatTimeout` | `15s` | Mark a plugin unresponsive (then kill + restart) after this long without a pong |
| `hub.plugins.rssSoftLimit` | `512mb` | Graceful restart when a plugin's resident set size stays above this. `0` disables RSS-based restarts |
| `hub.plugins.idleReap` | `0` | Scale-to-zero: reap an idle plugin after this long with no activity. `0` keeps plugins resident |
| `hub.plugins.keepWarmCount` | `0` | Keep the N most-recently-active plugins resident past their idle window |
| `hub.plugins.bytecode` | `false` | Compile plugin server bundles to bytecode so cold starts skip parse/compile |
| `hub.plugins.quotas` | (built-in: 2gb/2gb/256mb) | Operator-wide per-plugin disk-quota defaults for the `data`/`cache`/`tmp` roots. A plugin's own `package.json` quotas win over these; omit a root to keep the built-in. The hub also auto-reclaims each plugin's evictable `/tmp` (older than 24h) and `/cache` (older than 14d) on a periodic sweep. |
| `hub.logs.retention` | `7d` | Drop log rows older than this. `0` disables retention (file grows forever) |
| `hub.logs.pruneInterval` | `1h` | How often the log retention sweep runs |
| `hub.analytics.retention` | `90d` | Drop analytics events older than this. `0` disables retention |
| `hub.analytics.pruneInterval` | `1h` | How often the analytics retention sweep runs |
| `hub.shutdown.gracePeriod` | `10s` | On SIGINT/SIGTERM/SIGHUP, drain in-flight HTTP requests and tear down subsystems within this budget. A hard timeout then force-closes connections, flushes logs, and exits so shutdown can't hang. Invalid values fall back to the default |

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

Secret config values (a field the plugin declares as a `password`, or any key starting with `__secret_`) never persist in plaintext in `brika.yml`. The real value lives in the [Secret Store](../architecture/secret-store.md) (OS keychain or encrypted file).

**Writing a secret by hand.** You can type a plaintext secret straight into `brika.yml`:

```yaml
plugins:
  my-plugin:
    config:
      apiKey: "sk-my-real-key"   # a password-typed field
```

On the next start the hub **absorbs** it: it moves the value into the secret store and scrubs `brika.yml` (a password field is removed entirely; a `__secret_*` key is replaced with a `null` presence marker). The plaintext never survives a restart, so it can't leak into version control or backups. This absorption is idempotent — once scrubbed, later starts leave the file alone.

**Setting a secret through the UI or API** does the same routing directly:

1. Writes the actual value to the secret store under a stable key.
2. Writes a `__secret_<key>: null` marker into the YAML (for `__secret_*` keys) so the config diff shows that *some* secret exists for that field.
3. Re-pushes the resolved value to the plugin via IPC.

## `registry` / `npmRegistries` / `searchStores`

Where the hub installs and searches for plugins. `registry` is probed for scoped installs and
auto-routes scopes it serves; `npmRegistries` are explicit scope overrides; `searchStores` are the `/v1`
stores searched. All optional (Brika defaults apply). Manage them with `brika registry add` / `list`, and
see [Registries](registries.md) for the full model.

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
