# Authentication

The hub authenticates three kinds of clients: the local CLI (via a per-user bearer token), the web UI (via a session cookie / JWT after the user signs in), and external HTTP clients (via either of the above). Plus it has a host-allowlist middleware that defends against DNS rebinding before any of that runs.

## CLI token

When the hub starts it writes a 32-byte random bearer token to `~/.brika/cli-token` with `0600` permissions. The `brika` CLI reads this file and includes the token as a header:

```
Authorization: Bearer <token>
```

The hub accepts the token and treats the caller as a system-level client with implicit `ADMIN_ALL` scope. This is why `brika status` and `brika update` Just Work without prompting for credentials.

The token is **per user, per hub install** — not per workspace. A second hub running in another directory shares the token. If you want isolation between hubs, set `BRIKA_HOME` per workspace to a separate directory; the token still lives in `~/.brika/cli-token` so they share auth.

Rotation: delete `~/.brika/cli-token`, restart the hub. The CLI will fail on the next call until a new token is written.

## User sessions

For the web UI, the hub uses a JWT session cookie. The flow:

1. User logs in via `/api/auth/login` with `{ username, password }`.
2. The hub looks the user up in the auth store, verifies the password (Argon2id).
3. On success, the hub mints a JWT with the user's ID and scopes, signs it with a per-install key.
4. The JWT lands in an HTTP-only, SameSite=Lax cookie.

Subsequent requests carry the cookie. The auth middleware verifies the signature, expiry, and revocation status.

Logout `/api/auth/logout` clears the cookie. The JWT itself is stateless, so logout is just cookie clearing — no server-side revocation list. (Forced revocation for compromised tokens is a manual operation: bump the JWT key.)

## Scopes

A user has a set of **scopes**. Each scope is a coarse permission:

| Scope | Allows |
|---|---|
| `ADMIN_ALL` | Every API endpoint, including user CRUD and hub-system operations |
| `read` | Read-only access to all resources |
| `write` | Modify boards, workflows, plugin configs |
| `actions` | Invoke plugin actions |

The exact scope list and their mappings live in `packages/auth/`. The `ADMIN_ALL` scope is the only one that can manage users.

Per-route scope requirements are declared with a middleware. A missing scope returns 403 with a `BrikaError` envelope.

## Host allowlist

Before any auth check, the request goes through the host allowlist middleware (`apps/hub/src/runtime/http/middleware/host-allowlist.ts`). It checks the request's `Host` header against the configured bind address. Mismatches are rejected with **421 Misdirected Request**.

This is the primary defence against DNS rebinding — an attacker's website can lure the browser into making a same-origin request to `http://attacker.example` which their DNS resolves to `127.0.0.1`. The browser sees them as same-origin and sends the user's CLI token cookie. The host allowlist refuses requests whose `Host` doesn't match the bind address, so the attacker's host is rejected before it ever sees the auth layer.

Allowed without configuration:

* `127.0.0.1` (any port)
* `localhost`
* `::1`
* The configured LAN bind address if not loopback

The remote-access tunnel adds its own allowlist entry for the coordinator-resolved hostname.

## Remote access

When the hub is reached over the WebRTC tunnel (see [Remote Access](remote-access.md)), the transport is a data channel rather than HTTP/1.1. Auth still happens — the tunnel terminates at the hub, requests carry the user's JWT cookie just like local requests. The host allowlist treats the coordinator URL as legitimate.

## Plugin actions

Actions called from a brick/page are auth-checked at the hub. The user's session JWT travels with the request; the hub verifies, then forwards `callAction { actionId, input }` to the plugin via IPC. The plugin runs the handler with no awareness of the user (no per-user context is delivered today — actions are plugin-wide).

## Rate limiting

`@brika/router` includes rate-limiting middleware. The hub applies modest limits per endpoint to prevent runaway plugin routes or auth-brute-force. The limits are intentionally generous for normal use; if you hit them in normal interactive use, that's a bug worth reporting.

## See also

* **[Hub Server](hub.md)** — the routes that auth gates.
* **[CLI Overview](../cli/overview.md)** — how the CLI uses the bearer token.
* **[Remote Access](remote-access.md)** — auth over the WebRTC tunnel.
