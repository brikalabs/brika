# System Overview

Brika is a self-hosted hub plus a web UI plus N plugin processes, with a small set of well-defined protocols between them. This page walks the whole picture; the rest of the architecture chapter drills into each subsystem.

## Process model

```
┌──────────────────────────────────────────────────────────────────────┐
│  Operator's machine                                                   │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  Hub process (Bun, single process)                               │ │
│  │                                                                  │ │
│  │  HTTP/SSE server  ───  REST API  ───  Routes per resource        │ │
│  │       │                                                          │ │
│  │       │           ┌─ Workflow runtime  ─ block instances         │ │
│  │       └─ Services ┼─ Board service     ─ brick instance configs  │ │
│  │                   ├─ Plugin supervisor ─ spawn/heartbeat/restart │ │
│  │                   ├─ Event bus         ─ sparks, system events   │ │
│  │                   ├─ Module compiler   ─ brick/page bundles      │ │
│  │                   ├─ Auth + scopes     ─ users, CLI tokens       │ │
│  │                   ├─ Secret store      ─ keychain / encrypted    │ │
│  │                   └─ State store       ─ Drizzle/SQLite + JSON   │ │
│  └────────────────┬────────────────┬────────────────┬───────────────┘ │
│                   │ IPC            │ IPC            │ IPC             │
│              ┌────┴─────┐    ┌────┴─────┐    ┌────┴─────┐             │
│              │  Plugin  │    │  Plugin  │    │  Plugin  │ …           │
│              │  process │    │  process │    │  process │             │
│              └──────────┘    └──────────┘    └──────────┘             │
└──────────────────────────────────────────────────────────────────────┘
              ▲ HTTP + SSE
              │
       ┌──────┴──────┐
       │   Browser   │  React app — boards, workflows, plugin admin
       └─────────────┘
```

* **One hub process** owns the HTTP server, the workflow runtime, the supervisor, persistence, and authentication.
* **One Bun subprocess per plugin** runs the plugin's blocks, sparks, actions, lifecycle hooks. The hub talks to each via Bun's structured-clone IPC channel.
* **One browser-side React app** renders boards and the workflow editor. Bricks and pages are bundled per-plugin by the [compiler](compiler.md) and dynamically imported by the host UI on demand.

There is no daemon manager, no separate orchestrator. The hub is the only long-running Brika process; it spawns and reaps everything else.

## Communication

| Path | Protocol |
|---|---|
| Hub ↔ Browser | HTTP for REST, SSE for live streams (`/api/stream/*`) |
| Hub ↔ Plugin | Bun's `ipc.send`/`ipc.on` with `serialization: 'advanced'` — native binary, Date, Map, Set |
| Plugin ↔ Plugin | Always via the hub. Plugins never talk to each other directly |
| Hub ↔ Coordinator (optional) | WebSocket to `wss://hub.brika.dev/v1/hub` for remote-access signaling |
| Browser ↔ Hub (remote) | WebRTC data channel brokered by the coordinator |

The hub-to-plugin protocol is a small typed message contract — every message and RPC is defined as a Zod schema in [`@brika/ipc/contract`](ipc-protocol.md). Plugins never see the wire format; the SDK wraps it.

## Lifecycle of a request

Concrete example: the user opens the dashboard and a brick on a board renders the current temperature.

1. **Browser → Hub**: `GET /` returns the static UI shell.
2. **Browser → Hub**: `GET /api/boards/<id>` returns the board's layout (brick types and per-instance configs).
3. **Browser → Hub**: `GET /api/bricks/modules/<plugin-uid>/<brick-id>.<hash>.js` — fetches the compiled brick module. The hub looks in the disk cache; on miss, the [compiler](compiler.md) runs `Bun.build` over `src/bricks/<brick-id>.tsx` with the [externals plugin](externals-rewrite.md) rewriting bridge imports, produces a hashed file, writes it to `.brika/cache/bricks/`, serves it with `Cache-Control: immutable`.
4. **Browser**: the [plugin bridge](externals-rewrite.md) has already populated `globalThis.__brika.*`. The dynamic `import(url)` resolves successfully because the brick's `react`, `lucide-react`, etc. imports all map to the bridge.
5. **Browser**: the brick renders. `useBrickData<T>()` registers a subscription on the [shared SSE pool](sse-pool.md); the hub starts sending `brickData` events for this brick type.
6. **Hub → Plugin** (already running): the plugin process has been pushing data via `setBrickData('current-weather', payload)` every 30s. The hub fans the data out to every connected browser.
7. **Browser**: every push re-renders the brick.

