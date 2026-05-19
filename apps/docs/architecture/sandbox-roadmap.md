# Plugin Sandbox Roadmap

The current isolation model (one Bun child process per plugin, see
[plugin-isolation.md](./plugin-isolation.md)) gives crash and memory isolation
but **not capability isolation**: a plugin can call `globalThis.fetch`,
`Bun.spawn`, `node:fs`, or read `process.env` directly. Manifest `permissions`
are metadata, not enforcement.

This document describes the target architecture and the staged path to get
there. Every new helper added to `@brika/sdk` should be shaped to fit Tier 1
so Tiers 2 and 3 can be enabled without breaking plugin code.

## The single primitive: the capability bag

All host-provided capabilities are vended through a typed `ctx` object the
prelude installs in the plugin realm. Plugins never reach for ambient globals.

```ts
// Plugin code — every tier looks identical
import { onInit, ctx } from '@brika/sdk';

onInit(async () => {
  const res = await ctx.fetch('https://api.example.com/data', {
    timeout: 10_000,
    idempotencyKey: 'sync-2026-01-12',
  });
  await ctx.store.writeJSON('cache.json', await res.json());
});
```

Capabilities on `ctx` (target surface):

| Capability     | Replaces                              | Manifest gate                |
|----------------|---------------------------------------|------------------------------|
| `ctx.fetch`    | `globalThis.fetch`                    | `net.allow` host list        |
| `ctx.store`    | direct `node:fs` for plugin data      | always (plugin's own dir)    |
| `ctx.secrets`  | `getSecret/setSecret/deleteSecret`    | `secrets` permission         |
| `ctx.location` | `getDeviceLocation`                   | `location` permission        |
| `ctx.time`     | `Date.now`, `setTimeout`              | always (lifecycle-bound)     |
| `ctx.random`   | `Math.random`, `crypto.randomUUID`    | always                       |
| `ctx.process`  | `Bun.spawn`, `node:child_process`     | `exec` permission + binary allowlist |
| `ctx.signal`   | (new) AbortSignal aborted at `onStop` | always                       |

The contract is the same across tiers. Only the *implementation* and the
*enforcement of "only ctx is reachable"* change.

## Tier 1 — Capability vending (this branch)

**Goal**: ship the `ctx` surface as the recommended API. No new enforcement.

- Add `ctx.fetch` with timeout, single-flight on identical GETs, lifecycle-bound `AbortSignal`, `Retry-After`-aware backoff, idempotency keys for writes.
- Add `ctx.signal` derived from `onStop`.
- Document that direct `globalThis.fetch` is discouraged; verify-check warns on it.
- Migrate first-party plugins (Spotify, Weather, SIL) to `ctx.fetch`.

**Status**: in progress on `improve/sdk-prelude-audit-fixes`.

Most network bugs in the audit (N1, N2, N4, N7, parts of N3) disappear here
because there is now one chokepoint instead of N ad-hoc `fetch` call sites.

## Tier 2 — Hardened realm (next quarter)

**Goal**: make `ctx` the *only* reachable surface in the plugin process.

Two complementary mechanisms:

### A. Frozen globals via preload

The hub-injected prelude (today: `apps/hub/src/runtime/plugins/prelude/index.ts`)
runs before plugin code. Extend it to:

1. Delete `globalThis.fetch`, `globalThis.WebSocket`, `globalThis.Request`, `globalThis.Response`.
2. Replace `Bun.spawn` with a function that throws `PermissionDeniedError`.
3. Freeze `process.env` to a stub (`{ NODE_ENV, TZ }`).
4. Freeze the prelude's `globalThis.__brika_ipc` after install so plugin code cannot rebind it.
5. Lock `Function`, `eval` (or scrub them — debate).

### B. Module loader filter

Bun supports custom resolution. The hub-side spawn already controls the preload script; extend it with a `Bun.plugin` that:

1. Rejects any `import` matching `node:fs`, `node:net`, `node:child_process`, `node:http`, `node:dgram`, etc.
2. Rejects any `import` matching `bun:ffi`.
3. Allowlists `@brika/sdk` and the plugin's own files.

Together, these mean a plugin trying `import('node:fs')` fails at load and a
plugin trying `globalThis.fetch(...)` throws at call — and there's no way to
re-acquire the lost globals from inside the realm (the prelude has already
frozen `globalThis`, `Reflect`, and the relevant constructors).

This is the same approach that powers Endo/SES Compartments; we don't need
the full SES dependency if Bun gives us preload + loader hooks.

## Tier 3 — WASM target (long-term, untrusted marketplace)

**Goal**: run untrusted plugins with OS-level memory + syscall isolation while
keeping the same plugin author DX.

- Plugin code (TS) is compiled to JS, then bundled into a JS-in-wasm runtime
  (Javy / QuickJS-wasm) producing a `.wasm` artifact.
- The host loads the wasm module via Wasmtime/WAMR.
- Capabilities are exposed via the WIT interface that mirrors `ctx`.
- Same `import { ctx } from '@brika/sdk'`, same code, different deploy target.

Trust tiers map to runtime:

| Plugin source          | Runtime |
|------------------------|---------|
| First-party (Brika)    | Tier 2 (SES-style, fast)  |
| Verified publisher     | Tier 2  |
| Community / unverified | Tier 3 (wasm)             |

## What each tier unlocks "for free"

Because `ctx` is the single chokepoint, these become localized changes once it
exists:

- **Per-plugin egress quotas / rate limits** — counted in `ctx.fetch`.
- **Manifest network allowlist** — `"net": { "allow": ["api.spotify.com"] }` checked in `ctx.fetch`.
- **Per-plugin tracing & cost attribution** — automatic span around every `ctx.*` call.
- **Replay / fixtures in test mode** — `ctx.fetch` records in dev, replays from JSON in tests. Kills the current "no fetch mock" gap.
- **Hot permission revocation** — user toggles a permission, prelude swaps the `ctx.X` implementation under the plugin's feet.
- **Multi-language plugins** — same WIT, different SDK languages.
- **Resource caps** — CPU/mem accounted by the prelude rather than each capability separately.

## Compatibility rules during the transition

While both `globalThis.fetch` and `ctx.fetch` coexist (Tier 1):

1. The SDK exports `ctx` from `@brika/sdk` and re-exports the same helpers as
   free functions for backward compatibility (`fetch as sdkFetch`, etc.) —
   but the free functions internally delegate to `ctx`.
2. The verify-check `check-direct-globals.ts` warns (does not fail) on
   `globalThis.fetch`, `Bun.spawn`, `node:fs`, `node:child_process` imports.
3. First-party plugins migrate to `ctx.*` before the warning becomes an error.
4. Tier 2 cutover bumps `engines.brika` major; verify-check upgrades warn → error;
   prelude installs the frozen-globals layer.

## Non-goals

- We do **not** ship a custom JSX runtime. The compiler swaps
  `react/jsx-runtime` → `globalThis.__brika.jsx` (see
  [externals.ts](../../../packages/compiler/src/plugins/externals.ts)) and that
  is plenty. Plugins keep writing standard React.
- We do **not** virtualize the filesystem. `ctx.store` is the plugin's own
  data directory and that's it; anything broader is a `ctx.fs` capability that
  gates a specific allowlist in the manifest.
- We do **not** invent a new IPC protocol for Tier 3 — WIT bindings produce the
  same shape calls as today's bridge.
