# CLI Overview

The `brika` binary is **TUI-first**. Running `brika` with no arguments opens a full-screen Ink-based dashboard where you do almost everything — manage plugins, browse logs, edit settings, edit users, trigger updates. The non-TUI subcommands exist for headless and scripting scenarios (CI, Docker entrypoints, systemd units, shell aliases).

The full command list is short on purpose:

```
brika                  Open the TUI dashboard
brika dashboard        Same — explicit form
brika start            Start the hub (detached by default)
brika stop             Stop the running hub (SIGTERM)
brika status           Print hub state, pid, url
brika open             Open the hub UI in your default browser
brika hub              Boot the hub headlessly in the foreground
brika version          Print binary version + build info
brika update           Check for and apply an update
brika completions      Install / print shell completions
brika help             Show help for a command
```

Anything not in that list (managing plugins, viewing logs, editing users) is **inside the TUI** or **inside the web UI** — see [TUI Dashboard](tui.md).

## Global flags

Every command honours these:

| Flag | Description |
|---|---|
| `--help`, `-h` | Show help for the command |
| `--no-color` | Disable ANSI colour in output |
| `BRIKA_HOME=…` (env) | Override the data directory (`.brika/`) |
| `BRIKA_HOST=…` (env) | Override the hub bind address |
| `BRIKA_PORT=…` (env) | Override the hub bind port |
| `BRIKA_NO_BOOT=1` (env) | Skip the TUI boot splash |

See [Environment Variables](environment.md) for the full list, including build-time variables and feature toggles.

## Exit codes

Status-style commands use exit codes so scripts can branch on them without parsing output:

| Code | Meaning |
|---|---|
| `0` | Success / hub running |
| `1` | Hub stopped (status command) |
| `2` | Stale PID file detected (status command) |
| non-zero | Any other failure (CLI prints the error to stderr) |

## How commands reach the running hub

`brika status`, `brika open`, and `brika update` all talk to the hub over HTTP, not by reaching into shared memory. The CLI reads `~/.brika/cli-token` (a per-user bearer token written by the hub on startup) and includes it in the `Authorization` header so the request bypasses normal auth. See [Authentication](../architecture/auth.md) for the auth model.

If you have multiple hubs running on different ports on the same machine, set `BRIKA_HOST` / `BRIKA_PORT` to target a specific one.

## Detached vs attached

`brika start` defaults to detached: it spawns a child process that runs the hub, waits ~1.5 s for the PID file to appear, prints the supervisor PID, and exits. The terminal returns control to you immediately.

`brika start --attach` (or the lower-level `brika hub`) runs the hub **in this process**. Ctrl+C stops it. Use this when:

* You want logs streaming to your terminal in real time.
* You're inside Docker, systemd, or any process supervisor that wants the process to stay attached.
* You're debugging the hub itself.

The detached path also wires in a tiny supervisor process (`brika start` re-invokes itself with a hidden internal command, `__supervisor`) that restarts the hub when it exits with code 42 — the update path.

## See also

* **[Commands](commands.md)** — every subcommand explained with examples.
* **[TUI Dashboard](tui.md)** — what lives inside the interactive UI.
* **[Configuration File](configuration.md)** — `brika.yml` schema reference.
* **[Environment Variables](environment.md)** — every `BRIKA_*` variable.
