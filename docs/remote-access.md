# Remote access architecture

Branch: `feat/remote-access` · Audience: new contributor familiar with TypeScript and WebRTC fundamentals.

## 1. Overview

A user types `hub.brika.dev/` in a coffee shop. They reach the UI of a Brika hub running on their home network, behind NAT, with no port forward and no public IP. The hub never exposes an HTTP server to the internet. The coordinator (CF Worker in prod, Bun in dev) never sees app payloads — it brokers SDP/ICE and drops out. Three actors:

- **Hub** (`apps/hub`, Bun + werift) — source of truth. Owns a claimed name + bearer token in the OS keychain. Holds one persistent outbound WebSocket to the coordinator. Answers incoming offers and serves its own in-process Hono `ApiServer` over each data channel.
- **Coordinator** (`apps/signaling` for dev, `apps/signaling-worker` for prod). Stateless ticket mint; first-come-first-serve name claims; pure SDP/ICE relay.
- **Browser** (`apps/signaling-bootstrap` shell → `apps/ui` app). Loads a small shell, opens a peer to the hub, RPC-fetches the hub's `/index.html` + `/assets/*` over the data channel, swaps its mount for the hub's UI, then installs a global `fetch` interceptor so every subsequent `/api/*` flows back over the same channel.

## 2. Components

- **`@brika/remote-access-protocol`** (`packages/remote-access-protocol/`). Pure, dependency-free wire format + crypto. Web Crypto only — runs in workerd, Bun, and the browser unchanged. `PROTOCOL_VERSION = 1` (`src/version.ts`) is checked on every frame.
- **`@brika/signaling`** (`apps/signaling/`). Self-host Bun coordinator. JSON-file claims store, in-memory `Registry`. One process.
- **`@brika/signaling-worker`** (`apps/signaling-worker/`). Production coordinator at `signaling.brika.dev`. D1 for claims, one Durable Object per hub for live session state. Also serves the bootstrap UI shell from `ASSETS`.
- **`apps/signaling-bootstrap`**. The React shell embedded in the Worker. Resolves the hub name, opens a WebRTC peer, primes the SW cache with the hub's bundle, then injects scripts + CSS so the hub's UI takes over the page.
- **`apps/hub/src/runtime/remote-access/`**. Hub-side wiring: `SignalingClient` (WS + reconnect), `PeerSession` (one per browser), `RpcServer` (frames → `ApiServer.fetchInternal`), `RemoteAccessService` (DI singleton, owns identity + session map).
- **`apps/ui/src/lib/api/`**. `DataChannelTransport`, `CookieJar`, the module-load-time `fetch` interceptor, and the SW-to-page bridge.

## 3. Hub claim lifecycle

A name is a subdomain-safe label (`/^[a-z][a-z0-9-]{2,30}[a-z0-9]$/`, length 4–32; `validateName` in `packages/remote-access-protocol/src/claims-validation.ts`). Reserved names (`admin`, `api`, `www`, …) are rejected; full set in the same file.

```ts
POST /v1/hubs/claim          { name: "maxime" }
  → 200 { name, token, createdAt }
POST /v1/hubs/:name/rotate   Authorization: Bearer <token>
  → 200 { name, token }
DELETE /v1/hubs/:name        Authorization: Bearer <token>
  → 200 { ok: true }
```

Storage:

- **Dev (Bun)**: `ClaimStore` (`apps/signaling/src/claims.ts`) — a `Map<name, Claim>` mirrored to `./.signaling-claims.json` via atomic write-rename, serialised through a write chain.
- **Prod (Worker)**: `D1ClaimStore` (`apps/signaling-worker/src/claims-d1.ts`) — single `claims` table with `claims_token_idx` for indexed `findByToken`. UNIQUE constraint on `name` → `ClaimError('taken')`.

Tokens are opaque (32 random bytes, base64url; `generateToken` in `claims-validation.ts`). Bearer comparison runs through `constantTimeEqual` (`subprotocols.ts`). The bearer-check path is indexed-lookup-then-constant-compare; the comparison is meaningful only against second-preimage timing on a hit.

Hub-side identity is persisted in the OS keychain via `SecretStore`:

```ts
SIGNALING_NAME_SECRET_KEY     = 'remote_access.hub_name'
SIGNALING_TOKEN_SECRET_KEY    = 'remote_access.signaling_token'
COORDINATOR_ORIGIN_SECRET_KEY = 'remote_access.coordinator_origin'
```

