# Plugin Sandbox Roadmap

Brika plugins are third-party code. They need access to host I/O (network,
filesystem, secrets, hardware) without becoming an escape vector for the
operator's machine. This document tracks the staged hardening plan.

The single primitive every plugin uses is the typed **grant** — declared in
`@brika/grants`, vended through the SDK as `ctx.foo.bar(args)`. Each tier
below describes what's enforced around that primitive at runtime.

## Tier 1 — Grant primitive (shipped)

**Plugin-facing surface** — typed `ctx` Proxy reads a frozen, branded vector
the prelude injects at startup; unknown grants reject at the SDK boundary
with no IPC round-trip. Single `grant.request` RPC carries every call.

**Hub-side primitives**
- Per-`PluginProcess` `GrantRegistry` (`@brika/grants`)
- Args / scope / result Zod validation; defensive scope re-parse at dispatch
- `net.fetch` first-class grant: host allow-list, timeout, retry with
  `Retry-After` honour, single-flight on GET/HEAD, hub-side `AbortSignal`
  plumbed through fetch + retry backoff
- `NET_HOST_NOT_ALLOWED` cataloged code with `publicDataShape` redaction
  (the operator's full allow-list stays in hub logs only)

**What this tier does NOT enforce** — without lockdown the plugin process
can still call `globalThis.fetch`, `Bun.spawn`, `node:fs`, etc. directly.
The grant primitive is the *recommended* surface; Tier 2 makes it the
*only* surface for the things that matter.

## Tier 2 — Realm lockdown (shipped in this PR)

The prelude's `lockdown.ts` runs FIRST inside every plugin process and:

- **Scrubs ambient I/O globals** — `globalThis.fetch`, `WebSocket`,
  `EventSource`, `XMLHttpRequest`, `BroadcastChannel`, `Request`,
  `Response` → throw `PERMISSION_DENIED` on call.
- **Scrubs Bun namespace I/O** — `Bun.spawn`, `Bun.spawnSync`, `Bun.write`,
  `Bun.file`, `Bun.serve`, `Bun.connect`, `Bun.listen`, `Bun.udpSocket`,
  `Bun.dns` → throw.
- **Scrubs `eval`** — direct eval is gone (`Function` stays intact; see
  notes below).
- **Captures `process.send` / `process.on` into a closure** before scrub,
  re-exposes via `getSafeProcessSend` / `getSafeProcessOn` so the
  prelude itself keeps working. Plugin code reaching for `process.send`
  directly hits the scrub stub.
- **Closure-private vector write-key** — `installVectorV2(vec, writeKey)`
  refuses any installer that doesn't hold the per-process write-key
  symbol. The SDK barrel no longer exports `installVector` at all; only
  the prelude reaches it via `@brika/sdk/ctx`.
- **Module-loader deny-list** — `Bun.plugin({ setup })` registers
  `onResolve` against `^(node|bun):` and rejects any matching path in
  `DENIED_NATIVE_MODULES` (`node:fs`, `node:net`, `node:child_process`,
  `node:vm`, `bun:ffi`, `bun:sqlite`, …).
- **Integrity gate** — `assertSealed()` re-checks the scrubs against a
  snapshot before sending `ready`. If any descriptor drifted between
  lockdown and ready, the prelude exits with `78` (EX_CONFIG).

**Modes** — `BRIKA_LOCKDOWN_MODE = enforce | warn | off`. Default
`enforce`. `warn` logs but delegates to the real impl; `off` is an
emergency escape hatch (never run prod with `off`).

### Known Bun runtime limitation

`Bun.plugin`'s `onResolve` does NOT fire for built-in module imports
(`node:*`, `bun:*`) issued as bare specifiers — they resolve through
Bun's C++ module table, bypassing JS-level plugins. As of Bun 1.3.13
there is no runtime hook to block them. See
[`apps/hub/src/__tests__/lockdown-redteam.test.ts`](../../apps/hub/src/__tests__/lockdown-redteam.test.ts)
— two tests pin the leak so we notice (loudly) when Bun closes the gap.

The real defense for this class of escape is the ambient-global scrub:
even if a plugin does `await import('node:fs').then(fs => fs.writeFileSync(...))`,
the file write reaches the OS. So the gap is *real* and worth tracking.
Until Bun fixes it upstream, the long-term answer for untrusted plugins
is Tier 3 (WASM isolation).

### What Tier 2 also includes in this PR

- **Per-call watchdog** — every `grant.request` is raced against
  `AbortSignal.timeout(60_000)`; the composed signal is plumbed into
  handler ctx so `net.fetch` and friends cancel cooperatively.
- **Timing-side-channel jitter** — vector recompute + args parse run
  *before* the grant/deny branch, then a 0-5ms `crypto`-random delay
  fires regardless of verdict. Neutralizes the application-layer oracle
  a plugin would use to fingerprint the vector by measuring call
  latency.
- **Wire scope strip** — `GrantEntry.scope` ships only on the hub side;
  the plugin's wire `GrantEntry` has `{ id, ctxPath }` only.

## Tier 3 — WASM isolation (untrusted plugins, future)

For an open marketplace where plugin code is not pre-vetted, the only
defensible isolation is a separate JS runtime with no host I/O at all.
The current capability surface (Zod-JSON args/results, no live JS
handles) is WIT-portable, so the transport swap is what changes — not
the contract.

Behind `BRIKA_FEATURE_WASM_PLUGINS=1` (not implemented):

- Plugin code compiles to a JS-in-WASM artifact (Javy / QuickJS-wasm).
- Host loads via Wasmtime; capabilities exposed via a WIT interface
  that mirrors `ctx`.
- Same `import { ctx } from '@brika/sdk'`, same plugin source.

## What's NOT in any tier yet (residual risk)

Tracked here so reviewers know the floor.

1. **Bun runtime escapes** — pin Bun version + subscribe to advisories.
2. **Pure-JS app-layer attacks** — a malicious npm dep inside a plugin
   can pollute prototypes, smuggle JS in JSON responses, etc. Lockdown
   blocks host I/O; it doesn't sanitize plugin-internal behaviour.
3. **CPU starvation** — `--smol --max-heap-size` caps memory; CPU
   preemption needs cgroups / launchd job constraints. Operator-visible.
4. **Per-grant scoped permits in StateStore** — the modern `grants: {…}`
   manifest map is still gated by the legacy `permissions: string[]`
   family list until a new `plugin_grants` sqlite table lands.
5. **Audit log** — HMAC-chained sqlite append log for every dispatch
   (granted / denied / timeout / quota) — not yet written.
6. **Code integrity** — SRI-style verification of plugin entry at
   spawn-time, with the fingerprint pinned in StateStore.
7. **Quota meter** — token-bucket per (plugin, grant) — sitting in the
   plan but not yet shipped.
8. **Per-grant byte budgets** — call-count quota wouldn't stop a single
   60GB download.
9. **Hot revocation** — IPC push event + closure-write-key gate
   together support a `capability.vector.update` flow; the wire half
   isn't built yet.

## Verifying the lockdown locally

```sh
# Full red-team coverage (subprocess attacks against each scrub):
bun --filter @brika/hub test --filter lockdown-redteam

# Prelude integration (warn/enforce/off modes):
bun --filter @brika/hub test --filter prelude

# Toggle modes during dev:
BRIKA_LOCKDOWN_MODE=warn brika dev    # log + delegate
BRIKA_LOCKDOWN_MODE=off  brika dev    # no scrub (debug only)
```
