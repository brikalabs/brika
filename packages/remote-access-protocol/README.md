# @brika/remote-access-protocol

Wire-format definitions and pure helpers for Brika's WebRTC remote-access stack — the signed glue between a hub running on someone's home network and a browser sitting outside it.

This package is intentionally **runtime-agnostic** and **dependency-free**: it ships only types, encoders/decoders, validators, and crypto wrappers around the Web Crypto API. It is consumed identically by:

- `apps/hub` (Bun) — the home hub that publishes itself
- `apps/signaling` (Bun, self-host) — the local-dev signaling coordinator
- `apps/signaling-worker` (Cloudflare Workers + D1 + Durable Objects) — the production coordinator at `signaling.brika.dev`
- `apps/ui` (browser) — the remote shell at `<name>.hubs.brika.dev`

## What's in the box

### Wire format

| Layer       | Module          | What it carries                                                |
| ----------- | --------------- | -------------------------------------------------------------- |
| Signaling   | `signaling.ts`  | `hub.register`, `hub.answer`, `hub.ice`, `client.offer`, `client.ice`, `session.*` |
| RPC         | `rpc.ts`        | `hello`, `request`, `response.head/chunk/end/error`, `abort`   |
| Bridge      | `bridge.ts`     | `Request` ↔ RPC frame conversion (request/response streaming)  |
| Codec       | `codec.ts`      | JSON encode/decode with envelope validation                    |
| Version     | `version.ts`    | `PROTOCOL_VERSION` — bump on breaking changes                  |

### Auth + identity

| Helper                | Purpose                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `mintTicket()`        | Issue a 60-second HMAC-signed ticket bound to a hub name                |
| `verifyTicket()`      | Verify and unpack a ticket; returns `null` for any failure              |
| `validateName()`      | Reject malformed / reserved hub names (regex-free, non-backtracking)    |
| `generateToken()`     | Cryptographically random URL-safe bearer token                          |
| `parseSubprotocols()` | Pick `brika.v<n>` / `bearer.<…>` / `ticket.<…>` out of `Sec-WebSocket-Protocol` |
| `constantTimeEqual()` | Timing-safe string compare for credential checks                        |

## Usage

```ts
import {
  mintTicket,
  parseSubprotocols,
  PROTOCOL_VERSION,
  validateName,
} from '@brika/remote-access-protocol';

const name = validateName('my-hub'); // throws ClaimError on bad input
const { ticket, expiresAt } = await mintTicket(process.env.SECRET!, name);

const subs = parseSubprotocols(req.headers.get('sec-websocket-protocol'));
if (subs.proto !== `brika.v${PROTOCOL_VERSION}`) {
  return new Response('Unsupported protocol', { status: 400 });
}
```

## Design notes

- **No Node imports.** Every helper uses Web Crypto / Web APIs only, so it runs unchanged in workerd, Bun, and the browser.
- **No quantified regexes on untrusted input.** Hub-name validation is a character-by-character scan; base64 padding is stripped with a slice loop. Both deliberate, to make the package safe to expose on a public coordinator.
- **One protocol version.** The `PROTOCOL_VERSION` constant is the source of truth — both peers refuse to talk if it doesn't match.