`BRIKA_REMOTE_CLAIM=name:token` is a CI/test escape hatch. `BRIKA_DEV_AUTOCLAIM=<name>` makes a fresh worktree self-claim on boot.

## 4. Connection flow

```
user → hub.brika.dev/        (HTTP)
worker serves bootstrap shell + injects <meta name="brika:hub">
bootstrap → POST /v1/tickets (HTTP)
bootstrap → WS /v1/client?hub=&ticket=
bootstrap ⇌ hub over WebRTC data channel
```

### 4.1 Bootstrap shell load

The Worker's `serveUiShell` (`worker.ts`) calls `resolveHubFromUrl` (`hub-resolution.ts`) on every UI request. If the first path segment matches the hub-name shape and isn't a Vite asset prefix (`assets`, `sw.js`, `favicon.*`, `robots.txt`, `manifest.json`), it serves `index.html` from `env.ASSETS` and runs `injectHubMeta` to add `<meta name="brika:hub" content="<name>">` before `</head>`.

### 4.2 Hub-name resolution (browser side)

`apps/signaling-bootstrap/src/lib/hub-storage.ts` — priority:

1. `?hub=<name>` URL override (persisted to `localStorage`).
2. `localStorage['brika.bootstrap.hubName']`.
3. `null` → landing screen.

A legacy `/<hubName>` URL prefix is silently stripped to `/` at attempt start (`useBootstrap.ts`). The deployed UI then resolves the name from `<meta name="brika:hub">` (preferred), `?hub=`, or path — in that order (`apps/ui/src/lib/api/index.ts`).

### 4.3 Ticket mint

```ts
POST {coordinator}/v1/tickets   { hubName }
  → 200 { ticket, expiresAt, iceServers }
```

Handler: `handleTickets` (`signaling/src/main.ts`, worker `worker.ts`). Validates the hub is claimed (404 otherwise), then calls `mintTicket` (`packages/remote-access-protocol/src/tickets.ts`):

```
ticket = base64url(header).base64url(claims).base64url(HMAC_SHA256)
claims = { hub, exp, nonce }   // 60s TTL
```

Stateless — verification is a single HMAC check + expiry compare (`verifyTicket`).

### 4.4 WebSocket signaling open

```ts
new WebSocket(
  `${coordinator}/v1/client?hub=${name}&ticket=${ticket}`,
  [`brika.v${PROTOCOL_VERSION}`, `ticket.${ticket}`]
)
```

Auth metadata lives in `Sec-WebSocket-Protocol` because browsers strip non-standard headers on upgrade. `parseSubprotocols` (`subprotocols.ts`) extracts the `brika.v<n>` version pin and the `bearer.<…>` / `ticket.<…>` credential. The coordinator validates the ticket against `TICKET_SECRET` and the hub name, refuses if the hub is offline, then upgrades.

Hub-side: same dance with `bearer.<token>` instead of `ticket.<…>` (`SignalingClient`).

After upgrade the coordinator pushes:

```ts
{ v: 1, kind: 'session.iceServers', iceServers: [...] }
```

### 4.5 SDP/ICE exchange

The browser creates the data channel **first**, then crafts the offer:

```ts
const pc = new RTCPeerConnection({ iceServers })
const channel = pc.createDataChannel('brika.rpc', { ordered: true })
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)
ws.send({ kind: 'client.offer', hubName, sdp: offer.sdp, ticket: '' })
```

The coordinator forwards as `session.offer` to the hub WS. `PeerSession.acceptOffer` (`peer-session.ts`) sets the remote, creates an answer, replies via `onAnswer` → `SignalingClient.send({ kind: 'hub.answer' })` → coordinator → browser as `session.answer`.

ICE candidates trickle both ways. The browser queues local candidates until `sessionId` is known (assigned by the coordinator on its first reply, `peer.ts`). The hub side relies on `werift`'s own trickle. Both sides also queue **remote** ICE that arrives before `setRemoteDescription` resolves: see `#pendingRemoteIce` flushing in `data-channel-transport.ts`.

### 4.6 Data channel open + `hello` handshake

Once the data channel hits `open`, both peers immediately emit:

```ts
{ v: 1, kind: 'hello', role: 'hub' | 'client',
  softwareVersion, maxProtocolVersion: 1 }
```

