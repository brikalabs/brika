# REST Reference

Every REST endpoint the hub exposes, grouped by resource. Path parameters are written `:name`. All endpoints under `/api/` require authentication unless noted otherwise — see [Authentication](authentication.md).

## Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | none | Liveness probe — `{ ok: true }` |

## System

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/system` | user | Hub identity, version, build info |
| `GET` | `/api/system/migrations` | user | Pending state migrations |
| `GET` | `/api/system/update` | user | Update availability info |
| `GET` | `/api/system/update/compat` | admin | Compatibility report for every installed plugin |
| `POST` | `/api/system/update/apply` | admin | Apply the available update (in-place binary swap + restart) |
| `POST` | `/api/system/restart` | admin | Restart the hub (uses exit-code-42 supervisor) |
| `POST` | `/api/system/stop` | admin | Shut down the hub |

## Setup

The first-run flow. `POST /api/setup/complete` is callable without auth only when the hub has no admin user yet.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/setup/status` | none | Is setup complete? |
| `POST` | `/api/setup/complete` | conditional | Create admin user + finalise setup |

## Plugins

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/plugins/` | List installed plugins (with declared bricks, blocks, pages, sparks) |
| `POST` | `/api/plugins/load` | Load a plugin by ref (`{ ref: 'workspace:./path' }`) |
| `GET` | `/api/plugins/:uid` | Plugin detail |
| `DELETE` | `/api/plugins/:uid` | Uninstall plugin (disable, unload, remove npm package, wipe secrets, remove state) |
| `GET` | `/api/plugins/:uid/icon` | Plugin icon (SVG/PNG, cached 24 h) |
| `GET` | `/api/plugins/:uid/assets/*` | Files from the plugin's `assets/` directory |
| `GET` | `/api/plugins/:uid/readme` | README markdown (and filename) |
| `GET` | `/api/plugins/:uid/config` | Config schema + current values (dynamic-dropdowns resolved) |
| `PUT` | `/api/plugins/:uid/config` | Update plugin config (hot-reloaded to running process) |
| `GET` | `/api/plugins/:uid/preferences/:name/options` | Dynamic-dropdown options for one preference |
| `PUT` | `/api/plugins/:uid/permissions` | Toggle a permission (`{ permission, granted }`) — vector invalidated immediately |
| `GET` | `/api/plugins/:uid/metrics` | Process metrics (CPU, memory) + history |
| `POST` | `/api/plugins/:uid/enable` | Enable the plugin |
| `POST` | `/api/plugins/:uid/disable` | Disable the plugin |
| `POST` | `/api/plugins/:uid/reload` | Reload (stop + start) |
| `POST` | `/api/plugins/:uid/kill` | Force-kill the process |

## Actions

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/plugins/:uid/actions/:actionId` | Invoke a typed action — body becomes the action input; response is JSON or binary (`Content-Type` reflects the action return type) |

## Plugin routes

A plugin's `defineRoute(method, path, handler)` is reachable here:

| Method | Path | Description |
|---|---|---|
| any | `/api/plugins/:uid/routes/*` | Forwarded to the plugin's route handler via IPC |

## Pages

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/pages/:file` | Plugin page bundle (compiled JS, immutable) |
| `GET` | `/api/plugins/:uid/pages/:file` | Same, scoped per plugin |

## Blocks

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/blocks/` | Every registered block type across plugins |
| `GET` | `/api/blocks/categories` | Block categories (trigger, action, flow, transform) |

## Workflows

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/workflows/` | List workflows |
| `POST` | `/api/workflows/` | Create or update a workflow |
| `GET` | `/api/workflows/:id` | Workflow detail |
| `DELETE` | `/api/workflows/:id` | Delete workflow |
| `POST` | `/api/workflows/enable` | Enable workflows (body: `{ ids }`) |
| `POST` | `/api/workflows/disable` | Disable workflows |
| `GET` | `/api/workflows/blocks` | Workflow-scoped block view |

SSE: `GET /api/workflows/:id/events` and `GET /api/workflows/debug` — see [SSE Streams](sse-streams.md).

## Boards

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/boards/` | List boards |
| `POST` | `/api/boards/` | Create a board |
| `PUT` | `/api/boards/order` | Reorder boards |
| `GET` | `/api/boards/:id` | Board detail (incl. bricks) |
| `PUT` | `/api/boards/:id` | Update board metadata |
| `DELETE` | `/api/boards/:id` | Delete board |
| `POST` | `/api/boards/:id/bricks` | Add a brick to the board |
| `PUT` | `/api/boards/:id/bricks/:instanceId` | Update a brick instance (config, size, position) |
| `DELETE` | `/api/boards/:id/bricks/:instanceId` | Remove a brick instance |
| `PUT` | `/api/boards/:id/layout` | Update the grid layout |

SSE: `GET /api/boards/:id/sse` — board-scoped brick data.

## Bricks

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/bricks/types` | All registered brick types |
| `GET` | `/api/bricks/types/:id` | One brick type with its config schema |
| `GET` | `/api/bricks/types/:typeId/config/:name/options` | Dynamic options for a brick config field |
| `GET` | `/api/bricks/modules/:pluginUid/:file` | Compiled brick module (immutable, content-hashed) |
| `POST` | `/api/bricks/instances/:id/action` | Call a brick instance action (`{ actionId, payload }`) |

## Logs

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/logs/` | Query logs with filters (`level`, `source`, `plugin`, `search`, `since`, `until`, `limit`) |
| `GET` | `/api/logs/recent` | Recent logs from the ring buffer |
| `GET` | `/api/logs/plugins` | Per-plugin log counts |
| `GET` | `/api/logs/stats` | Aggregate stats |
| `GET` | `/api/logs/sources` | Available source filters |
| `GET` | `/api/logs/levels` | Available levels |
| `DELETE` | `/api/logs/` | Clear logs |

SSE: `GET /api/stream/logs` — live tail.

## Registry (plugin marketplace)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/registry/install` | Install a plugin from the registry |
| `POST` | `/api/registry/update` | Update an installed plugin |
| `GET` | `/api/registry/updates` | Plugins with available updates |
| `GET` | `/api/registry/packages` | Browse the curated index |
| `GET` | `/api/registry/packages/:name` | One package |
| `GET` | `/api/registry/version` | Registry version info |
| `GET` | `/api/registry/search?q=…` | Search packages |
| `GET` | `/api/registry/verified` | Verified-only set |
| `GET` | `/api/registry/plugins/:name` | Plugin detail |
| `GET` | `/api/registry/plugins/:name/readme` | README |
| `GET` | `/api/registry/plugins/:name/icon` | Icon |
| `DELETE` | `/api/registry/...` | Uninstall (see [Plugins](#plugins) for the canonical path) |

## Remote access

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/remote-access/` | Current claim status + public URL |
| `PATCH` | `/api/remote-access/claim` | Claim a name on the coordinator |
| `POST` | `/api/remote-access/test-coordinator` | Probe the coordinator |
| `DELETE` | `/api/remote-access/forget` | Drop the current claim |

## Settings

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/settings/...` | Read settings (themes, location, timezone, update-channel) |
| `PUT` | `/api/settings/update-channel` | Switch stable/canary |
| `PUT` | `/api/settings/location` | Update lat/long + address |
| `PUT` | `/api/settings/timezone` | Set the hub timezone |
| `PUT` | `/api/settings/custom-themes` | Manage custom themes |
| `PUT` | `/api/settings/theme` | Set the active theme |
| `DELETE` | `/api/settings/:id` | Remove a setting |

## Users

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/users/` | List users (admin) |
| `POST` | `/api/users/` | Create user (admin) |

## i18n

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/i18n/locales` | none | Available locales |
| `GET` | `/api/i18n/namespaces` | none | Translation namespaces |
| `GET` | `/api/i18n/bundle/:locale` | none | Combined bundle for one locale |
| `GET` | `/api/i18n/events` | none | SSE — translation changes |
| `GET` | `/api/i18n/sources` | admin | Source files for the dev editor |
| `POST` | `/api/i18n/sources/:namespace/:locale` | admin | Update source file (dev only) |

## Sparks

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sparks/` | Registered spark types |
| `GET` | `/api/sparks/history` | Recent emissions |
| `GET` | `/api/sparks/:type` | Schema + recent emissions for one type |
| `POST` | `/api/sparks/emit` | Emit a spark manually (testing) |

## OAuth

| Method | Path | Description |
|---|---|---|
| any | `/api/oauth/:providerId/*` | Pass-through to the plugin's OAuth flows (registered via `defineOAuth`) |

## Streams (SSE)

See [SSE Streams](sse-streams.md) for the full reference.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/stream/logs` | Live log tail |
| `GET` | `/api/stream/events` | System-wide events |
| `GET` | `/api/workflows/:id/events` | Per-workflow block events |
| `GET` | `/api/workflows/debug` | Every workflow's events |
| `GET` | `/api/boards/:id/sse` | Brick data updates for the board |

## Note on shape

This page is a map, not a contract — the request/response shapes evolve. Use it to find the endpoint; verify the exact shape from the source (`apps/hub/src/runtime/http/routes/*.ts`) when the contract matters.

## See also

* **[SSE Streams](sse-streams.md)** — live stream details.
* **[Errors](errors.md)** — the error envelope.
* **[Authentication](authentication.md)** — scopes per endpoint.
