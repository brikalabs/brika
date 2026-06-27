# Commands

Every `brika` subcommand, every flag, examples, and what each command actually does under the hood.

## `brika` / `brika dashboard`

Open the full-screen TUI. Default command — running `brika` with no arguments is the same as `brika dashboard`.

| Flag | Description |
|---|---|
| `--no-boot` | Skip the boot splash (also: `BRIKA_NO_BOOT=1`) |

```sh
brika
brika dashboard
brika --no-boot
```

The TUI is a small React app rendered with Ink. See [TUI Dashboard](tui.md) for what's inside.

## `brika start`

Boot the hub. Detached by default (returns immediately), or attached (blocks the terminal) with `--attach`.

| Flag | Default | Description |
|---|---|---|
| `--attach`, `-a` | off | Run in foreground; same as `brika hub` |
| `--port`, `-p` | `3001` | Listen port |
| `--host` | `127.0.0.1` | Listen address |
| `--open` | off | Open the hub UI in the browser once it is ready |

```sh
brika start                       # detach
brika start --open                # detach, then open the UI when ready
brika start --attach              # foreground
brika start -p 8080
brika start --host 0.0.0.0
brika start -a -p 8080 --host 0.0.0.0
```

`--open` waits for the hub to answer `/api/health` (not just claim its pid file) before launching the browser, so you do not land on a connection-refused page. It composes with `--attach` (the browser opens in the background while the foreground hub runs).

Detached mode forks a `brika hub` child, writes its PID into `.brika/brika.pid`, and waits ~1.5 s for the hub's `/api/health` to respond before printing the supervisor PID. If a hub is already running in the workspace the command refuses with a clear error.

The internal `__supervisor` re-invocation wraps the hub so an exit code of `42` (used by the in-process updater) triggers a clean restart instead of a permanent stop.

## `brika stop`

Send `SIGTERM` to the running hub.

```sh
brika stop
```

Reads the PID from `.brika/brika.pid`. Handles three states:

* **running** — sends `SIGTERM`, prints `sent SIGTERM to pid N`.
* **stale** — PID file exists but the process is gone; the file is cleared and `stale pid file — cleared` is printed.
* **stopped** — no PID file. `hub is not running` is printed (exit 0).

If a hub is serving on the port but no PID file exists (it was started outside the CLI), `brika stop` refuses to kill it — find the PID with `lsof` or `ss` and stop it yourself.

## `brika status`

Print the hub's current state on one line, machine-friendly.

```sh
$ brika status
running pid=12345 url=http://127.0.0.1:3001
```

Possible outputs:

| Output | Exit |
|---|---|
| `running pid=N url=…` | 0 |
| `running url=…` (no PID file but hub responding) | 0 |
| `stale pid=N` | 2 |
| `stopped` | 1 |

## `brika open`

Open the hub UI in your default browser. If no hub is running, `open` starts one (detached) first so you do not land on a connection-refused page. Pass `--no-start` to refuse instead of starting a hub.

```sh
brika open
brika open --no-start   # error out if the hub isn't running
```

Honours `BRIKA_HOST` and `BRIKA_PORT`.

## `brika hub`

The low-level foreground boot. Identical to `brika start --attach`. Used by:

* The TUI when you press *Ctrl+S* to start a hub.
* Docker / systemd / CI entrypoints where you want the hub to run as PID 1.

| Flag | Default | Description |
|---|---|---|
| `--port`, `-p` | `3001` | Listen port |
| `--host` | `127.0.0.1` | Listen address |

```sh
brika hub
brika hub -p 8080
brika hub --host 0.0.0.0
```

## `brika registry`

Manage the registries the hub installs and searches from (talks to the running hub, started if needed).
See [Registries](registries.md).

```sh
brika registry list                                     # show default registry, scope overrides, stores
brika registry add @acme https://npm.acme.com           # route a scope's installs to a registry
brika registry add @acme https://npm.acme.com --store https://store.acme.com   # + federated search
```

| Argument / flag | Description |
|---|---|
| `add <scope> <registry-url>` | Map a scope's installs to an npm-protocol registry (persisted to `brika.yml`, rewrites the `.npmrc`) |
| `--store, -s <url>` | Also add a `/v1` store to federated search |
| `list` | Print the current registry configuration (default with no subcommand) |

## `brika version`

Print binary version, commit, branch, build time, runtime version, and platform.

| Flag | Description |
|---|---|
| `--plain`, `-p` | Skip animation; print a plain key/value block |
| `--json` | Print one JSON line (used by installer scripts) |

```sh
brika version
brika version --plain
brika version --json
```

Default mode runs a short Brix animation in the TUI. The CLI auto-falls back to `--plain` when stdout is not a TTY. Build info is baked into the binary at `bun build --compile` time via the `buildInfo` macro, so it always matches what's running.

## `brika update`

Check for a new release and apply it. Runs the updater **in this process**, so it works whether or not the hub is running (no HTTP call, no cli-token).

| Flag | Description |
|---|---|
| `--check` | Check only; print availability and exit |
| `--yes`, `-y` | Apply without prompting |
| `--force` | Reinstall the current version |
| `--channel <name>` | Override the channel for this run only (`stable`, `beta`, `canary`, `pinned`) |

```sh
brika update                    # check, prompt, apply
brika update --check
brika update --yes
brika update --channel canary
brika update --force
```

The apply is dispatched through the same per-runtime strategy the hub uses. On a **standalone** install it performs an in-place binary swap guarded by the cross-process `.update.lock` (so it cannot race a hub-driven apply). On a **container**, **system-package**, or **dev** install it refuses with guidance (pull a new image / use your package manager / you are running from source) instead of clobbering a binary it does not own.

The saved update channel and pinned version are read from the hub's SQLite state **read-only**: the CLI honours what the hub/UI persisted but never writes that DB. `--channel` overrides the channel for a single run without persisting it; change the saved channel from the hub UI.

If a hub is running when the swap completes, it keeps serving the old binary until you restart it (`brika stop` then `brika start`); the command prints a reminder.

## `brika completions`

Install, uninstall, or print shell completion scripts.

| Flag | Description |
|---|---|
| `--uninstall` | Remove completions from the shell profile |

```sh
brika completions              # auto-detect shell and install
brika completions bash         # print raw bash script
brika completions zsh          # print raw zsh script
brika completions fish         # print raw fish script
brika completions --uninstall  # remove
```

The default flow auto-detects your shell and writes the appropriate completion script into your shell profile. Passing an explicit shell name prints the raw script to stdout — useful when you want to manage the file yourself.

## `brika help`

Show help. The CLI framework auto-generates it from each command's `description`, `options`, and `examples`.

```sh
brika help               # global help
brika help start         # help for one command
brika --help
brika start --help
```

## Hidden commands

The binary registers two hidden commands that don't show up in `brika help`:

* `brika brix` — easter-egg animation (try it, your terminal will thank you).
* `brika __supervisor` — internal; re-invoked by `brika start` to wrap the hub with an exit-code-42 restart loop. Not meant to be called directly.

## What's not a CLI command

The original Brika design intentionally avoids spreading management across many CLI subcommands. **Plugin install/uninstall, user management, log viewing, and most settings live in the TUI** (`brika`) **or the web UI** (`brika open`).

If you're writing scripts and need to interact with the hub programmatically, hit the [HTTP API](../api/overview.md) directly — the CLI does exactly that internally.

## See also

* **[TUI Dashboard](tui.md)** — every screen in the interactive UI.
* **[Configuration File](configuration.md)** — the `brika.yml` reference.
* **[HTTP API](../api/overview.md)** — for scripting beyond what the CLI offers.
