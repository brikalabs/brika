# Capability System

The capability system is the **single primitive** every plugin uses to call
the hub. It replaces the 22-method `PreludeBridge` interface and the eight
domain-specific setup modules that surrounded it. One file per capability
covers the SDK type surface, the wire schema, the permission gate, and the
hub-side handler.

See [Sandbox Roadmap](./sandbox-roadmap.md) for how this primitive fits the
T1/T2/T3 staged isolation plan.

## Plugin author quickstart

```ts
import { ctx, onInit } from '@brika/sdk';

onInit(async () => {
  // All hub-mediated I/O flows through `ctx`. Capabilities the plugin
  // didn't declare in its manifest reject at the SDK boundary — zero
  // IPC round-trip on the denied path.
  const res = await ctx.net.fetch({
    url: 'https://api.example.com/data',
    retry: { maxAttempts: 3, respectRetryAfter: true, backoffMs: 500 },
  });
  await ctx.secrets.set({ key: 'last-sync', value: new Date().toISOString() });
  const loc = await ctx.location.get();
  // ...
});
```

In `package.json`, declare which capabilities you need:

```json
{
  "capabilities": {
    "dev.brika.net.fetch":   { "allow": ["api.example.com"] },
    "dev.brika.secrets.get": {},
    "dev.brika.secrets.set": {},
    "dev.brika.location.get": {}
  }
}
```

`ctx` is a Proxy that lazy-builds on first property access. Safe to call
from `onInit`, event handlers, route handlers, anywhere that runs after
the plugin process is ready. Module-load-time access throws because the
capability vector hasn't been fetched yet — use `onInit` instead.

## The shape

```ts
// Hub-importable spec (lives in @brika/sdk/capabilities/<name>)
export const netFetch = defineCapability(
  {
    id: 'dev.brika.net.fetch',            // reverse-DNS, globally unique
    ctxPath: 'net.fetch',                  // optional — defaults to id minus first 2 segments
    args: z.object({ url: z.string().url(), method: z.string().optional() }),
    result: z.object({ status: z.number(), body: z.string() }),
    permission: {
      name: 'net',
      scope: z.object({ allow: z.array(z.string()) }),
      defaultScope: { allow: [] },
      icon: 'globe',
    },
    description: 'Make HTTP requests to allow-listed hosts',
  },
  // Placeholder handler — the hub re-binds with a real implementation in
  // apps/hub/src/runtime/plugins/capabilities/<name>.ts
  () => { throw new Error('not registered'); },
);

// Plugin code (after ctx is built from the granted vector)
const res = await ctx.net.fetch({ url: 'https://api.spotify.com/v1/me' });
```

### Reverse-DNS ids

Every capability id follows reverse-DNS so third-party plugins can ship
their own capabilities without clashing with built-ins:

| Origin                | Id pattern                       | ctxPath default     |
|-----------------------|----------------------------------|---------------------|
| Brika built-in        | `dev.brika.<family>.<verb>`      | `<family>.<verb>`   |
| Third-party plugin    | `com.acme.<family>.<verb>`       | `<family>.<verb>`   |

The `ctxPath` default strips the first two reverse-DNS segments. If two
third-party capabilities want different ctx subtrees, they override
`ctxPath` explicitly (e.g. `ctxPath: 'acme.crypto.sign'`).

### Plugin manifest format

Plugins declare capabilities in `package.json` as a map keyed by
capability id, with the requested scope as the value:

```json
{
  "name": "@brika/plugin-weather",
  "capabilities": {
    "dev.brika.location.get": {},
    "dev.brika.location.timezone": {},
    "dev.brika.net.fetch": { "allow": ["api.open-meteo.com"] }
  }
}
```

The legacy `permissions: ["net", "secrets"]` array is no longer accepted —
the schema rejects it at verify-plugin time.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Plugin process                                                          │
│                                                                         │
│   globalThis.__brika_caps : CapabilityVector  (frozen + branded)        │
│                                                                         │
│   ctx (built from vector + channel)                                     │
│      └─ Proxy traversal: ctx.foo.bar(args)                              │
│            ├─ id NOT in vector  → Promise.reject(PermissionDeniedError) │
│            └─ id in vector      → channel.call(capabilityRequest, ...)  │
│                                       │                                 │
│   <plugin code>                       │                                 │
└───────────────────────────────────────┼─────────────────────────────────┘
                                        │ IPC (binary frames)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Hub                                                                     │
│   PluginProcess#capabilityRequest handler                               │
│      ├─ vectorForLegacyGrants(reg, grantedPermissions)                  │
│      ├─ vector.grants.find(id) → grant or PERMISSION_DENIED RpcError    │
│      └─ registry.dispatch(id, args, handlerCtx)                         │
│            ├─ args Zod-validated against spec.args                      │
│            ├─ handler runs (closes over PluginProcess callbacks)        │
│            └─ result Zod-validated against spec.result                  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Five things move atomically when you add a capability**:

1. **One spec file** in `packages/sdk/src/capabilities/<name>.ts` —
   - `defineCapability({ id, args, result, permission?, description? }, placeholderHandler)`
   - `declare module '../ctx' { interface Ctx { <name>: { ... } } }` augments the typed surface

