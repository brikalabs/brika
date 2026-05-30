# @brika/signaling

Brika's remote-access front door. A coordinator that:

- Owns the **`/v1/*` coordinator API** — claims, tickets, WebSocket signaling — backed by a `ClaimStore` (claims) and a per-hub session that owns the live hub socket + per-session client sockets.
- Serves the **bootstrap SPA** at every other path — a ~15 KB shell that opens a WebRTC bridge to the hub, RPC-fetches the hub's `/index.html` + `/assets/*` chunks through the data channel, then hands the page over to the hub's UI.

Both halves live in this single package. The hub name lives in `localStorage` after the bootstrap reads it; the URL no longer carries it.

**Runtime-agnostic.** The same router ([`server/app.ts`](server/app.ts)) runs on two transports:

- **Cloudflare Workers** (`hub.brika.dev`) — D1 for claims, a `HubSession` Durable Object per hub (WebSocket Hibernation keeps idle cost near zero). Entry: [`server/worker.ts`](server/worker.ts).
- **Bun standalone** (self-host on a VPS / Docker) — SQLite for claims, an in-process `Map<hubName, HubSessionState>`. Entry: [`server/standalone.ts`](server/standalone.ts).

The shared state machine ([`HubSessionState`](../../packages/remote-access-protocol/src/session-state.ts)) and `ClaimStore` seam live in `@brika/remote-access-protocol`, so both transports run identical routing, eviction, and teardown logic.

## Layout

```
apps/signaling/
  server/
    app.ts             shared Hono router — every HTTP + WS route, runtime-agnostic (deps injected)
    app-middleware.ts  origin guard, rate-limit gate, bearer-owner auth
    worker.ts          Cloudflare entry — wires D1 + DO + ASSETS into buildApp
    standalone.ts      Bun entry — wires SQLite + in-process sessions + filesystem assets
    hub-session.ts     Durable Object — CF transport for HubSessionState (survives hibernation)
    hub-resolution.ts  extracts the hub name from a request URL; stamps <meta> into the shell
    claims-d1.ts       D1 ClaimsExecutor
    claims-sqlite.ts   SQLite ClaimsExecutor (bun:sqlite / node:sqlite / better-sqlite3)
    rate-limit.ts      in-memory per-IP token bucket
    migrations.ts      SQLite migration runner (boot + CLI)
    standalone-assets.ts  filesystem asset Fetcher with SPA fallback
    env.ts             zod-validated env for both the Worker and the standalone server
    tickets.ts         re-exports mint/verify from @brika/remote-access-protocol
  src/                 React SPA (bootstrap shell)
    hooks/, lib/, components/, screens/
  public/sw.js         service worker that proxies /api/* requests over the data channel
  index.html
  migrations/sqlite/   SQL migrations — shared by D1 (wrangler) and the standalone runner
  Dockerfile           multi-stage Bun image for the standalone server
  docker-compose.yml   single-service SQLite stack
  vite.config.ts       @cloudflare/vite-plugin — one dev server for SPA + worker
  wrangler.toml        custom domain hub.brika.dev; assets dir = ./dist/client
```

## Routes

| Method   | Path                          | Auth                | What                                                |
| -------- | ----------------------------- | ------------------- | --------------------------------------------------- |
| `GET`    | `/v1/health`                  | —                   | Liveness probe                                      |
| `GET`    | `/v1/hubs/:name/status`       | —                   | Whether a name is claimed (no token / session info) |
| `POST`   | `/v1/hubs/claim`              | —                   | Claim a name; receive a bearer token + recovery code |
| `POST`   | `/v1/hubs/:name/rotate`       | `Bearer <token>`    | Rotate the bearer                                   |
| `POST`   | `/v1/hubs/:name/recover`      | recovery code       | Mint a fresh bearer using the recovery code (the code is single-use) |
| `POST`   | `/v1/hubs/:name/recovery`     | `Bearer <token>`    | Mint a fresh recovery code (owner-authenticated)    |
| `DELETE` | `/v1/hubs/:name`              | `Bearer <token>`    | Release the claim                                   |
| `POST`   | `/v1/tickets`                 | —                   | Mint a 60-second signed ticket for a hub name       |
| `WS`     | `/v1/hub`                     | `bearer.<token>`    | Long-lived hub signaling channel                    |
| `WS`     | `/v1/client?hub=&ticket=`     | `ticket.<token>`    | Per-session browser signaling channel               |