Capability negotiation is unused at v1 — the hub ignores any unknown caps (`rpc-server.ts`). The label `brika.rpc` is canonical for the UI's transport; the bootstrap labels its channel `rpc`. Both ride the same RPC subprotocol.

### 4.7 Asset graph fetch

In the bootstrap, `buildAssetGraph` (`asset-graph.ts`):

1. RPC-fetch `/` through the peer. Get HTML.
2. `DOMParser` → collect `<script type="module">` + `<link rel="stylesheet">`.
3. BFS the import graph: every absolute-path module specifier matched by `IMPORT_FROM_RE` / `IMPORT_CALL_RE` / `IMPORT_SIDE_RE`, and every `url(...)` in CSS, RPC-fetched and `cache.put` into `brika-assets-v2` (cache name shared with `public/sw.js`).
4. Vite's HMR runtime is replaced by `VITE_CLIENT_STUB`. Keeps `updateStyle` / `removeStyle` real (Vite's CSS modules need them), no-ops `createHotContext` and friends.

If the hub returns HTML for a `.js` URL (misconfigured dev UI proxy), `fetchThroughPeer` throws `HtmlForModuleError`, surfacing as a specific user-facing error rather than a silent module-parse failure.

### 4.8 Hub UI bootstrap

`injectGraph`:

1. Snapshot the bootstrap's existing `<link rel=stylesheet>` + `<style>`.
2. Append the hub's `<link>` tags, await all `load` events.
3. Remove the bootstrap's snapshot.
4. Recreate `#root` empty (`swapRoot`).
5. Append the hub's `<script type=module>` tags — the browser fetches them, the SW serves from cache, the hub's React app mounts.

The bootstrap's React tree no longer drives the page after this point.

### 4.9 Global `fetch` interceptor + SW bridge

When `apps/ui/src/lib/api/index.ts` loads (eagerly at module load when `detectRemote()` succeeds), it constructs the `DataChannelTransport` and installs `installFetchInterceptor`:

```ts
globalThis.fetch = (input, init) => {
  const url = resolveUrl(input);
  if (url.host === coordinatorHost && url.pathname.startsWith('/v1/')) {
    return original(input, init); // coordinator calls bypass the transport
  }
  if (url.pathname.startsWith('/api/')) {
    return transport.fetch(input, init);
  }
  return original(input, init);
};
```

Dynamic `import('/api/bricks/modules/...')` doesn't go through `globalThis.fetch` — it goes through the SW. `apps/signaling-bootstrap/public/sw.js` detects `/api/*` and `postMessage`s a `brika:sw-proxy` envelope to the controlling page with a `MessagePort`. `installSwProxyListener` (`sw-proxy.ts`) receives the message, runs the request through the same `DataChannelTransport`, and posts the body back through the port. The SW returns it as a normal `Response`.

## 5. RPC protocol

JSON text frames on the data channel. Every frame carries `v: 1` + `kind`. Defined in `packages/remote-access-protocol/src/rpc.ts`.

| Direction       | Kind              | Purpose                                                              |
| --------------- | ----------------- | -------------------------------------------------------------------- |
| both            | `hello`           | one-shot, advertise version + caps                                   |
| client → hub    | `request`         | start a request: method, url, headers, optional `bodyText`/`bodyB64` |
| client → hub    | `abort`           | cancel an in-flight request by `id`                                  |
| hub → client    | `response.head`   | status + headers; sent before any chunks                             |
| hub → client    | `response.chunk`  | `dataText` or `dataB64`; zero or more                                |
| hub → client    | `response.end`    | terminal frame on success                                            |
| hub → client    | `response.error`  | terminal frame on failure (`code`, `message`, optional `status`)     |

`id` is a monotonic integer chosen by the client and echoed on every response frame. Both sides keep an in-flight map keyed by id (`#inflight` in `data-channel-transport.ts`, `rpc-server.ts`). Ids are scoped to one data channel and reusable after the request completes.

Chunking: SCTP `send()` caps at the negotiated `maxMessageSize` (commonly 64 KiB). After JSON escape blow-up that's not safe, so `responseToFrames` fragments at 16 KiB raw (`bridge.ts`). UTF-8 boundaries are handled by a streaming `TextDecoder` so multi-byte chars never split.

