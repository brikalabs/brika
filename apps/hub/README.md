# @brika/hub

The Brika home hub — a Bun runtime that hosts plugins, runs workflows, and serves the dashboard UI. This is the binary your devices and apps actually talk to.

## What it does

- **Plugin host** — loads, sandboxes, and supervises Brika plugins (Spotify, Matter, weather, your own)
- **Workflow engine** — runs `@brika/flow` graphs that connect plugin ports
- **Brick runtime** — backs the dashboard's interactive Brick widgets (`@brika/sdk/bricks`)
- **Local HTTP API** — `/api/*` served via `@brika/router`, consumed by the UI over HTTPS on the LAN
- **Remote access** — opt-in WebRTC bridge through a signaling coordinator (see [`@brika/signaling`](../signaling/))
- **CLI** — `brika start | stop | logs` lives at [`src/cli.ts`](src/cli.ts)

## Quick start

```bash
bun run dev                      # full stack: signaling (Worker via miniflare) + hub + Vite UI
                                 # auto-claims `devhub`, proxies UI to Vite, HMR everywhere
                                 # → open http://localhost:7878 (LAN path)
                                 # → or http://localhost:5174/devhub?debug=1 (remote-access path)
bun --filter @brika/hub dev      # hub only (UI served only if BRIKA_STATIC_DIR set)
bun run dev:signaling            # signaling only (Worker + bootstrap shell, HMR)
brika start                      # production binary (after `bun run compile`)
brika logs --follow
```

### Dev UI proxy (HTTP + WebSocket)

When `BRIKA_DEV_UI_PROXY` is set, the hub forwards every non-`/api/*` request
— including WebSocket upgrades — to that URL. Vite's HMR socket therefore
works when developers open `localhost:7878` through the hub instead of
`localhost:5173` directly.

```bash
bun --filter @brika/ui dev &                                   # Vite on :5173
BRIKA_DEV_UI_PROXY=http://localhost:5173 bun --filter @brika/hub dev
```

The root `bun run dev` script does this automatically.

### Dev auto-claim

`BRIKA_DEV_AUTOCLAIM=<name>` makes the hub call the coordinator's
`/v1/hubs/claim` on boot if no claim is persisted yet. Skips the manual
"visit Settings → Remote access" step every fresh worktree. Combines well
with `BRIKA_COORDINATOR_URL` pointing at a local `wrangler dev` instance.

### End-to-end remote loop

`bun run dev` is that command. It spins up:

- `vite dev` on :5174  — coordinator (Workers via miniflare) + bootstrap shell with HMR
- `vite dev` on :5173  — hub UI with HMR
- hub        on :7878  — auto-claims `devhub`, proxies UI to Vite

Then open `http://localhost:5174/devhub?debug=1` and you have the full
production code path locally: bootstrap → WebRTC → hub → UI through the
data channel. `?debug=1` prints every bootstrap step to the console.

## Layout

```
src/
  cli.ts                     # binary entrypoint
  main.ts                    # service bootstrap
  hub.ts                     # DI root + plugin lifecycle
  runtime/
    bootstrap/               # ordered service startup
    http/                    # ApiServer + middleware + routes
    remote-access/           # WebRTC bridge, peer sessions, RPC server
    plugins/                 # plugin registry, sandboxing, IPC
    bricks/                  # Brick types + instances
    blocks/                  # Block registry
    sparks/                  # Spark registry
    workflows/               # workflow runtime
    logs/                    # structured log router
    store/                   # SQLite-backed KV store
    events/                  # internal event bus
    secrets/                 # OS-keychain-backed secret store
    config/                  # HubConfig + env parsing
    db/                      # Drizzle + migrations (embedded via macros)
  plugins/                   # builtin plugin loaders
```

## Configuration

`HubConfig` (see [`runtime/config/`](src/runtime/config/)) reads from env vars at boot. The full list is grouped by intent below — search for each name in the source to find the exact read site.

### Runtime

| Var                          | Default                  | Purpose                                                                                          |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `BRIKA_HOST`                 | `0.0.0.0`                | Hub HTTP bind address                                                                            |
| `BRIKA_PORT`                 | `7878`                   | Hub HTTP port (`3001` in Docker / mortar)                                                        |
| `BRIKA_HOME` / `BRIKA_DATA_DIR` | OS-appropriate        | Workspace dir (databases, plugins, boards, secrets)                                              |
| `BRIKA_BUN_PATH`             | `bun` on `PATH`          | Bun runtime path used to spawn plugin child processes                                            |
| `BRIKA_LOG_LEVEL`            | `info`                   | `debug` / `info` / `warn` / `error`                                                              |
| `BRIKA_LOG_COLOR`            | auto                     | Force ANSI colour on/off in log output                                                           |
| `BRIKA_STATIC_DIR`           | (unset)                  | Serve UI from this directory instead of the embedded archive                                     |
| `BRIKA_NO_BOOT`              | `false`                  | Initialise the hub but don't start the HTTP server (used by tests)                               |

### Updates

| Var                                 | Default     | Purpose                                                                                          |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `BRIKA_UPDATE_CHANNEL`              | `stable`    | `stable` (GitHub releases/latest) or `canary` (latest pre-release)                               |
| `BRIKA_DEV_FAKE_UPDATE`             | (unset)     | Dev-only: skip GitHub, return synthetic `UpdateInfo`. See "Dev-only update mock" below           |
| `BRIKA_DEV_FAKE_UPDATE_DELAY_MS`    | `400`       | Per-phase delay (ms) for the synthetic apply stream                                              |

