# IPC Protocol

The hub talks to plugin processes over Bun's IPC channel using a typed message contract. This page covers the wire format, the contract structure, and how messages flow.

Key files:

* `packages/ipc/src/channel.ts` — typed channel (send/on/call/implement).
* `packages/ipc/src/host.ts` — `PluginChannel` (hub side: spawn, ping, kill).
* `packages/ipc/src/client.ts` — plugin side: reuses the prelude channel if loaded.
* `packages/ipc/src/define.ts` — `message(name, schema)` and `rpc(name, input, output)` factories.
* `packages/ipc/src/contract/*.ts` — all message definitions, one file per domain.

## Transport

Each plugin is a `Bun.spawn` child with `serialization: 'advanced'` and an `ipc` callback. Bun's "advanced" serialiser handles:

* All JSON-typeable values.
* `Date`, `Map`, `Set`.
* `Uint8Array` (and other typed arrays) — natively, no base64.
* Structured-clone semantics — circular references work.

This means a plugin can hand the hub a `Blob` of image bytes, a `Map<string, Uint8Array>` of sensor readings, or a `Date` parsed from a third-party API, and it arrives intact on the other side.

## Wire format

Every message is a `WireMessage`:

```ts
interface WireMessage {
  t: string;          // discriminator (e.g. "hello", "registerBlock")
  _id?: number;       // present on RPCs — request/response correlation
  [key: string]: unknown;
}
```

The discriminator `t` selects the handler. RPCs carry a numeric `_id`; the response carries the same `_id` plus an `ok` field and either `data` or `error`.

## Defining messages and RPCs

```ts
import { message, rpc } from '@brika/ipc/define';
import { z } from 'zod';

// One-way message
export const hello = message('hello', z.object({
  plugin: z.object({ id: z.string(), version: z.string() }),
}));

// Request/response RPC
export const startBlock = rpc(
  'startBlock',
  z.object({ blockType: z.string(), instanceId: z.string(), workflowId: z.string(), config: JsonRecord }),
  z.object({ ok: z.boolean(), error: z.string().optional() })
);
```

The factories produce typed `MessageDef` / `RpcDef` objects. The Channel API uses them to enforce types and validate payloads:

```ts
channel.send(hello, { plugin: { id: 'x', version: '1.0' } });
channel.on(hello, ({ plugin }) => console.log(plugin.id));

await channel.call(startBlock, { blockType: 'foo:bar', instanceId: '1', workflowId: 'w', config: {} });
channel.implement(startBlock, async ({ blockType }) => ({ ok: true }));
```

## The contracts

Each domain has a contract file in `packages/ipc/src/contract/`:

### Lifecycle (`lifecycle.ts`)

| Message / RPC | Direction | Purpose |
|---|---|---|
| `hello` | Plugin → Hub | Announce identity, version, requirements |
| `ready` | Plugin → Hub | Initialisation complete |
| `stop` | Hub → Plugin | Graceful shutdown signal |
| `uninstall` | Hub → Plugin | Run uninstall handlers |
| `preferences` | Hub → Plugin | Push current preferences |
| `updatePreference` | Plugin → Hub | Persist a preference change |
| `preferenceOptions` (RPC) | Hub → Plugin | Resolve dynamic-dropdown options |
| `fatal` | Plugin → Hub | Plugin-side fatal error reporting |

### Blocks (`blocks.ts`)

| Message / RPC | Direction | Purpose |
|---|---|---|
| `registerBlock` | Plugin → Hub | Register a block type |
| `startBlock` (RPC) | Hub → Plugin | Instantiate a block |
| `pushInput` | Hub → Plugin | Push data to a block's input port |
| `blockEmit` | Plugin → Hub | A block emitted on an output port |
| `blockLog` | Plugin → Hub | Log line scoped to a block instance |
| `stopBlock` | Hub → Plugin | Tear down a block instance |

### Bricks (`bricks.ts`)