Binary bodies: base64 in `bodyB64` / `dataB64`. Text content-types (`isTextContentType` in `bridge.ts`) use `bodyText` / `dataText`. The `BINARY_FRAMES` cap is reserved for a v2 that would skip the base64 envelope.

Header preservation: `headers: ReadonlyArray<readonly [string, string]>` keeps repeated `Set-Cookie` (a regular `Headers.forEach` callback comma-joins them per Fetch spec — see the `getSetCookie()` workaround at the bridge's response packer). Hop-by-hop headers, `host`, and `content-length` are stripped on both ingress and egress.

Aborts: client sends `{ kind: 'abort', id }`, hub's `RpcServer#abort` flips the request's `AbortController`, `responseToFrames` observes it and emits `response.error` with `code: 'aborted'`.

## 6. Authentication over the channel

The hub already accepts both `Authorization: Bearer` and a cookie set by its LAN login flow. Over the data channel the cookie path matters because in-app code reaches for `fetch` without thinking.

**Problem**: `Cookie` is a "forbidden request header" — the browser's `Request` constructor silently drops any `Cookie` you set via `new Request(url, { headers: { Cookie: ... } })`. Same for `Set-Cookie` on the response side: the browser never exposes it to JS, so the `Response` created by `ResponseAssembler` doesn't populate `document.cookie`.

**Workaround** (`apps/ui/src/lib/api/data-channel-transport.ts`):

```ts
// Outbound: inject Cookie INTO the wire frame, after Request serialization.
const frame = this.#withCookieHeader(baseFrame, request);
// Inbound: pull Set-Cookie OUT of the wire frame, into CookieJar.
this.#extractSetCookies(msg);
```

`CookieJar` (`cookie-jar.ts`) parses `Set-Cookie`, honours `Path` / `Max-Age` / `Expires`, ignores `Domain` / `HttpOnly` (irrelevant once we're in JS), treats `Secure` as always-true (the channel is DTLS-encrypted). Persistence: `sessionStorage` — tab-scoped, so closing the tab logs the user out. The hub's `verifyToken` middleware accepts either form.

## 7. Failure modes & recovery

`classifyError` (`apps/signaling-bootstrap/src/lib/classify-error.ts`) maps the error message to user-facing copy + retry hint:

| Error pattern                          | Title                                  | Kind         |
| -------------------------------------- | -------------------------------------- | ------------ |
| `Unknown hub` / `404`                  | "No hub named X"                       | change-name  |
| `missing a module entry` / `outdated`  | "Your hub needs an update"             | help         |
| `Hub returned HTML for`                | "Your hub's dev UI proxy isn't serving"| retry, 30s   |
| `Signaling WS` / `open timed out`      | "Can't reach the signaling service"    | retry, 30s   |
| `Data channel` / `WebRTC … failed`     | "Your hub looks offline"               | retry, 30s   |
| `Failed to fetch` / `NetworkError`     | "Network error"                        | retry, 15s   |
| (fallback)                             | `Couldn't reach "<name>"`              | retry, 30s   |

**Coordinator unreachable** — hub-side: `SignalingClient` reconnects with exponential backoff + jitter, `1s → 30s` cap. Hub startup is not blocked. Browser-side: `/v1/tickets` `fetch` rejects → `TransportError('ticket-failed')` → classified as network error.

**Hub offline** — coordinator's `/v1/client` upgrade returns 503 (Bun) or accepts then closes with `session.error code: 'hub-offline'` (Worker).

**Ticket expired** — `verifyTicket` returns `null`, upgrade rejected 401. Browser triggers a fresh mint on the next attempt.

**Peer disconnected** — `RTCPeerConnection.connectionState` going to `failed`/`closed`/`disconnected` makes `PeerSession.close()` fire. Browser-side, `DataChannelTransport#teardown` fails every in-flight request with the cause code, then `#scheduleReconnect` runs. The bootstrap's hook re-mints + reopens; the loaded UI's transport reconnects in place.

**SW desync** — the bootstrap pings `/__brika_sw_ping__` after register. If the controlling SW responds with anything other than `SW_VERSION`, it's stale: `softResetForRecovery` unregisters every SW, drops every `brika-*` cache, bumps a `sessionStorage` counter, and reloads. Max two attempts before giving up so we don't infinite-loop.

**Asset 404** — `primeCache` tolerates 404 on optional resources but re-throws `HtmlForModuleError`. The hub returning HTML for a JS URL is treated as user-actionable (Vite down, dev UI proxy misrouting).

## 8. Coordinator modes

Both speak `@brika/remote-access-protocol` byte-for-byte; pick one with `BRIKA_COORDINATOR_URL`.

| Concern                     | Bun (`@brika/signaling`)             | Worker (`@brika/signaling-worker`)             |
| --------------------------- | ------------------------------------ | ---------------------------------------------- |
| Process model               | one Bun process                      | Worker fronts; one DO per hub                  |
| Claims storage              | JSON file + atomic rename            | D1 table with `claims_token_idx`               |
| Session state               | in-memory `Registry`                 | DO + WebSocket Hibernation API                 |
| Hub WS replace-on-reconnect | `Registry.registerHub` evicts prior  | DO loops `getWebSockets('hub')` + close(4001)  |
| ICE servers                 | `SIGNALING_ICE_SERVERS` env, JSON    | Hard-coded STUN-only                           |
| `/v1/hubs/:name/status`     | not implemented                      | DO synthesises a `GET /internal/status`        |
| Static UI shell             | not served                           | Worker serves bootstrap + injects `<meta>`     |

Identity model + bearer/ticket auth + frame shape are identical.

## 9. Happy-path sequence

```
Browser              Coordinator (Worker/Bun)         Hub (apps/hub)
   │                         │                            │
   │  GET hub.brika.dev/     │                            │
   ├────────────────────────►│  ASSETS.fetch + injectHubMeta
   │◄────────────────────────┤  (shell HTML w/ meta)      │
   │                         │                            │
   │  POST /v1/tickets       │  D1.claims.get(name)       │
   ├────────────────────────►│  → mintTicket(SECRET)      │
   │◄────────────────────────┤  { ticket, iceServers }    │
   │                         │                            │
   │  WS /v1/client?…&ticket │  verifyTicket + DO.fetch   │
   ├════════════════════════►│  acceptWebSocket('client') │
   │◄═══════════════════════ │  session.iceServers        │
   │                         │                            │
   │  pc.createDataChannel('brika.rpc')                   │
   │  pc.createOffer()                                    │
   │  client.offer ─────────►│  session.offer (+ sessId) ►│
   │                         │                            │  pc.acceptOffer
   │◄──────────── session.answer ◄── hub.answer ──────────┤
   │  client.ice ───────────►│──── session.ice ──────────►│
   │◄──── session.ice ◄──────┤◄─── hub.ice ───────────────┤
   │                         │                            │
   │      ╔════════ DTLS-SRTP data channel ('brika.rpc') open ═╗
   │      ║                                                    ║
   │      ║  RPC: hello (both sides)                           ║
   │      ║  request { id:1, GET / } ─────────────────────────►║  app.fetch
   │      ║  ◄ response.head + chunks + end                    ║
   │      ║  request { id:2, GET /assets/index-X.js } ────────►║
   │      ║  ◄ response.head + chunks + end                    ║
   │      ║  …(asset graph BFS)…                               ║
   │      ╚════════════════════════════════════════════════════╝
   │
   │  injectGraph → hub UI mounts, fetch interceptor live
   │  every /api/* GET/POST now flows over the same channel
   │  every dynamic import /api/bricks/modules/* via SW bridge
```

## 10. Trust model and isolation

Once the bootstrap commits to a hub, the hub's JavaScript runs in the `hub.brika.dev` origin alongside the bootstrap's own code. This is a deliberate trade-off — the alternative (per-hub subdomain `<name>.hubs.brika.dev`) was tried and dropped because the operational cost (wildcard TLS provisioning, DNS, certificate rotation) wasn't worth it for the typical "connect to my own hub" use case. The realistic threat we're defending against isn't "the hub I set up is malicious" — it's "switching between hubs in the same browser can't leak credentials".

### What we trust about a chosen hub

A hub the user names is treated as trusted for that session:

- Its JavaScript executes in the `hub.brika.dev` origin with full DOM/SW/storage capabilities scoped to that origin.
- Its `Set-Cookie` headers populate the in-memory cookie jar; subsequent `/api/*` calls re-attach those cookies.
- Its `<script>` and `<link>` tags are injected into the page; the SW caches the bytes under `brika-assets-v2`.

A user binding to a hub they don't control (clicking a phishing link like `hub.brika.dev/?hub=evil`) carries the same risk as running an unknown installer. We surface the hub name in the landing card, but the trust decision is the user's.

### Cross-hub isolation (what we *do* enforce)

When a browser has bound to multiple hubs over time, leakage **between** hubs is closed:

- **Cookie jar is per-hub** (`apps/ui/src/lib/api/cookie-jar.ts`). Storage key is `brika.remote.cookies::<hub>`; the constructor sweeps stale entries from other hubs. Cookies issued by hub A can't ride a request to hub B in the same browser.
- **Set-Cookie Path enforcement.** Cookies whose `Path` falls outside `/api` are rejected at the jar boundary — the jar is only consulted for `/api/*` requests, so off-surface paths are pure attack surface with no benefit.
- **SW cross-tab guard** (`apps/signaling-bootstrap/public/sw.js`). The `/api/*` proxy routes to the originating client (`event.clientId`), not `allClients[0]`. A request emitted by tab A bound to hub X cannot be answered by tab B bound to hub Y.
- **Cache purge on rebind** (`apps/signaling-bootstrap/src/lib/hub-storage.ts`). `storeHubName` / `clearHubName` drop every `brika-*` cache when the prior name differs from the new one — the next page load fetches a fresh asset graph from the new hub.
- **CORS/Origin allowlist on the coordinator.** `/v1/hubs/claim` and `/v1/tickets` reject cross-origin browser POSTs from any `Origin` not in the allowlist. A malicious page on another domain can't mint a ticket against the user's session.

### Server-side hardening

- **Bridge URL validation** (`packages/remote-access-protocol/src/bridge.ts`). `rpcRequestToFetch` rejects non-absolute or protocol-relative URLs so a peer cannot bypass the host-allowlist middleware via `msg.url = "https://attacker/..."`.
- **Hostile-CSS smuggling** (`apps/signaling-bootstrap/src/lib/asset-graph.ts`). `CSS_URL_RE` excludes whitespace inside `url(...)` so a hub-served CSS body cannot drive CRLF into the BFS fetcher's request line.
- **Ticket secret refusal** (`apps/signaling/src/main.ts`). The Bun coordinator refuses to start with the well-known dev default when `NODE_ENV=production`.

### What we don't have

- **In-session isolation between the hub UI and the bootstrap.** If a chosen hub is compromised, its JS sees the bootstrap's localStorage (just the bound hub name) and the hub's own cookie jar. It can call `/api/*` as the logged-in user *of that hub*. It cannot reach other hubs (cookie scoping, SW guard, cache purge).
- **Client-identity binding on tickets.** Tickets bind to `hubName` only; anyone with a valid ticket and the hub name can open a peer. Browser-bound nonces would tighten this but aren't in v1.
- **Rate limiting on `/v1/tickets` and `/v1/hubs/claim`.** Cloudflare's rate-limit binding belongs here but isn't wired yet.

If you need per-hub origin isolation, the realistic move is `<iframe sandbox>` (no `allow-same-origin`) with a `postMessage` transport bridge. This is a substantial change — the transport and cookie jar would have to live in the parent and the hub UI's `apiFetch` becomes a thin shim that posts to parent. Documented here so a future maintainer doesn't reinvent the question.

## 11. Key files

- Protocol: `packages/remote-access-protocol/src/{rpc,signaling,bridge,codec,tickets,claims-validation,subprotocols,version}.ts`
- Bun coordinator: `apps/signaling/src/{main,router,registry,claims,tickets}.ts`
- CF Worker: `apps/signaling-worker/src/{worker,hub-session,claims-d1,hub-resolution,tickets}.ts`
- Bootstrap: `apps/signaling-bootstrap/src/{hooks/useBootstrap,lib/{peer,asset-graph,hub-storage,hub-name,classify-error}}.ts`
- Bootstrap SW: `apps/signaling-bootstrap/public/sw.js`
- Hub runtime: `apps/hub/src/runtime/remote-access/{peer-session,rpc-server,signaling-client,remote-access-service,index}.ts`
- UI transport: `apps/ui/src/lib/api/{data-channel-transport,cookie-jar,sw-proxy,index}.ts`
- UI claim flow: `apps/ui/src/features/settings/components/remote-access/{index,hooks}.ts`
