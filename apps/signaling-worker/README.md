# @brika/signaling-worker

Production signaling coordinator for Brika remote access, running on Cloudflare Workers with Durable Objects (per-hub session state) and D1 (claim persistence). Deployed to `signaling.brika.dev` and serving `*.hubs.brika.dev` from the same Worker (the browser-facing static UI shell is embedded for cold-path friendliness).

> Need to run a coordinator without Cloudflare? See [`@brika/signaling`](../signaling/) — same protocol, Bun + JSON file, single process.

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

## Architecture

```
Worker entry (worker.ts)            HUB_SESSION Durable Object
   |  HTTP claim/rotate/ticket  →   one DO per hub name
   |  WebSocket upgrades        →   owns the live hub WS + matching client sockets
   ↓                                routes signaling frames between them
D1 (brika-signaling)
   claims table
```

- **`worker.ts`** — HTTP router + WebSocket dispatch into the right DO
- **`hub-session.ts`** — the Durable Object: keeps the hub's long-lived socket and dispatches signaling frames to each client session
- **`hub-resolution.ts`** — pure helpers that extract the hub name from a request URL and stamp `<meta name="brika:hub">` into the bootstrap shell
- **`claims-d1.ts`** — D1-backed `ClaimStore` (same surface as the Bun coordinator's in-memory store)
- **`tickets.ts`** — re-exports `mintTicket` / `verifyTicket` from `@brika/remote-access-protocol`
- **`bootstrap/`** — the ~15 KB shell the Worker serves at every UI path. Opens a WebRTC bridge to the hub, RPC-fetches `/index.html` + every referenced `/assets/*` chunk through the data channel, then injects an import map so the browser ES loader resolves every URL to a Blob. The UI a user runs is therefore the version their hub is running.

## Bootstrap dev mode

The bootstrap reads its coordinator from the page origin by default. For local
iteration without a deploy, point it at a `wrangler dev` instance:

```bash
bun run dev:worker                         # wrangler dev on http://localhost:8787
# then open http://localhost:8787/<hubName>?debug=1
```

`?debug=1` prints every bootstrap step to the browser console — useful when
the splash hangs and you want to know which RPC frame got lost. The setting
also persists if you do `localStorage.setItem('brikaBootstrapDebug', '1')`.

`?coordinator=<origin>` overrides the coordinator origin for the bootstrap
without touching the page's URL bar — handy when the bootstrap shell came
from production but you want it to talk to a locally-running coordinator.

## Local dev

```bash
bun --filter @brika/signaling-worker dev          # wrangler dev with hot reload
bun --filter @brika/signaling-worker d1:migrate:local
```

## Deploy

```bash
wrangler secret put TICKET_SECRET                  # one-time
bun --filter @brika/signaling-worker d1:migrate:prod
bun --filter @brika/signaling-worker deploy        # builds bootstrap first, then deploys
```

`wrangler.toml` pins the route to `hub.brika.dev` and binds the D1 database + `HUB_SESSION` Durable Object namespace.

## Design

- Stateless ticket mint/verify keeps the request hot path off D1 — only the bearer auth on `/rotate` and `/release` touches the database.
- The DO owns the hub's WebSocket, so a hub reconnect cleanly replaces the previous socket without races.
- All wire-format types + crypto helpers come from [`@brika/remote-access-protocol`](../../packages/remote-access-protocol/) so the worker and the Bun coordinator stay byte-for-byte compatible.