Each of these steps lives in a deeper page in this chapter.

## Subsystems

| Subsystem | Page |
|---|---|
| HTTP server, REST routes, SSE | [Hub Server](hub.md) |
| Plugin spawning, heartbeat, restart policy, PID locking | [Plugin Supervisor](plugin-supervisor.md) |
| Binary IPC: message format, RPC, contracts | [IPC Protocol](ipc-protocol.md) |
| Brick/page bundling, action ID generation, Tailwind scoping | [Compiler](compiler.md) |
| `globalThis.__brika.*` bridge between host UI and bricks | [Externals Rewrite](externals-rewrite.md) |
| How bricks load and render | [Brick Rendering](brick-rendering.md) |
| Shared `EventSource` pool — Chrome 6-conn limit | [Shared SSE Pool](sse-pool.md) |
| `Flow`/`Source`/`Emitter` scheduling, cleanup registry | [Reactive Engine](reactive-engine.md) |
| Zod → TypeDescriptor → JSON over IPC | [Type System](type-system.md) |
| `@brika/schema` → schema.brika.dev publishing | [Schema Generation](schema-generation.md) |
| Permission vector, grant dispatch, audit redaction | [Permissions & Grants](permissions-grants.md) |
| Drizzle/SQLite + JSON state, hash-based migrations | [State Store](state-store.md) |
| Keychain / encrypted file backends | [Secret Store](secret-store.md) |
| Ring buffer, SSE stream, retention sweep | [Logs](logs.md) |
| CLI tokens, user sessions, scopes, host allowlist | [Authentication](auth.md) |
| Coordinator claim flow, WebRTC SDP/ICE | [Remote Access](remote-access.md) |
| macOS sandbox-exec wrapping | [Sandbox](sandbox.md) |
| i18n-dev Vite plugin, call-site injection | [i18n Pipeline](i18n-pipeline.md) |
| `apps/build` targets, cross-compile | [Build Pipeline](build-pipeline.md) |
| install.sh / install.ps1 version resolution, minisign | [Install Scripts](install-scripts.md) |

## Code map

| Path | Owns |
|---|---|
| `apps/hub/` | The hub server |
| `apps/ui/` | The React frontend |
| `apps/console/` | The `brika` CLI + Brix TUI |
| `apps/build/` | Binary build orchestration |
| `apps/signaling/` | Cloudflare Worker for remote-access coordinator |
| `packages/sdk/` | `@brika/sdk` — the plugin API |
| `packages/flow/` | `@brika/flow` — reactive streams |
| `packages/compiler/` | Build-time transforms (externals, action IDs, Tailwind) |
| `packages/ipc/` | Binary IPC protocol |
| `packages/schema/` | Plugin manifest Zod schemas + JSON Schema generation |
| `packages/router/` | Hono-based HTTP routing primitives |
| `packages/di/` | tsyringe-based DI container |
| `packages/type-system/` | TypeDescriptor (Zod → JSON for port compatibility) |
| `packages/errors/` | Typed error model + RFC 9457 envelope |
| `packages/db/` | Drizzle ORM + Bun SQLite wrapper |
| `packages/i18n/` + `i18n-dev/` | Runtime + build-time i18n |
| `packages/auth/` | Auth services |
| `packages/permissions/` + `grants/` | Permission model + grant dispatch |
| `packages/serializable/` | Custom (de)serialiser with Blob/Date/Uint8Array support |
| `packages/events/` | Event bus with glob subscriptions |
| `packages/cli/`, `tui/`, `brix/` | CLI framework, TUI primitives, Brix animations |

## See also

* **[Repository Structure](../contributing/repo-structure.md)** — what every package and app actually does.
* **[Plugin Supervisor](plugin-supervisor.md)** — the next layer down.
