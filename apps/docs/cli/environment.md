# Environment Variables

Every `BRIKA_*` environment variable the hub, CLI, TUI, plugin processes, and install scripts recognise.

## Runtime — Hub server

| Variable | Default | Read by | Purpose |
|---|---|---|---|
| `BRIKA_HOME` | `<cwd>/.brika` | Hub, CLI, supervisor | Override the workspace data directory |
| `BRIKA_HOST` | `127.0.0.1` | Hub | Bind address |
| `BRIKA_PORT` | `3001` | Hub | Bind port |
| `BRIKA_STATIC_DIR` | bundled UI | Hub | Serve UI from this directory instead of bundled assets (production) |
| `BRIKA_DEV_UI_PROXY` | unset | Hub (dev only) | Proxy non-`/api/*` requests to this origin (typically `http://localhost:5173` for Vite). Wins over `BRIKA_STATIC_DIR` when set |
| `BRIKA_MAX_REQUEST_BODY_BYTES` | `1073741824` (1 GiB) | Hub | HTTP body size cap. `0` disables the cap |
| `BRIKA_COORDINATOR_URL` | `https://hub.brika.dev` | Hub | Remote-access coordinator origin |
| `BRIKA_BUN_PATH` | bundled `bun` | Plugin supervisor | Path to the Bun binary used to spawn plugin processes |

## Runtime — Plugins

| Variable | Default | Read by | Purpose |
|---|---|---|---|
| `BRIKA_SECRETS_BACKEND` | `auto` | Hub | Select secret store backend: `auto` (keychain → file fallback), `keychain`, or `file` |
| `BRIKA_SANDBOX_MODE` | `auto` | Plugin supervisor | macOS plugin sandbox: `exec` (sandbox-exec wrapper), `noop` (JS layer only), or `auto` |
| `BRIKA_PLUGIN_HEARTBEAT_INTERVAL_MS` | from `brika.yml` | Hub | Ping interval to plugins |
| `BRIKA_PLUGIN_HEARTBEAT_TIMEOUT_MS` | from `brika.yml` | Hub | Mark plugin unresponsive after this many ms without a pong |

## CLI / TUI

| Variable | Default | Purpose |
|---|---|---|
| `BRIKA_NO_BOOT` | unset | When `1`, skips the TUI boot splash |
| `NO_COLOR` | unset | Standard env: when set, disables ANSI colour everywhere |
| `BRIKA_LOG_COLOR` | unset | Force log colour on (`1`) or off (`0`) regardless of TTY detection |

## Build / install scripts

These only matter for the installer (`scripts/install.sh`, `scripts/install.ps1`) and CI builds.

| Variable | Default | Purpose |
|---|---|---|
| `BRIKA_VERSION` | `latest` | Pin the version to install. `latest`, `canary`, or a specific tag (`v1.2.3`) |
| `BRIKA_INSTALL_DIR` | `~/.brika/bin` / `%LOCALAPPDATA%\brika\bin` | Override the binary install directory |
| `BRIKA_INSECURE` | unset | When `1`, skip minisign signature verification even when a public key is embedded |
| `BRIKA_MINISIGN_PUBKEY` | (embedded at build time) | The minisign public key the installer checks downloads against |

## Logging

| Variable | Default | Purpose |
|---|---|---|
| `LOG_LEVEL` | `info` | Minimum log level emitted by the hub. `debug` for verbose tracing |
| `BRIKA_LOG_FORMAT` | `pretty` (TTY) / `json` (non-TTY) | Force the log format |

## Development / debugging

| Variable | Purpose |
|---|---|
| `BRIKA_INSPECT=1` | Enable the Bun inspector on plugin processes (developer aid) |
| `BRIKA_DISABLE_HOST_ALLOWLIST=1` | Disable the host header allowlist (only safe behind a private LAN) |
| `BRIKA_NO_OPEN=1` | Suppress the auto-`open` behaviour in `brika start --open` (not implemented as a flag; defensive override) |

## Precedence

For settings that exist in both the config file and an env var, **env vars win**. The hub reads `brika.yml` first to seed defaults, then applies env overrides during the `HubConfig` constructor.

For settings the CLI also accepts as flags (`--port`, `--host`), the CLI **sets the env var** on the parent process *before* spawning the detached hub child, so the child inherits the override and `brika status` health-probes the right address. Flags effectively become env vars for the spawn.

## See also

* **[Configuration File](configuration.md)** — `brika.yml` schema.
* **[Secret Store](../architecture/secret-store.md)** — `BRIKA_SECRETS_BACKEND` deep dive.
* **[Install Scripts](../architecture/install-scripts.md)** — how `BRIKA_VERSION` and `BRIKA_MINISIGN_PUBKEY` are used.
