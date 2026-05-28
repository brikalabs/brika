# Authentication

Every endpoint under `/api/` except `/api/health`, `/api/i18n/*` read endpoints, and the public setup endpoints requires authentication. The hub accepts two credential types: the CLI bearer token (per user, hub-issued) and a user session cookie (per logged-in user).

## CLI bearer token

The hub writes a 32-byte random token to `~/.brika/cli-token` on startup. File permissions: `0600`. Pass it in the `Authorization` header:

```http
GET /api/health HTTP/1.1
Host: 127.0.0.1:3001
Authorization: Bearer <contents-of-~/.brika/cli-token>
```

The token carries `ADMIN_ALL` scope — every endpoint is reachable.

### From a shell

```sh
TOKEN=$(cat ~/.brika/cli-token)
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3001/api/plugins/
```

### Rotation

Delete the file and restart the hub. The next start writes a fresh token.

## User session

The web UI uses session cookies. Flow:

```
POST /api/auth/login
Content-Type: application/json

{ "username": "alice", "password": "…" }
```

Response sets a cookie:

```
Set-Cookie: brika.session=<jwt>; HttpOnly; SameSite=Lax; Secure; Path=/
```

Subsequent requests include the cookie automatically (same-origin). Server-side, the JWT is verified against the per-install signing key; the user's scopes are loaded from the auth store.

### Logout

```
POST /api/auth/logout
```

Clears the cookie. The JWT itself isn't revoked server-side (stateless).

## Scopes

| Scope | Allows |
|---|---|
| `ADMIN_ALL` | Every endpoint, including user CRUD and hub system mutations |
| `read` | Read-only access to most resources |
| `write` | Modify boards, workflows, plugin configs |
| `actions` | Invoke plugin actions |

Missing scope → **403** with `{ code: 'PERMISSION_DENIED', error: 'Missing scope <name>' }`.

Specific endpoints requiring `ADMIN_ALL`:

* `POST /api/system/update/apply`
* `POST /api/system/restart`
* `POST /api/system/stop`
* `GET /api/system/update/compat` (lists installed plugin names — low-grade info disclosure)
* The i18n write surface
* Users CRUD

Other authenticated endpoints accept any valid user.

## Public endpoints

These do not require authentication:

* `GET /api/health` — liveness probe.
* `GET /api/i18n/locales`, `GET /api/i18n/namespaces`, `GET /api/i18n/bundle/:locale`, `GET /api/i18n/events` — UI localisation bootstrapping.
* `GET /api/setup/status`, `POST /api/setup/complete` — first-run bootstrap (when the hub has no admin yet).

`GET /api/health` returns a tiny `{ ok: true }` and is what `brika status` health-probes.

## Host allowlist

Before the auth middleware, the host allowlist rejects requests whose `Host` header doesn't match the configured bind address. **421 Misdirected Request** is returned. This defends against DNS rebinding — see [Architecture — Authentication](../architecture/auth.md).

## Remote access (WebRTC)

When the hub is reached over the WebRTC tunnel, the transport is a data channel. The auth model is identical — the SPA logs in (cookie set), subsequent requests carry the cookie. The CLI token is local-only and not exposed to remote peers.

## Error responses

* **401 Unauthorized** — no credentials.
* **403 Forbidden** — credentials present but scope insufficient.
* **421 Misdirected Request** — host header mismatch.
* **429 Too Many Requests** — rate limited; check `Retry-After`.

All errors use the standard envelope — see [Errors](errors.md).

## See also

* **[REST Reference](rest-reference.md)** — every endpoint and the scopes it needs.
* **[Architecture — Authentication](../architecture/auth.md)** — the security model.
