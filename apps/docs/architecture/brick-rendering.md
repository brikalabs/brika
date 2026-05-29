# Brick Rendering

A brick is a React component bundled separately from the host UI. This page covers what happens when the host UI mounts a brick on a board: the dynamic import, the context wrap, the brick-side hooks, and the error boundary.

Key files:

* `apps/ui/src/features/boards/components/ClientBrickView.tsx` — the renderer.
* `apps/ui/src/features/plugins/components/plugin-bridge.ts` — global setup.
* `apps/ui/src/features/plugins/components/plugin-context.ts` — React context for plugin metadata.
* `apps/ui/src/features/plugins/components/use-module-import.ts` — dynamic import hook.
* `apps/ui/src/features/boards/components/BrickViewContext.tsx` — instance-scoped context.
* `apps/ui/src/features/plugins/components/brick-view-hooks.ts` — the four brick hooks (`useBrickData`, `useBrickConfig`, `useBrickSize`, `useCallBrickAction`).

## The flow

```
Board page loads
       │
       ▼
For each brick on the board:
       │
       ▼
 Resolve brickType.moduleUrl (e.g. /api/bricks/modules/coingecko/current-price.<hash>.js)
       │
       ▼
 useModuleImport(url)
   1. Import side-effects from plugin-bridge.ts (populates globalThis.__brika)
   2. Dynamic import(url)
   3. Return the default export
       │
       ▼
 Wrap with <PluginContext value={{ uid, namespace }}>
       │
       ▼
 Wrap with <BrickViewContext value={{ instanceId, brickTypeId, pluginName, config, size }}>
       │
       ▼
 <ErrorBoundary>
   <BrickComponent />
 </ErrorBoundary>
```

## `plugin-bridge.ts`

```ts
// runs once, at top level
await ensureBridgeReady();
globalThis.__brika ??= {
  React, jsx, hooks, brickHooks, icons, ui, cva, clsx,
};
```

* `ensureBridgeReady` lazy-loads heavy dependencies on first use.
* The `??=` makes it idempotent — re-imports do not double-populate.
* `jsxDEV` wraps `jsxs`/`jsx` so bricks compiled against either jsx-runtime variant work.

`useModuleImport` imports this module as a side effect *before* doing the dynamic `import(brickUrl)`. The browser's module graph guarantees that whatever the brick references on `globalThis.__brika.*` is populated first.

## `PluginContext`

Carries the plugin's UID and namespace. Bricks read it through:

```tsx
const uid = usePluginUid();              // 'coingecko.plugin-coingecko'
const url = usePluginRouteUrl('/status') // '/api/plugins/coingecko.plugin-coingecko/routes/status'
```

These hooks live in `@brika/sdk/ui-kit/hooks` and resolve to `useContext(PluginContext)` at runtime.

## `BrickViewContext`

Carries per-instance state:

```ts
interface BrickViewContextValue {
  instanceId: string;
  brickTypeId: string;
  pluginName: string;
  config: Record<string, unknown>;
  size: { width: number; height: number };
}
```

The four `@brika/sdk/brick-views` hooks read this context:

| Hook | Returns |
|---|---|
| `useBrickData<T>()` | The latest `pushBrickData` payload for `brickTypeId`, via SSE |
| `useBrickConfig()` | `ctx.config` |
| `useBrickSize()` | `ctx.size` |
| `useCallBrickAction()` | A stable callback that POSTs to `/api/bricks/instances/<instanceId>/action` |

## Live brick data

`useBrickData` subscribes to the brick data store via the [shared SSE pool](sse-pool.md). The pool dedupes connections per URL so one `EventSource` to `/api/boards/<id>/sse` serves every brick on the board.

When the plugin process calls `setBrickData('current-price', payload)`:

1. The SDK sends `pushBrickData { brickTypeId, data }` over IPC.
2. The hub stores the payload in `BrickDataStore`.
3. The hub emits a board-scoped SSE event to every connected browser.
4. The browser's pool fans the event out to every `useBrickData` subscriber for that brick type.
5. React schedules a re-render.

The payload is the same for every instance of the brick type. For per-instance state, key the payload by `instanceId` (see [Bricks](../plugins/bricks.md)).

## Calling actions from a brick

```tsx
const callBrickAction = useCallBrickAction();
callBrickAction('refresh', { force: true });
```

The hook POSTs to `/api/bricks/instances/<instanceId>/action` with `{ actionId, payload }`. The hub forwards `brickInstanceAction { instanceId, brickTypeId, actionId, payload }` to the owning plugin via IPC. The plugin has registered an instance action handler (typically via `onBrickConfigChange` plus a small dispatcher of its own) and runs it.

Brick actions are simpler than `defineAction`'s typed RPCs — they're keyed by string IDs and have no return value. Use them for "user clicked refresh" type interactions. Use `defineAction` when you need a typed RPC with a return value, page-side `useAction`, etc.

## Error boundary

The brick renders inside an error boundary. If the dynamic import fails, or the brick throws during render, the boundary swaps in:

```
⚠ Failed to load brick
```

The error is logged to the browser console with the brick type and instance ID. The rest of the board keeps working.

## Loading state

The host shows a tiny skeleton while the dynamic import is in flight. Plugins should also handle "data not arrived yet" inside their components:

```tsx
const data = useBrickData<MyData>();
if (!data) return <div>Loading…</div>;
```

`useBrickData` is `undefined` until the first push.

## See also

* **[Externals Rewrite](externals-rewrite.md)** — the bridge the brick relies on.
* **[Shared SSE Pool](sse-pool.md)** — the SSE plumbing for brick data.
* **[Compiler](compiler.md)** — how the brick bundle was built.
* **[Bricks](../plugins/bricks.md)** — author's view.
