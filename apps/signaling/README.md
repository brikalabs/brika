# @brika/signaling

Brika's remote-access front door. One Cloudflare Worker deployed at `hub.brika.dev` that:

- Owns the **`/v1/*` coordinator API** — claims, tickets, WebSocket signaling — backed by D1 (claims) and a `HubSession` Durable Object per hub (live socket + per-session client sockets).
- Serves the **bootstrap SPA** at every other path — a ~15 KB shell that opens a WebRTC bridge to the hub, RPC-fetches the hub's `/index.html` + `/assets/*` chunks through the data channel, then hands the page over to the hub's UI.

Both halves live in this single package and ship as one Worker (the SPA is attached via the static asset binding). The hub name lives in `localStorage` after the bootstrap reads it; the URL no longer carries it.

## Layout

```
apps/signaling/
  server/              Cloudflare Worker
    worker.ts          HTTP router + WebSocket dispatch into the right DO
    hub-session.ts     Durable Object — owns the hub WS + per-session client sockets
    hub-resolution.ts  extracts the hub name from a request URL; stamps <meta> into the shell
    claims-d1.ts       D1-backed ClaimStore
    tickets.ts         re-exports mint/verify from @brika/remote-access-protocol
  src/                 React SPA (bootstrap shell)
    hooks/, lib/, components/, screens/
  public/sw.js         service worker that proxies /api/* requests over the data channel
  index.html
  migrations/          D1 SQL migrations
  vite.config.ts       @cloudflare/vite-plugin — one dev server for SPA + worker
  wrangler.toml        custom domain hub.brika.dev; assets dir = ./dist/client
```

## Routes

| Method   | Path                          | Auth                | What                                                |
| -------- | ----------------------------- | ------------------- | --------------------------------------------------- |
| `GET`    | `/v1/health`                  | —                   | Liveness probe                                      |
| `GET`    | `/v1/hubs/:name/status`       | —                   | Whether a name is claimed (no token / session info) |
| `POST`   | `/v1/hubs/claim`              | —                   | Claim a name; receive a bearer token                |
| `POST`   | `/v1/hubs/:name/rotate`       | `Bearer <token>`    | Rotate the bearer                                   |
| `DELETE` | `/v1/hubs/:name`              | `Bearer <token>`    | Release the claim                                   |
| `POST`   | `/v1/tickets`                 | —                   | Mint a 60-second signed ticket for a hub name       |
| `WS`     | `/v1/hub`                     | `bearer.<token>`    | Long-lived hub signaling channel                    |
| `WS`     | `/v1/client?hub=&ticket=`     | `ticket.<token>`    | Per-session browser signaling channel               |

Auth tokens are carried in the `Sec-WebSocket-Protocol` header (browsers strip everything else on upgrade).

## Local dev

```bash
bun --filter @brika/signaling dev        # vite + miniflare, one process, HMR on the SPA
bun --filter @brika/signaling d1:migrate:local
```

Vite serves the SPA on `http://localhost:5174` with HMR; `@cloudflare/vite-plugin` runs `server/worker.ts` inside miniflare on the same origin, so `/v1/*` and WebSocket upgrades hit the real Worker code with real DO + D1 bindings.

`?debug=1` (or `localStorage.setItem('brikaBootstrapDebug', '1')`) prints every bootstrap step. `?coordinator=<origin>` overrides the coordinator origin without touching the page URL.

## Deploy

```bash
wrangler secret put TICKET_SECRET                  # one-time
bun --filter @brika/signaling d1:migrate:prod
bun --filter @brika/signaling deploy               # vite build + wrangler deploy
```

`wrangler.toml` pins the route to `hub.brika.dev` and binds the D1 database + `HUB_SESSION` Durable Object namespace.

## Design

- Stateless ticket mint/verify keeps the request hot path off D1 — only bearer auth on `/rotate` and `/release` touches the database.
- The DO owns the hub's WebSocket, so a hub reconnect cleanly replaces the previous socket without races.
- All wire-format types + crypto helpers come from [`@brika/remote-access-protocol`](../../packages/remote-access-protocol/).
- The bootstrap is tiny on purpose — every byte loads BEFORE the WebRTC handshake.