### Remote access (`feat/remote-access`)

| Var                                 | Default                       | Purpose                                                            |
| ----------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `BRIKA_COORDINATOR_URL`             | `wss://api.brika.dev`         | WebRTC signaling coordinator URL                                   |
| `BRIKA_REMOTE_CLAIM`                | (unset)                       | Hub-name claim token (set by `brika remote claim` flow)            |
| `BRIKA_DEV_AUTOCLAIM`               | (unset)                       | Auto-claim this name on dev startup (mortar pins `devhub`)         |

### Plugins / Registry

| Var                                 | Default                                | Purpose                                                |
| ----------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| `BRIKA_REGISTRY`                    | `https://registry.brika.dev`           | Plugin registry endpoint                               |
| `BRIKA_REGISTRY_PUBLIC_KEY`         | bundled                                | Override for signature verification                    |

### Secrets

| Var                                 | Default                       | Purpose                                                                                  |
| ----------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `BRIKA_SECRETS_BACKEND`             | `keychain` (binary) / `file` (Docker) | `keychain` (OS-native) or `file` (AES-256-GCM under `BRIKA_HOME/.brika/`)         |
| `BRIKA_SECRET_KEY`                  | (required for `file`)         | Base64-encoded 32-byte key for the file backend                                          |

### Dev-only (UI + TUI integration)

| Var                                 | Default                       | Purpose                                                                            |
| ----------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| `BRIKA_DEV_UI_PROXY`                | (unset)                       | Forward non-`/api/*` requests to a Vite dev server (e.g. `http://localhost:5173`)  |
| `BRIKA_BRIX_SPEED`                  | (unset)                       | Override default TUI render cadence (used by `apps/console/src/features/brix/`)    |

## Testing

```bash
bun --filter @brika/hub test
```

The hub ships with ~2.2k tests covering the plugin runtime, brick reconciler, workflow engine, HTTP middleware, and remote-access RPC plumbing.

## Dev-only update mock (`BRIKA_DEV_FAKE_UPDATE`)

Iterate on the update UI (onboarding step, settings dialog, `brika update` CLI) without touching GitHub, building a downgraded binary, or risking a real in-place binary swap. Set the env var to one of the scenarios below and reload the page:

| Scenario              | What it shows                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `available`           | `updateAvailable: true`, latest = current patch + 1                                                      |
| `dev-build`           | `devBuild: true`, current ahead of channel                                                               |
| `channel-mismatch`    | `channelMismatch: true`, current is a `-canary.*` tag on the stable channel                              |
| `up-to-date`          | Real "nothing to do" path — exercises the dwell + Continue flow                                          |
| `apply-error`         | Check returns `available`; applying short-circuits to `phase: 'error'` mid-stream                        |
| `force-real-install`  | **Hybrid.** Real GitHub check with `updateAvailable: true` forced; applying runs the **real** binary swap with `force: true`. Use this to test the genuine download/verify/extract/restart pipeline without waiting for a real release bump. |

Applying an update while a *synthetic* scenario is active (every row except `force-real-install`) **does not touch the filesystem** — it emits scripted SSE progress events on a timer (default 400 ms per phase, override with `BRIKA_DEV_FAKE_UPDATE_DELAY_MS`).

`force-real-install` is the exception: it goes through the real `GitHubUpdateProvider`, downloads the platform asset, verifies the SHA256, rewrites `process.execPath`, and triggers a hub restart. Use it only when you actually want to exercise the swap.

```bash
# Onboarding step shows "update available" + version diff
BRIKA_DEV_FAKE_UPDATE=available bun --filter @brika/hub dev

# Exercise the failure path (no real download)
BRIKA_DEV_FAKE_UPDATE=apply-error bun --filter @brika/hub dev

# REAL apply against GitHub's latest, even when already current.
# This will actually replace the binary and restart the hub.
BRIKA_DEV_FAKE_UPDATE=force-real-install bun --filter @brika/hub dev
```

The hub logs a loud `[updater] BRIKA_DEV_FAKE_UPDATE active — scenario=…` warning when this is on. Unset the var to restore real behaviour.

### How it's wired

1. **DI seam.** `UpdateService` and the apply HTTP route both inject `UpdateProvider` (`runtime/updates/update-provider.ts`). They don't know whether the source is GitHub or a mock.
2. **Bootstrap selection.** `runtime/bootstrap/plugins/updates.ts` decides — at hub init — which concrete class binds to `UpdateProvider`. If `BRIKA_DEV_FAKE_UPDATE` is set, it dynamically imports `__dev__/updater.mock.ts` and registers `MockUpdateProvider`. Otherwise it registers `GitHubUpdateProvider`.
3. **`*.mock.ts` convention.** Any file ending in `.mock.ts` is dev-only. The `stub-mock-files` Bun.build plugin (`apps/build/src/plugins/stub-mock-files.ts`) replaces these with a throwing stub when producing the compiled binary. The dev runtime sees the real file; the production binary literally cannot contain mock code. See `apps/build/README.md` for the full build pipeline.
4. **Defense in depth.** If a misconfigured prod hub somehow has `BRIKA_DEV_FAKE_UPDATE` set, the dynamic import lands on the throwing stub, the bootstrap's try/catch fires, it logs a warning, and falls back to the real `GitHubUpdateProvider`.