| Message / RPC | Direction | Purpose |
|---|---|---|
| `registerBrickType` | Plugin → Hub | Register a brick type |
| `pushBrickData` | Plugin → Hub | `setBrickData` — payload to fan out to subscribers |
| `updateBrickConfig` | Hub → Plugin | Per-instance config changed |
| `brickInstanceAction` | Hub → Plugin | User clicked a brick-action button |

### Actions (`actions.ts`)

| Message / RPC | Direction | Purpose |
|---|---|---|
| `registerAction` | Plugin → Hub | Register an action ID |
| `callAction` (RPC) | Hub → Plugin | Invoke an action with input; response can be JSON, `bytes`, or `stream` envelope |

### Sparks (`sparks.ts`)

| Message / RPC | Direction | Purpose |
|---|---|---|
| `registerSpark` | Plugin → Hub | Register a spark with its schema |
| `emitSpark` | Plugin → Hub | Broadcast a spark |
| `subscribeSpark` | Plugin → Hub | Subscribe to a spark type |
| `unsubscribeSpark` | Plugin → Hub | Cancel subscription |
| `sparkEvent` | Hub → Plugin | Deliver a spark event |

### Grants (`grants.ts`)

| Message / RPC | Direction | Purpose |
|---|---|---|
| `grantRequest` (RPC) | Plugin → Hub | Execute a permission-gated operation |
| `getGrantVector` (RPC) | Plugin → Hub | Fetch the current permission vector |

### Routes (`routes.ts`)

| Message / RPC | Direction | Purpose |
|---|---|---|
| `registerRoute` | Plugin → Hub | Register an HTTP route |
| `routeRequest` (RPC) | Hub → Plugin | Deliver an HTTP request, get a response |

### Events (`events.ts`)

| Message | Direction | Purpose |
|---|---|---|
| `log` | Plugin → Hub | Structured log line |
| `ping` (RPC) | Hub → Plugin | Heartbeat |

### Other contracts

* `permissions.ts` — `getHubLocation`, `getHubTimezone`, `setTimezone`.
* `secrets.ts` — `getPluginSecret`, `setPluginSecret`, `deletePluginSecret`.
* `streams.ts` — push-based stream events from stateful grants.
* `theme.ts` — active theme broadcast.
* `tools.ts` — `registerTool`, `callTool` (tools system, used for AI integrations).

## RPC mechanics

* Default timeout: 30 s (configurable on the channel options).
* Each pending RPC tracks its `resolve`, `reject`, and timer.
* Errors come back as a `BrikaError` wire envelope (`{ _brikaError: true, code, message, data?, cause?, stack? }`). The channel detects it and reconstructs the error on the calling side.
* Timeouts reject with a generic timeout error.
* Channel close rejects every pending RPC.

## Validation

The channel validates message payloads against their Zod schemas on the receiving side. Validation failures are logged and the message is dropped. This protects the hub from a malformed plugin, and protects the plugin from a malformed hub — useful when developing.

In hot paths (`pushInput`, `blockEmit`), validation is intentionally cheap. The schemas are mostly structural (`Json`, `JsonRecord`); per-block-port schema validation happens in the SDK, not at the IPC layer.

## Stderr buffering

Plugin stderr is buffered (last 20 lines) so the hub can include it in crash error logs. The plugin's stdout is captured too but not buffered — it goes straight into the log stream.

## Why not just JSON?

Bun's "advanced" serialisation is faster and more capable than JSON for the IPC payloads Brika sees. Binary actions (thumbnails, file streams) would otherwise require base64 round-trips. Map/Set/Date support keeps the application-level types intact without the schema needing to deal with serialised representations.

## See also

* **[Plugin Supervisor](plugin-supervisor.md)** — how the channel is born.
* **[Permissions & Grants](permissions-grants.md)** — `grantRequest` dispatch.
* **[Errors](../api/errors.md)** — the error envelope shape.
