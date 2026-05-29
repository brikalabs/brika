# Hub Server

The hub is a single Bun process that runs the HTTP/SSE API, supervises plugins, persists state, and serves the bundled UI. This page covers the server's structure and how to find your way around the code.

Entry: `apps/hub/src/main.ts` → `apps/hub/src/hub.ts`. Run with `brika hub` (or `brika start --attach`).

## HTTP routing

The router is built on top of `@brika/router` (which itself wraps [Hono](https://hono.dev/)). Routes are composed in `apps/hub/src/runtime/http/routes/index.ts` from per-resource files:

| File | Routes |
|---|---|
| `health.ts` | `GET /api/health` |
| `system.ts` | `GET /api/system`, system update endpoints, restart/stop |
| `setup.ts` | First-run setup flow |
| `plugins.ts` | Plugin install/list/config/permissions/metrics/enable/disable/reload/kill |
| `workflows.ts` | Workflow CRUD + enable/disable + event streams |
| `boards.ts` | Board CRUD + brick layout + SSE |
| `bricks.ts` | Brick type registry, compiled module serving, instance actions |
| `blocks.ts` | Block registry, categories |
| `actions.ts` | Per-plugin action invocation |
| `logs.ts` | Recent logs, filters, deletion, SSE tail |
| `registry.ts` | Plugin registry proxy (install, search, update) |
| `remote-access.ts` | Coordinator claim flow |
| `settings.ts` | Location, timezone, themes |
| `users.ts` | User management |
| `i18n.ts` | Translation source + bundle endpoints |
| `sparks.ts` | Spark registry + history + emission |
| `oauth.ts` | OAuth pass-through for plugins |
| `pages.ts` | Plugin page rendering |

Every route resolves a service from the `@brika/di` container. Services are singletons — one `BoardService`, one `WorkflowService`, etc.

## Services

Services are the hub's business-logic layer. They sit between HTTP routes and the lower-level stores. Notable ones:

| Service | Owns |
|---|---|
| `PluginLifecycle` | Spawning, supervising, restarting plugin processes |
| `WorkflowService` | Storing workflow definitions, instantiating blocks, routing IPC events |
| `BoardService` | Board CRUD + brick instance configs + layout persistence |
| `BrickTypeRegistry` | The set of declared brick types, derived from plugin manifests |
| `BrickDataStore` | Latest `setBrickData` payloads, fanned out via SSE |
| `EventBus` | Cross-cutting event dispatch (sparks, system events) |
| `LogRouter` | Ring buffer + SSE fanout + retention sweep |
| `SecretStore` | Keychain / encrypted-file abstraction |
| `StateStore` | Drizzle/SQLite + JSON files |
| `ConfigLoader` | Reads `brika.yml`, hot path |
| `AuthService` | User CRUD, scope checks |
| `RemoteAccessService` | Coordinator claim, signaling, peer session orchestration |

All injected via tsyringe. The DI container survives module reloads (it's pinned on `globalThis` via a Symbol) so hot-reload in dev doesn't lose singleton state.

## Server-Sent Events

Five SSE endpoints today:

| Endpoint | What it streams |
|---|---|
| `GET /api/stream/logs` | Live log lines as they arrive |
| `GET /api/stream/events` | System-wide events (action dispatches, status changes) |
| `GET /api/workflows/:id/events` | Per-workflow block events (input, output, errors) |
| `GET /api/workflows/debug` | Every running workflow's events (global debug stream) |
| `GET /api/boards/:id/sse` | Brick data updates for the board |

Each stream is a generator of `event: <type>\ndata: <json>\n\n` frames over a kept-open HTTP response. The browser-side [shared event source](sse-pool.md) coalesces multiple subscribers per URL into a single connection.

## Plugin route serving

A plugin's `defineRoute('GET', '/status', …)` ends up reachable at `/api/plugins/<plugin-uid>/routes/status`. The hub:

1. Receives the HTTP request.
2. Looks up the target plugin by UID.
3. Sends a `routeRequest` IPC RPC with the method, path, query, headers, and body.
4. The plugin's SDK handler matches the route, calls the user handler, returns a `RouteResponse`.
5. The hub serialises the response back into HTTP.

Binary bodies (Uint8Array) traverse the IPC channel directly — no base64 — thanks to Bun's `serialization: 'advanced'`.

## Static UI serving

In production the hub serves the bundled UI from `BRIKA_STATIC_DIR`. In dev mode, set `BRIKA_DEV_UI_PROXY=http://localhost:5173` and the hub forwards every non-`/api/*` request to the Vite dev server. Vite serves the live UI; you keep the hub.

## Host allowlist

A middleware in `apps/hub/src/runtime/http/middleware/host-allowlist.ts` checks every incoming request's `Host` header against the configured bind address. Requests with mismatched hosts are rejected with 421. This is the primary defence against DNS rebinding attacks.

Allowed without configuration: `127.0.0.1`, `localhost`, `::1`. To accept other hosts (LAN access, remote-access tunnels), the hub must be started with the matching `--host` value or `BRIKA_HOST` env var.

## Request body limits

The hub caps request bodies at 1 GiB by default (`BRIKA_MAX_REQUEST_BODY_BYTES`). Set to `0` to disable the cap — not recommended on multi-tenant or LAN-exposed hubs.

## Configuration

`HubConfig` is a singleton built once at startup from `brika.yml` + env vars. Env vars always win. See [Configuration File](../cli/configuration.md) and [Environment Variables](../cli/environment.md).

## Restart on update

When the user applies an update, the hub does an in-place binary swap, then exits with code 42. The wrapper supervisor (`brika start`'s `__supervisor` child) restarts the process. The whole flow is transparent — clients see a brief connection drop and reconnect via SSE.

## See also

* **[Plugin Supervisor](plugin-supervisor.md)** — how the hub manages plugin processes.
* **[IPC Protocol](ipc-protocol.md)** — the wire format.
* **[Authentication](auth.md)** — how requests are authenticated.
* **[State Store](state-store.md)** — persistence layer.
* **[Logs](logs.md)** — the log subsystem.
