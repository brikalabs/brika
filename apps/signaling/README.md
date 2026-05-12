# @brika/signaling

Self-host signaling coordinator for Brika remote access — a single Bun process that brokers WebRTC SDP and ICE between home hubs and browsers, then drops out once the data channel is open.

> Looking for the **production** coordinator? That's [`@brika/signaling-worker`](../signaling-worker/) — same protocol, Cloudflare Workers + Durable Objects + D1. This Bun build is meant for local dev and on-prem deployments where you don't want to depend on `signaling.brika.dev`.

## What it does

- `POST /v1/hubs/claim` — first-come-first-serve name claim, returns a bearer token
- `POST /v1/hubs/:name/rotate` — rotate the bearer token (requires the current one)
- `DELETE /v1/hubs/:name` — release a claim
- `POST /v1/tickets` — mint a short-lived signed ticket for a browser session
- `WS /v1/hub` — long-lived hub signaling channel, authenticated via `bearer.<token>` in `Sec-WebSocket-Protocol`
- `WS /v1/client?hub=&ticket=` — per-session browser channel, authenticated via the ticket
- `GET /v1/health` — liveness probe

## Running

```bash
bun --filter @brika/signaling dev      # watch mode on :8787
bun --filter @brika/signaling start    # one-shot
```

Environment:

| Var                          | Default                                                           |
| ---------------------------- | ----------------------------------------------------------------- |
| `PORT`                       | `8787`                                                            |
| `SIGNALING_TICKET_SECRET`    | `dev-only-secret-change-me` — **set this in production**          |
| `SIGNALING_CLAIMS_PATH`      | `./.signaling-claims.json`                                        |
| `SIGNALING_ICE_SERVERS`      | JSON array; defaults to Google + Cloudflare public STUN           |

## Storage

Claims live in a single JSON file written atomically via `rename()`. Good enough for one coordinator and a few thousand hubs. The `@brika/signaling-worker` variant swaps this for D1 to scale horizontally.

## Design

- The coordinator never sees application traffic — it only ferries SDP/ICE frames. Once the data channel opens, browser and hub talk directly.
- Bearer-token lookups go through a constant-time compare so probing prefixes doesn't leak.
- Wire format + ticket signing + name validation come from [`@brika/remote-access-protocol`](../../packages/remote-access-protocol/), so this app and the Cloudflare Worker stay byte-for-byte compatible.
