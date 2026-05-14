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

`HubConfig` (see [`runtime/config/`](src/runtime/config/)) reads from env vars at boot. Notable ones:

| Var                          | Default            |
| ---------------------------- | ------------------ |
| `BRIKA_HOST`                 | `0.0.0.0`          |
| `BRIKA_PORT`                 | `7878`             |
| `BRIKA_DATA_DIR`             | OS-appropriate     |
| `BRIKA_COORDINATOR_URL`      | `signaling.brika.dev` |

## Testing

```bash
bun --filter @brika/hub test
```

The hub ships with ~2.2k tests covering the plugin runtime, brick reconciler, workflow engine, HTTP middleware, and remote-access RPC plumbing.
