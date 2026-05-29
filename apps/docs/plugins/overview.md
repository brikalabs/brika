# Plugin Overview

A Brika plugin is an npm package that the hub loads into its own Bun subprocess. The plugin contributes some combination of **blocks**, **bricks**, **pages**, **sparks**, **actions**, and **HTTP routes**, all defined through the `@brika/sdk` API. Each plugin runs isolated — if it crashes, the supervisor restarts it without disturbing the rest of the hub.

This page gives you the lay of the land. The pages that follow drill into each capability.

## Anatomy of a plugin

```
my-plugin/
├── package.json          Manifest — declares the plugin's capabilities
├── icon.svg              Optional icon shown in the UI
├── src/
│   ├── index.tsx         Plugin entrypoint — exports blocks, registers lifecycle
│   ├── blocks/           One file per block (workflow nodes)
│   ├── bricks/           One file per brick (browser-rendered React components)
│   ├── pages/            One file per page (browser-rendered full-screen routes)
│   ├── sparks.ts         Typed event definitions
│   ├── actions.ts        Server-side RPCs callable from the UI
│   └── i18n/             Translation files (one JSON per locale)
└── locales/              Compiled translation bundles (built by i18n-dev)
```

`package.json` is the **manifest** — see [Manifest Reference](manifest.md). The arrays inside (`blocks`, `bricks`, `pages`, `sparks`, `permissions`) tell the hub what the plugin contributes. Everything in `src/` is plain TypeScript/TSX consumed by the [Compiler](../architecture/compiler.md) at install time.

## The `@brika/sdk` API surface

Everything a plugin author touches lives in `@brika/sdk` or its subpath exports. Here's the inventory.

### From `@brika/sdk` — runs in the plugin process

| Export | Page |
|---|---|
| `defineReactiveBlock`, `input`, `output` | [Reactive Blocks](reactive-blocks.md) |
| `map`, `filter`, `debounce`, `combine`, `zip`, `merge`, `switchMap`, … | [Reactive Streams](reactive-streams.md) |
| `interval`, `timer` (sources) | [Reactive Streams](reactive-streams.md) |
| `z` (custom Zod) | [Schema Types](schema-types.md) |
| `defineSpark`, `subscribeSpark` | [Sparks](sparks.md) |
| `onInit`, `onStop`, `onUninstall` | [Lifecycle](lifecycle.md) |
| `getPreferences`, `onPreferencesChange`, `setPreference`, `definePreferenceOptions` | [Preferences](preferences.md) |
| `setBrickData`, `onBrickConfigChange` | [Bricks](bricks.md) |
| `defineAction`, `binaryResponse`, `streamFile` | [Actions](actions.md) |
| `defineSharedStore` | [Shared Stores](shared-stores.md) |
| `defineRoute` | [HTTP Routes](routes.md) |
| `defineStore`, `readJSON`, `writeJSON`, `getDataDir` | [Storage](storage.md) |
| `getSecret`, `setSecret`, `deleteSecret` | [Secrets](secrets.md) |
| `getDeviceLocation` | [Location](location.md) |
| `defineOAuth` | [OAuth](oauth.md) |
| `log` | [Logging](logging.md) |
| `BrikaError`, `buildError`, `matchBrikaError`, `errors` | [Errors](../api/errors.md) |

### From `@brika/sdk/brick-views` — runs in the browser (bricks only)

| Export | Description |
|---|---|
| `useBrickData<T>()` | Subscribe to data the plugin pushed with `setBrickData` |
| `useBrickConfig()` | Read this brick instance's user-set config |
| `useBrickSize()` | Current grid size: `{ width, height }` |
| `useCallBrickAction()` | Invoke a per-instance action handler |

### From `@brika/sdk/ui-kit/hooks` — runs in the browser (bricks + pages)

| Export | Description |
|---|---|
| `useAction(ref)` | Fetch-on-mount RPC: `{ data, loading, error, refetch }` |
| `useCallAction()` | Stable callback to invoke an action |
| `useLocale()` | i18n: `.t(key)`, `.locale`, `.changeLocale()`, `.formatDate()`, … |
| `usePluginUid()` | Current plugin UID |
| `usePluginRouteUrl(path)` | Build `/api/plugins/:uid/routes/<path>` |

## Server vs browser, explained

This split confuses every plugin author at first. The rule:

* **`@brika/sdk` exports run in the plugin process** (a Bun subprocess on the hub machine). They can `fetch`, read the filesystem (through grants), open WebSockets, hold long-lived connections.
* **`@brika/sdk/brick-views` and `@brika/sdk/ui-kit/hooks` run in the browser** (a real React app). They cannot fetch the local filesystem; they talk to the plugin through the hub via SSE and HTTP.

If you call a server-only function from a brick — `defineRoute(…)` for example — the browser bundler will refuse to compile the file because the import resolves to a stub that throws.

## How the hub finds your stuff

1. The hub reads `package.json` and validates it against the [plugin schema](https://schema.brika.dev/plugin.schema.json) — a Zod schema published at build time.
2. For each entry in `blocks: [{ id }]` the hub expects an export with that ID from the plugin's main module after IPC `registerBlock` calls land.
3. For each entry in `bricks: [{ id }]` the hub expects a file at `src/bricks/<id>.tsx` exporting a default React component. The [compiler](../architecture/compiler.md) builds it on first request.
4. For each entry in `pages: [{ id }]` the hub expects a file at `src/pages/<id>.tsx` exporting a default React component.
5. For each entry in `sparks: [{ id }]` the hub expects a `defineSpark({ id, … })` call to land via the spark contract.
6. Actions are auto-discovered by the [server-side action compiler plugin](../architecture/compiler.md) — every export from a file that imports `@brika/sdk/actions` becomes an action with a deterministic ID.

If any of these are missing or mismatched, the plugin's health badge goes red and the error shows up in **Logs**.

## Lifecycle in brief

When the hub starts:

1. The supervisor spawns a Bun child for the plugin: `bun --bun src/index.tsx`.
2. The child imports `@brika/sdk` which establishes the IPC connection with the hub.
3. The plugin's module body runs. `defineReactiveBlock`, `defineSpark`, `defineAction`, `defineOAuth`, `setBrickData`, etc., all register themselves through the [context](../architecture/ipc-protocol.md).
4. The hub sends the plugin's preferences via IPC.
5. `onInit` handlers run.
6. The plugin is now *running* and the supervisor begins sending pings every `heartbeatInterval` ms.
7. When the hub wants the plugin to instantiate a block, it sends `startBlock { blockType, instanceId, workflowId, config }`. The plugin's compiled block runs its setup function.
8. On `onStop`, the plugin's cleanup handlers run and the process exits.
9. Crashes trigger the [restart policy](../architecture/plugin-supervisor.md) (exponential backoff + crash-loop detection).

## Permissions

Plugins declare the host capabilities they need in `package.json`:

```json
"permissions": ["net", "fs.read", "secrets", "location"]
```

The hub enforces these at IPC boundaries. A plugin without `"net"` cannot `fetch`; without `"secrets"` cannot read its credentials. See [Permissions](permissions.md).

## See also

* **[Build Your First Plugin](../tutorials/first-plugin.md)** — end-to-end walkthrough.
* **[Manifest Reference](manifest.md)** — every field of `package.json`.
* **[Reactive Blocks](reactive-blocks.md)** — the block-side API in detail.
* **[Architecture — Plugin Supervisor](../architecture/plugin-supervisor.md)** — how plugins are spawned and watched.
