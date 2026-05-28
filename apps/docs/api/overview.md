# API Overview

The hub exposes a REST + SSE API rooted at `/api/`. Same base URL whether you reach it over LAN (`http://127.0.0.1:3001`), over a custom binding, or over the WebRTC tunnel.

This chapter is the reference. For the conceptual model — what's a board, what's a brick — see [Core Concepts](../basics/concepts.md). For the underlying machinery, see [Hub Server](../architecture/hub.md).

## Base URL

* **Local default** — `http://127.0.0.1:3001`
* **LAN** — whatever you bound the hub to (`--host 0.0.0.0 -p 8080` → `http://<lan-ip>:8080`)
* **Remote** — `https://hub.brika.dev/<your-name>` (via the [WebRTC tunnel](../architecture/remote-access.md))

## Endpoints at a glance

| Group | Path prefix | Highlights |
|---|---|---|
| Health | `/api/health` | Liveness probe |
| System | `/api/system`, `/api/system/update`, `/api/system/migrations` | Version, update info, restart, stop |
| Setup | `/api/setup/status`, `/api/setup/complete` | First-run flow |
| Plugins | `/api/plugins` | List, install, configure, enable, disable, reload, kill, uninstall, metrics, permissions, readme, icon, assets |
| Workflows | `/api/workflows` | CRUD + enable/disable + per-workflow event SSE + debug SSE |
| Boards | `/api/boards` | CRUD + brick layout + per-board SSE |
| Bricks | `/api/bricks/types`, `/api/bricks/modules`, `/api/bricks/instances` | Type registry, compiled modules, instance actions |
| Blocks | `/api/blocks`, `/api/blocks/categories` | Registry |
| Actions | `/api/plugins/:uid/actions/:actionId` | Invoke a plugin action |
| Logs | `/api/logs` + `/api/stream/logs` | Query, recent, stats, sources, levels, delete; live tail |
| Registry | `/api/registry` | Install, search, list, version, get plugin readme/icon |
| Remote access | `/api/remote-access` | Claim, test-coordinator, forget |
| Settings | `/api/settings` | Themes, location, timezone, update channel, custom themes |
| Users | `/api/users` | Auth users CRUD |
| i18n | `/api/i18n` | Locales, namespaces, bundle, sources |
| Sparks | `/api/sparks` | History, emit, get |
| OAuth | `/api/oauth/:providerId/*` | Pass-through to plugin OAuth flows |
| Pages | `/api/pages/:file` | Plugin page bundle serving |
| SSE | `/api/stream/{logs,events}`, `/api/workflows/:id/events`, `/api/workflows/debug`, `/api/boards/:id/sse` | Live streams |

See [REST Reference](rest-reference.md) for every endpoint with its method, params, and response shape.

## Auth

Two authentication methods, both bearer-style.

### CLI token

```http
Authorization: Bearer <token-from-~/.brika/cli-token>
```

Per-user, written by the hub at startup. Carries `ADMIN_ALL` scope.

### User session

The web UI logs in via `POST /api/auth/login` and receives a session cookie (`HttpOnly`, `SameSite=Lax`). The cookie travels automatically on subsequent same-origin requests. Scopes come from the user record.

External HTTP clients can use either — point your tool at the CLI token for full access, or use a user JWT for scope-restricted access.

See [Authentication](authentication.md) for the full details and [Architecture — Authentication](../architecture/auth.md) for the security model.

## Content type

* **Requests** — `application/json` for JSON bodies, `application/octet-stream` for binary, `multipart/form-data` for file uploads.
* **Responses** — `application/json`, `text/event-stream` for SSE, `application/javascript` for compiled brick modules (immutable), `image/*` for plugin icons.

JSON request bodies are validated with Zod on every endpoint. Validation failures return **400** with a `BrikaError` envelope (`{ error, code, data }`) — see [Errors](errors.md).

## Rate limiting

The router applies modest per-endpoint rate limits to prevent runaway plugin routes or auth-brute-force. Limits are generous — interactive use should never hit them. Excessive requests return **429** with a `Retry-After` header.

## Request body cap

Default: **1 GiB**. Override with `BRIKA_MAX_REQUEST_BODY_BYTES` (or set to `0` to disable). Larger bodies return **413**.

## Versioning

The API is at v0. There is no `/v1/` prefix today. We aim for backwards compatibility but reserve the right to evolve until v1. Breaking changes are called out in release notes.

The Cloudflare coordinator (`hub.brika.dev`) does use a versioned `/v1/` namespace — that's a separate service for remote-access signaling, not the per-hub API.

## What's *not* an API endpoint

* The dashboard, workflows editor, settings page — those are the React UI served from `/`, not API calls. They make API calls.
* The `/_dev/*` routes — present in dev mode only (e.g., the i18n overlay's open-in-editor endpoint).

## See also

* **[Authentication](authentication.md)** — auth in detail.
* **[REST Reference](rest-reference.md)** — every endpoint.
* **[SSE Streams](sse-streams.md)** — live data.
* **[Errors](errors.md)** — error envelope and codes.
