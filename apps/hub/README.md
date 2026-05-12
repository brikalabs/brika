# @brika/hub

The Brika home hub — a Bun runtime that hosts plugins, runs workflows, and serves the dashboard UI. This is the binary your devices and apps actually talk to.

## What it does

- **Plugin host** — loads, sandboxes, and supervises Brika plugins (Spotify, Matter, weather, your own)
- **Workflow engine** — runs `@brika/flow` graphs that connect plugin ports
- **Brick runtime** — backs the dashboard's interactive Brick widgets (`@brika/sdk/bricks`)
- **Local HTTP API** — `/api/*` served via `@brika/router`, consumed by the UI over HTTPS on the LAN
- **Remote access** — opt-in WebRTC bridge through a signaling coordinator (see [`@brika/signaling-worker`](../signaling-worker/))
- **CLI** — `brika start | stop | logs` lives at [`src/cli.ts`](src/cli.ts)

## Quick start

```bash
bun --filter @brika/hub dev      # watch mode
brika start                      # production binary (after `bun run compile`)
brika logs --follow
```

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