Auth tokens are carried in the `Sec-WebSocket-Protocol` header (browsers strip everything else on upgrade). Bearer tokens and recovery codes are stored **SHA-256-hashed at rest** — a claim-store dump leaks no live credential. `claim`/`rotate`/`recover` return the plaintext exactly once. Mutating + recovery routes are per-IP rate-limited.

## Local dev

```bash
bun --filter @brika/signaling dev        # vite + miniflare, one process, HMR on the SPA
bun --filter @brika/signaling d1:migrate:local
```

Vite serves the SPA on `http://localhost:5174` with HMR; `@cloudflare/vite-plugin` runs `server/worker.ts` inside miniflare on the same origin, so `/v1/*` and WebSocket upgrades hit the real Worker code with real DO + D1 bindings.

`?debug=1` (or `localStorage.setItem('brikaBootstrapDebug', '1')`) prints every bootstrap step. `?coordinator=<origin>` overrides the coordinator origin without touching the page URL.

## Deploy

### Cloudflare Workers (`hub.brika.dev`)

```bash
wrangler secret put TICKET_SECRET                  # one-time
bun --filter @brika/signaling d1:migrate:prod
bun --filter @brika/signaling deploy               # vite build + wrangler deploy
```

`wrangler.toml` pins the route to `hub.brika.dev` and binds the D1 database + `HUB_SESSION` Durable Object namespace. The D1 migrations live in `migrations/sqlite/`; `0002_hashed_tokens.sql` recreates the claims table with the hashed-token schema (it **drops existing claims** — hubs re-claim their name).

### Bun standalone (VPS / bare metal)

```bash
TICKET_SECRET=$(openssl rand -hex 32) \
  bun --filter @brika/signaling start:standalone     # vite build + bun server/standalone.ts
```

Migrations run automatically on boot; claims persist in SQLite (`BRIKA_SIGNALING_SQLITE_PATH`, default `./brika-signaling.db`). In dev, a `TICKET_SECRET` is auto-generated and stashed next to the DB; in production (`NODE_ENV=production`) it is required and the process exits if unset.

Key env vars: `BRIKA_SIGNALING_PORT` (8787), `BRIKA_SIGNALING_HOST` (0.0.0.0), `BRIKA_SIGNALING_ASSETS_DIR` (`./dist/client`), `BRIKA_SIGNALING_TURN` (`static`\|`cloudflare`\|`none`), `ALLOWED_ORIGINS` (CSV; localhost always allowed).

### Docker

```bash
TICKET_SECRET=$(openssl rand -hex 32) \
  docker compose -f apps/signaling/docker-compose.yml up --build
```

Multi-stage Bun image, runs as a non-root user, SQLite persisted in the `signaling-data` volume, `/v1/health` healthcheck.

## Design

- Stateless ticket mint/verify keeps the request hot path off the claim store — only bearer auth on `/rotate`, `/recover`, and `/release` touches it.
- One `HubSessionState` per hub owns the hub's WebSocket, so a reconnect cleanly replaces the previous socket without races. On Cloudflare the DO persists per-socket attachments via `serializeAttachment` and rehydrates the state after hibernation; on Bun the same state lives in a process-local `Map`.
- Bearer tokens + recovery codes are SHA-256-hashed at rest; lookups hash the presented value and compare in constant time.
- All wire-format types, the `ClaimStore`/`HubSessionState` seams, and crypto helpers come from [`@brika/remote-access-protocol`](../../packages/remote-access-protocol/).
- The bootstrap is tiny on purpose — every byte loads BEFORE the WebRTC handshake.
