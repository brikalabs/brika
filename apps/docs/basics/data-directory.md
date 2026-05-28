# The .brika Directory

Every Brika hub has a workspace directory called `.brika/`. It holds your configuration, every plugin you have installed, persistent state, logs, and the PID lockfile. Back up this directory (plus the OS keychain entries the hub uses, when applicable) and you have backed up the entire hub.

`.brika/` lives in the directory where you ran `brika start`. Override with `BRIKA_HOME` or the `-C` / `--cwd` flag.

```
.brika/
├── brika.yml          Hub configuration (YAML, hand-editable)
├── brika.pid          PID of the running hub (auto-managed)
├── secrets.enc        Encrypted secret store (only with the file backend)
├── plugins/
│   ├── node_modules/  Installed npm plugin packages
│   └── <plugin-uid>/
│       └── data/      Plugin-owned storage (readJSON/writeJSON)
├── state/
│   ├── *.db           SQLite databases (Drizzle ORM)
│   └── *.json         JSON state files (board layouts, workflow definitions, etc.)
├── logs/
│   └── *.jsonl        Newline-delimited JSON log files
└── cache/
    └── bricks/        Compiled brick modules (content-hashed JS + CSS)
```

## `brika.yml`

The single hand-editable configuration file. Defaults are created on first start. Everything else in `.brika/` is managed by the hub.

```yaml
hub:
  port: 3001
  host: 127.0.0.1
  plugins:
    installDir: ./plugins/.installed
    heartbeatInterval: 5000   # ms between plugin ping → pong
    heartbeatTimeout: 15000   # ms before declaring a plugin unresponsive
  logs:
    retentionDays: 7          # 0 = keep forever
    pruneIntervalMs: 3600000  # how often to sweep

plugins:
  "@brika/plugin-timer":
    version: "^1.0.0"
  my-local-plugin:
    version: "workspace:./plugins/my-plugin"
    config:
      apiKey: __secret_apiKey  # sentinel: real value lives in the secret store

rules: []
schedules: []
```

See [Configuration File](../cli/configuration.md) for the full schema and every option.

## `plugins/`

`plugins/node_modules/` is a regular npm tree managed by the registry install flow (`POST /api/registry/install`, exposed through the **Plugins → Registry** UI). Each installed plugin is one directory under `node_modules/`.

`plugins/<plugin-uid>/data/` is the plugin's private storage. Plugins write here through the [Storage API](../plugins/storage.md) (`readJSON`, `writeJSON`, `getDataDir`). Nothing else touches these files.

A **plugin UID** is the manifest `name` with the npm scope stripped and `@` and `/` replaced — for example `@brika/plugin-timer` → `brika.plugin-timer`. The UID appears in URLs (`/api/plugins/brika.plugin-timer/...`), in logs, and in the data directory layout.

## `state/`

* SQLite databases for tables that benefit from query power (logs index, registry cache, settings).
* JSON files for things the hub serialises and rewrites wholesale (board layouts, workflow definitions, brick instance configs).

State migrations are content-addressed: each migration file has a hash, and the migration table tracks which hashes have been applied. Rename a migration without changing its body and nothing reruns. Change the body and the migration runs again. See [State Store](../architecture/state-store.md).

## `logs/`

Logs are stored in newline-delimited JSON. The hub also keeps a per-source [ring buffer](../architecture/logs.md) in memory for fast TUI scrollback and SSE tail responses. The retention sweep deletes files older than `hub.logs.retentionDays`.

## `cache/`

Compiled brick and page modules. The plugin compiler builds each module once, names the output with a content hash (`hello.<16hex>.js`), and stores it under `cache/bricks/<plugin-name>/`. The browser can cache these files forever because the hash changes whenever the source does. See [Compiler](../architecture/compiler.md).

This directory is safe to delete — modules rebuild on demand.

## `brika.pid`

The PID of the running hub. Used by `brika status` and `brika stop`, and by `brika start` to refuse a duplicate launch in the same workspace. The file is removed on graceful shutdown; a stale PID file is recognised when the named process is no longer alive.

The path resolves to `join(cwd(), '.brika', 'brika.pid')` **at call time**, not at module load — so changing the cwd before calling the helper changes the result.

## `secrets.enc`

Only present when the hub is running with the file-backed secret store (`BRIKA_SECRETS_BACKEND=file` or auto-fallback when no keychain is available, such as inside a Docker container). Contains an AES-256-GCM encrypted blob of every secret. See [Secret Store](../architecture/secret-store.md).

On macOS / Linux desktops the default backend is the OS keychain (`Bun.secrets`), and `secrets.enc` does not exist.

## What is **not** in `.brika/`

* The binary (`~/.brika/bin/brika`) and the bundled Bun runtime — those live in the per-user install directory, not the per-workspace data directory.
* The CLI auth token (`~/.brika/cli-token`) — also per-user. Allows the local `brika` CLI to call the running hub without prompting for credentials.
* OS keychain entries (on platforms where the keychain backend is active).

## See also

* **[CLI Commands](../cli/commands.md)** — every command and what files it touches.
* **[Configuration File](../cli/configuration.md)** — the `brika.yml` schema.
* **[Environment Variables](../cli/environment.md)** — `BRIKA_HOME`, `BRIKA_SECRETS_BACKEND`, etc.
* **[Secret Store](../architecture/secret-store.md)** — backend selection and encryption details.
