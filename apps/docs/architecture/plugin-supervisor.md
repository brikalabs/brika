# Plugin Supervisor

The plugin supervisor is the part of the hub that spawns, watches, and restarts plugin processes. It owns the IPC handshake, the heartbeat loop, the restart policy, and the per-plugin permission vector.

Key files:

* `apps/hub/src/runtime/plugins/plugin-process.ts` — spawn + lifecycle.
* `apps/hub/src/runtime/plugins/restart-policy.ts` — backoff + crash-loop detection.
* `apps/hub/src/runtime/plugins/plugin-config.ts` — preferences hot-reload.
* `apps/hub/src/runtime/plugins/grants/{dispatch,vector}.ts` — grant enforcement.
* `packages/ipc/src/host.ts` — `PluginChannel`, the host side of the IPC channel.

## Spawn

A plugin process is a `Bun.spawn` of `bun --bun <plugin-main>`. The hub:

1. Resolves the plugin's entry from `package.json#main`.
2. Builds the env (BRIKA_HOME, BRIKA_LOG_COLOR, plugin UID, etc.).
3. Spawns with `serialization: 'advanced'` and an `ipc` callback wired to the hub's `PluginChannel`.
4. Captures stdout, stderr (last 20 lines buffered for error context), and the `proc.exited` promise.
5. Names the process via `argv0` so `ps` shows the plugin name.

The child imports `@brika/sdk`, which establishes the IPC channel automatically.

## Hello / Ready handshake

```
Plugin → Hub:  hello { plugin: { id, version, requires?: { hub, sdk } } }
Hub    → Plugin: preferences { values }
Plugin → Hub:  ready {}
```

* `hello` is the plugin announcing itself with its version and optional engine requirements. The hub rejects the plugin if `requires.hub` or `requires.sdk` don't satisfy the current versions.
* The hub immediately pushes the current preferences via `preferences { values }`.
* `ready` confirms the plugin is set up and listening.

After `ready`, the hub starts the heartbeat loop and begins servicing block start requests, action calls, etc.

## Heartbeat

The hub sends a `ping` RPC every `heartbeatInterval` ms (default 5 s, configurable in `brika.yml`). The plugin's IPC channel auto-responds. If no `pong` arrives within `heartbeatTimeout` ms (default 15 s), the supervisor marks the plugin unresponsive and kills it. The restart policy then decides whether to spawn a replacement.

The 15 s default was tuned to survive non-trivial IPC load — e.g. a UI page fetching multiple thumbnails through plugin routes. With short timeouts, the ping response queues behind route responses and trips the timeout, after which the hub kills + restarts the plugin and any in-flight requests fail with "Killed". 60 s is what `PluginManagerConfig` falls back to when nothing is configured.

## Restart policy

The policy lives in `restart-policy.ts`:

* **Base delay** — 1 s. After a crash, wait this long before restarting.
* **Max delay** — 60 s. Backoff doubles each crash; capped here.
* **Crash window** — 60 s. The window over which crashes count.
* **Max crashes** — 5. More than 5 crashes within the window puts the plugin in **crash-loop** state — auto-restart stops; the user must reload manually.
* **Stability period** — 30 s. A process that runs for at least 30 s resets the backoff to base.

```
       crash
        │
        ▼
Wait `delay` ms   ← starts at 1s, doubles each crash, capped at 60s
        │
        ▼
   Restart
        │
        ▼
Run ≥ 30s? ── yes ── reset backoff to 1s
        │
        no
        │
        ▼
   Another crash → if ≥5 in 60s window, enter crash-loop (no auto-restart)
```

Plugins in crash-loop are flagged in the UI with a clear error. The user can investigate logs and click *Reload*.

## PID file

The hub itself writes its PID to `.brika/brika.pid` on startup. `brika start` refuses to launch a second hub in the same workspace by checking the PID file. The path resolves at call time via `pid()` (`join(process.cwd(), '.brika', 'brika.pid')`) — not at module load — so changing the cwd before calling the helper changes the result. The exported `PID_FILE` const is for CLI use only and captures the cwd at import time.

Stale PID files (file exists but process doesn't) are detected with `process.kill(pid, 0)` and cleared.

## Grant dispatch

When a plugin process calls a hub-mediated API (`fetch`, `Bun.file`, `getSecret`, `getDeviceLocation`), the SDK's grant proxy sends a `grantRequest` IPC RPC. The hub's grant dispatcher:

1. Looks up the grant's spec (args/result schema, permission requirement, handler).
2. Checks the plugin's permission vector for the required permission.
3. Validates the args against the Zod schema.
4. Calls the handler.
5. Optionally redacts args/result for the audit log.
6. Returns the result.

Each grant has its own 60 s watchdog timeout hub-side. The plugin's IPC channel has its own 30 s default RPC timeout for the outer `grantRequest`, plus call-site overrides.

See [Permissions & Grants](permissions-grants.md) for the full grant model.

## Preferences hot-reload

When the user edits a plugin's preferences in the UI, the hub:

1. Persists the change (and routes secrets through the [Secret Store](secret-store.md)).
2. Re-sends `preferences { values }` over IPC.
3. The plugin's `onPreferencesChange` handlers fire — no process restart needed.

If the plugin is currently down (crash-loop, awaiting-config), the new preferences are applied on the next start.

## Stop and uninstall

* **stop** — hub sends `stop {}`, plugin runs `onStop` handlers, exits gracefully. SIGKILL after `killTimeoutMs` (default 3 s).
* **uninstall** — hub sends `uninstall {}` first, plugin runs `onUninstall` handlers, then `stop` follows.

After both finish, the hub removes the plugin from `.brika/plugins/` and rewrites `brika.yml`.

## Health states

A plugin can be in any of these states (visible in the UI):

| State | Meaning |
|---|---|
| `running` | Healthy, responding to pings |
| `stopped` | Disabled by the user |
| `crashed` | Died unexpectedly; will restart per the policy |
| `crash-loop` | Crashed too many times; auto-restart suspended |
| `incompatible` | Manifest validation failed or engine range doesn't match |
| `awaiting-config` | Required preferences not set |
| `installing` / `updating` / `restarting` | Transitional states |
| `degraded` | Running but reporting problems via logs |

## See also

* **[IPC Protocol](ipc-protocol.md)** — the wire format the supervisor uses.
* **[Permissions & Grants](permissions-grants.md)** — the grant dispatcher.
* **[Logs](logs.md)** — where crash output lands.
* **[Lifecycle](../plugins/lifecycle.md)** — the plugin-side `onInit`/`onStop`/`onUninstall`.
