# Remote Access

Brika hubs are reachable from outside the LAN through a WebRTC tunnel brokered by a small Cloudflare Worker called the **coordinator**. The user claims a name on the coordinator (`my-home`), and visitors open `https://hub.brika.dev/my-home` in any browser; the Worker resolves the name to the hub's signaling identity and negotiates a WebRTC data channel directly to the hub. After negotiation, every request travels P2P — the coordinator sees only the handshake.

This page covers the protocol. The Cloudflare Worker code lives in `apps/signaling/`.

Key files:

* `apps/hub/src/runtime/remote-access/remote-access-service.ts` — claim flow + lifecycle.
* `apps/hub/src/runtime/remote-access/signaling-client.ts` — WebSocket to the coordinator.
* `apps/hub/src/runtime/remote-access/peer-session.ts` — per-peer WebRTC session.
* `apps/hub/src/runtime/remote-access/rpc-server.ts` — request/response over the data channel.
* `apps/signaling/` — the coordinator Worker + bootstrap SPA.

## Claim

The user picks a name in **Settings → Remote access** and clicks *Claim*. The hub:

1. POSTs to `<coordinator>/v1/hubs/claim` with the desired name.
2. The coordinator generates a bearer token, records `name → (token, signaling-url, ICE servers)`, and returns the token.
3. The hub stores the name + token in the [Secret Store](secret-store.md) under `dev.brika.remote.claim`.

There is no parallel env-var path. To bootstrap a hub for CI, call the coordinator's claim API directly and let the SecretStore persist the result.

## Signaling

After a successful claim, the hub opens a WebSocket to `wss://<coordinator>/v1/hub` with `Authorization: Bearer <token>`. This is the **signaling channel** — used only to set up WebRTC sessions, not for data. It stays open for the hub's lifetime.

The coordinator multiplexes messages over this connection:

* **Peer-arrived** — a browser at `/<name>` requested a session. The coordinator forwards the peer's offer.
* **Hub-response** — the hub returns its SDP answer.
* **Trickle ICE** — both sides send candidates as they're gathered.
* **Heartbeat** — the coordinator pings; the hub responds.

## Session

For each browser peer:

1. The peer fetches `https://hub.brika.dev/<name>` and loads the bootstrap SPA.
2. The SPA opens its own WebSocket to the coordinator, identifies the target hub by name, and sends an SDP offer.
3. The coordinator forwards the offer to the hub over the existing signaling WebSocket.
4. The hub creates a `RTCPeerConnection`, builds an SDP answer, sends it back.
5. ICE candidates are exchanged through the coordinator (trickle).
6. The data channel opens. The coordinator's involvement ends.

The hub creates one `RTCPeerConnection` per peer session, owned by a `PeerSession` instance.

## Requests over the data channel

Once the data channel is open, the SPA tunnels HTTP semantics over it:

```
Browser → Hub:  { kind: 'request', id, method, path, headers, body }
Hub    → Browser: { kind: 'response', id, status, headers, body }
```

`rpc-server.ts` implements this on the hub side: parse the message, dispatch through the same routing stack as a normal HTTP request, serialise the response back.

This means **all the same auth, all the same routes** — the only difference is the transport. Auth cookies travel in the headers exactly like over HTTP/1.1.

SSE works too: the hub wraps an SSE response as a stream of `{ kind: 'sse-event', id, event, data }` messages.

## Canonical host vs dev coordinator

```ts
const CANONICAL_HOST = 'hub.brika.dev';
```

In production, `https://hub.brika.dev/<name>` is the user-facing URL. A single Cloudflare Worker serves both the API (`/v1/*`) and the bootstrap SPA (`/<name>/...`).

For dev / self-hosted coordinators, the public origin falls back to a query parameter so a single coordinator host can serve any name.

## Reconnect

The signaling WebSocket reconnects with exponential backoff on disconnect. ICE failures on a peer session terminate that session only — the hub doesn't restart the whole signaling channel.

## Security

* The coordinator only sees signaling. The data channel is end-to-end encrypted (DTLS-SRTP).
* The coordinator authenticates the hub by bearer token (claimed at sign-up). Peer browsers don't authenticate to the coordinator — anyone can request a session against a public name, but the data channel terminates at the hub's auth layer.
* Once the data channel is open, the hub's normal auth gates apply. A peer that can't sign in can't do anything more than `GET /api/health`.
* The remote-access bootstrap SPA is intentionally tiny — it does the WebRTC dance and then redirects to the hub's main UI loaded over the data channel.

## See also

* **[Hub Server](hub.md)** — the routing layer the data channel reaches.
* **[Authentication](auth.md)** — what an authenticated peer can do once connected.
* **[Configuration File](../cli/configuration.md)** — `BRIKA_COORDINATOR_URL` and friends.