2. **One handler file** in `apps/hub/src/runtime/plugins/capabilities/<name>.ts` —
   - A `XyzCallbacks` interface listing the per-PluginProcess hooks the handler needs
   - A `buildXyzCapabilities(cb)` factory returning `defineCapability(spec.spec, realHandler)[]`

3. **Two registry wirings** —
   - Re-export the spec from `packages/sdk/src/capabilities/index.ts`
   - Register the handler array in `apps/hub/src/runtime/plugins/capabilities/registry-factory.ts`

4. **A permission entry** (if gated) in `packages/permissions/src/index.ts` — one line, just the icon. The grant scope schema lives with the capability spec, not here.

5. **A test file** in `apps/hub/src/runtime/plugins/capabilities/__tests__/<name>.test.ts` — dispatch happy path + at least one `INVALID_INPUT`.

Nothing else changes. No `@brika/sdk/bridge.ts` interface edit. No `prelude/<name>.ts` setup module. No `@brika/sdk/api/<name>.ts` rewrap.

## Wire shape

A single RPC carries every capability call across the wire:

```ts
// @brika/ipc/contract/capabilities.ts
export const capabilityRequest = rpc(
  'capability.request',
  z.object({ id: z.string(), args: Json }),   // unknown — registry validates
  z.object({ result: Json }),                  // unknown — registry validates
);

export const getCapabilityVector = rpc(
  'capability.vector.get',
  z.object({}),
  z.object({ grants: z.array(z.object({ id: z.string(), scope: Json.optional() })) }),
);
```

`capability.request` is the only RPC the SDK ever sends for a ctx call.
`getCapabilityVector` is called once at startup — see flow below.

## Vector lifecycle

```
1. Plugin spawned (Bun child process)
2. Prelude (apps/hub/src/runtime/plugins/prelude/index.ts) runs
     a. Channel + handlers wired
     b. channel.send(hello)
     c. const vector = await channel.call(getCapabilityVector, {})
     d. installVector(vector)  — Object.defineProperty on globalThis,
                                 writable:false, configurable:false,
                                 branded with Symbol.for('brika.caps.brand')
     e. channel.send(ready)
3. Plugin code runs, reads __brika_caps via readInjectedVector
4. ctx = buildCtx(vector, channel)  — Proxy that lookups vector on each call
5. <plugin code uses ctx...>
6. On shutdown: stop message → onStop handlers → process.exit
```

The vector is **immutable per process lifetime** today. A future T2 iteration
will let the hub push vector updates via an event so users can hot-revoke a
permission; the contract above doesn't change for that, only the prelude
adds a `capability.vector.update` event listener.

## Error model

Every error in the platform extends `BrikaError` — one base class with
`code`, `data`, and an ES2022 `cause` chain that round-trips across IPC.

| Where | Class & code | Meaning |
|---|---|---|
| SDK (Proxy.apply) | `PermissionDeniedError` (`'PERMISSION_DENIED'`) | Capability id not in vector — no IPC. |
| Hub (capabilityRequest) | `RpcError('PERMISSION_DENIED', ...)` | Vector lookup failed at the hub — defense in depth. |
| Registry.dispatch | `CapabilityError('INVALID_INPUT')` | Args failed `spec.args.safeParse`. `cause` is the underlying `ZodError`. |
| Registry.dispatch | `CapabilityError('INTERNAL')` | The handler raised. `cause` is the original throw (Error, string, or any value). |
| Registry.dispatch | `CapabilityError('INVALID_OUTPUT')` | Handler returned a value that fails `spec.result.safeParse` — programmer error in the hub. `cause` is the underlying `ZodError`. |
| Registry.dispatch | `CapabilityError('INVALID_SCOPE')` | Granted scope value failed the spec's scope schema — reserved for future use, currently filtered at `buildVector`. |
| Registry.dispatch | `CapabilityError('NOT_REGISTERED')` | Dispatched against an id the hub hasn't registered — usually means a typo or an out-of-date plugin. |

Plugin code sees these as rejected promises. `instanceof BrikaError`
matches all of them; specific subclasses (`PermissionDeniedError`,
`NotFoundError`, `InvalidInputError`, `InternalError`, `TimeoutError`)
narrow further on the SDK side.

## Currently-registered capabilities

