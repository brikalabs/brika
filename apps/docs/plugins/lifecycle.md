# Lifecycle

Three hooks let your plugin react to startup, shutdown, and uninstall events. They're all from `@brika/sdk`:

```ts
import { onInit, onStop, onUninstall } from '@brika/sdk';
```

Each takes a callback and returns an unsubscribe function (rarely needed — the registration is process-scoped).

## The order

```
Plugin process spawned
       │
       ▼
Module body runs (defineReactiveBlock, defineSpark, defineAction, …)
       │
       ▼
Hub sends preferences via IPC
       │
       ▼
─── onInit ───
       │
       ▼
Plugin runs normally — blocks start, sparks emit, actions fire
       │
       ▼ (on uninstall command)
─── onUninstall ───
       │
       ▼
─── onStop ───
       │
       ▼
Process exits
```

`onUninstall` always runs **before** `onStop` when the plugin is being permanently removed. On a regular hub shutdown only `onStop` runs.

## `onInit`

Runs once when the plugin is fully initialised (preferences delivered, IPC handshake complete). Use it for one-shot work that requires preferences or hub state:

```ts
import { onInit, getPreferences, log } from '@brika/sdk';

onInit(async () => {
  const prefs = getPreferences<{ apiKey: string }>();
  await api.connect(prefs.apiKey);
  log.info('Coingecko connected');
});
```

If the plugin has *already* initialised by the time you register the handler (a late-registered hook), it runs immediately. The runtime guarantees `onInit` fires exactly once per process.

## `onStop`

Runs when the plugin is shutting down — graceful hub stop, plugin restart, plugin disable. Use it for cleanup:

```ts
import { onStop, log } from '@brika/sdk';

onStop(() => {
  api.disconnect();
  log.info('Coingecko disconnected');
});
```

The runtime gives the plugin a `killTimeoutMs` (default 3000 ms) grace period to finish `onStop` handlers before sending SIGKILL. Keep cleanup synchronous when possible.

Block-level cleanup (timers, subscriptions registered inside a block's setup function) happens automatically — you do not need to clean those up in `onStop`.

## `onUninstall`

Runs when the user removes the plugin entirely. This is the right place to:

* Delete persisted secrets (`deleteSecret`).
* Wipe plugin data (`clearAllData`).
* Revoke external tokens.
* Notify a third-party service that the integration has been removed.

```ts
import { onUninstall, clearAllData, deleteSecret, log } from '@brika/sdk';

onUninstall(async () => {
  await deleteSecret('api-token');
  clearAllData();
  log.info('Coingecko data wiped');
});
```

`onUninstall` runs before `onStop`. After both finish, the hub removes the plugin from `.brika/plugins/` and rewrites `brika.yml`.

A plugin can have multiple `onInit`/`onStop`/`onUninstall` handlers — every registered handler runs in registration order. This is useful for modular plugins where different files own different concerns.

## Async handlers

All three hooks accept `async` functions. The runtime awaits them. If a handler hangs forever, the killTimeout escalates to SIGKILL. Do not rely on `onStop`/`onUninstall` for anything that **must** complete — if you need durability, persist intent first and reconcile on next start.

## Module-level side effects vs `onInit`

The plugin's module body runs immediately on import — before preferences are delivered. **Do not put preference-dependent work there**. The pattern:

```ts
// ❌ runs too early — preferences not yet delivered
const prefs = getPreferences<{ apiKey: string }>();
api.connect(prefs.apiKey);

// ✅ runs after preferences are delivered
onInit(() => {
  const prefs = getPreferences<{ apiKey: string }>();
  api.connect(prefs.apiKey);
});
```

If a config-independent setup needs to happen at import time (registering blocks, defining sparks, defining actions), do that at module level. Anything that touches preferences, secrets, or location goes in `onInit`.

## See also

* **[Preferences](preferences.md)** — read and react to config changes.
* **[Plugin Supervisor](../architecture/plugin-supervisor.md)** — the kill/restart machinery.