| Family    | Capability ids                                                                                | ctxPath                                              | Scope shape |
|-----------|-----------------------------------------------------------------------------------------------|------------------------------------------------------|---|
| `net`     | `dev.brika.net.fetch`                                                                         | `net.fetch`                                          | `{ allow: string[] }` — host patterns (literal or `*.suffix`) |
| `secrets` | `dev.brika.secrets.get` / `set` / `delete`                                                    | `secrets.get` / `set` / `delete`                     | `{}` (per-plugin isolation by `pluginName` closure) |
| `fs`      | `dev.brika.fs.read` / `write` / `exists`                                                      | `fs.read` / `write` / `exists`                       | `{ allow: string[] }` — absolute path prefixes |
| `exec`    | `dev.brika.exec.spawn`                                                                        | `exec.spawn`                                         | `{ allowBinaries: string[] }` — bare names or absolute paths |
| `location`| `dev.brika.location.get` / `timezone`                                                         | `location.get` / `timezone`                          | `{}` |
| `sparks`  | `dev.brika.sparks.register` / `emit` / `subscribe` / `unsubscribe`                            | `sparks.*`                                           | `{}` |
| `blocks`  | `dev.brika.blocks.register` / `emit` / `log`                                                  | `blocks.*`                                           | `{}` |
| `bricks`  | `dev.brika.bricks.registerType` / `pushData`                                                  | `bricks.*`                                           | `{}` |
| `routes`  | `dev.brika.routes.register`                                                                   | `routes.register`                                    | `{}` |
| `actions` | `dev.brika.actions.register`                                                                  | `actions.register`                                   | `{}` |
| `prefs`   | `dev.brika.prefs.set`                                                                         | `prefs.set`                                          | `{}` |

The empty-scope families are migration placeholders. Each will gain a scope
schema as the corresponding manifest format evolves — for instance, secrets
will scope by key namespace once the manifest carries
`"dev.brika.secrets.get": { "namespaces": ["spotify"] }`.

The empty-scope families are migration placeholders. Each will gain a scope
schema as the corresponding manifest format evolves — for instance, secrets
will scope by key namespace once the manifest carries
`"secrets": { "namespaces": ["spotify"] }`.

## Adding a capability — worked example

We want `ctx.tts.speak(text)`.

```bash
$ touch packages/sdk/src/capabilities/tts.ts
$ touch apps/hub/src/runtime/plugins/capabilities/tts.ts
$ touch apps/hub/src/runtime/plugins/capabilities/__tests__/tts.test.ts
```

`packages/sdk/src/capabilities/tts.ts`:

```ts
import { defineCapability } from '@brika/capabilities';
import { z } from 'zod';

export const ttsSpeak = defineCapability(
  {
    id: 'dev.brika.tts.speak',
    ctxPath: 'tts.speak',
    args: z.object({ text: z.string(), voice: z.string().optional() }),
    result: z.object({ durationMs: z.number() }),
    permission: { name: 'tts', scope: z.object({}), defaultScope: {}, icon: 'volume-2' },
    description: 'Synthesize speech and play it on the hub host',
  },
  () => { throw new Error('not registered'); },
);

declare module '../ctx' {
  interface Ctx {
    tts: { speak(args: { text: string; voice?: string }): Promise<{ durationMs: number }> };
  }
}
```

`apps/hub/src/runtime/plugins/capabilities/tts.ts`:

```ts
import { defineCapability } from '@brika/capabilities';
import { ttsSpeak as spec } from '@brika/sdk/capabilities';

export interface TtsCallbacks {
  speak(text: string, voice: string | undefined): Promise<{ durationMs: number }>;
}

export function buildTtsCapabilities(cb: TtsCallbacks) {
  return [defineCapability(spec.spec, (_, args) => cb.speak(args.text, args.voice))];
}
```

Wire-up:

```diff
 // packages/sdk/src/capabilities/index.ts
+export { ttsSpeak } from './tts';

 // apps/hub/src/runtime/plugins/capabilities/registry-factory.ts
+import { buildTtsCapabilities, type TtsCallbacks } from './tts';
 export interface HubCapabilityCallbacks
-  extends LocationCallbacks, ... {}
+  extends LocationCallbacks, ..., TtsCallbacks {}
 // ... inside buildHubCapabilities:
+for (const cap of buildTtsCapabilities(cb)) reg.register(cap);

 // packages/permissions/src/index.ts
   createRegistry({
     ...
+    tts: { icon: 'volume-2' },
   });
```

```diff
 // apps/hub/src/runtime/plugins/plugin-process.ts (inside #getCapabilityRegistry)
+speak: (text, voice) => this.ttsService.synthesize(text, voice),
```

Done. The plugin author writes `await ctx.tts.speak({ text: 'hello' })` and
gets typed `{ durationMs: number }` back.

## Why one Proxy instead of N hand-rolled methods

The earlier `PreludeBridge` had `start()`, `log()`, `getManifest()`,
`onInit()`, `registerAction()`, etc. — 22 methods. Adding `tts.speak` would
have meant editing:

1. `packages/sdk/src/bridge.ts` — interface
2. `packages/sdk/src/api/tts.ts` — new file
3. `packages/sdk/src/context/tts.ts` — new file
4. `packages/sdk/src/index.ts` — re-export
5. `apps/hub/src/runtime/plugins/prelude/tts.ts` — setup module
6. `apps/hub/src/runtime/plugins/prelude/index.ts` — spread the new setup
7. `apps/hub/src/runtime/plugins/plugin-process.ts` — `channel.implement(tts...)` blocks

Now: 3 files, 2 wire-up edits. No bridge interface. No prelude domain module.
And every capability's args/result/scope are validated by Zod on both ends —
versus the bridge interface, which only had TypeScript-level type safety
(silently broken if SDK + hub versions drift).
