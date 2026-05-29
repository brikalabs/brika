# Storage

Plugins get a private `data/` directory under `.brika/plugins/<uid>/data/` for persistent storage. Use the storage API to read and write JSON files, get the raw directory path, or build a typed in-memory store backed by disk.

The storage API does **not** use IPC — every call reads or writes the local filesystem from the plugin process directly. No grant required (the directory is unconditionally yours).

## JSON helpers

```ts
import { readJSON, writeJSON, deleteJSON, exists, updateJSON } from '@brika/sdk';

await writeJSON('config', { version: 1, nodes: [] });

const config = await readJSON<{ version: number; nodes: string[] }>('config');
//   ^ { version: number; nodes: string[] } | null

await updateJSON('config', (c) => ({ ...c, nodes: [...c.nodes, 'new'] }), { version: 1, nodes: [] });

if (await exists('config')) {
  await deleteJSON('config');
}
```

* Keys must match `^[\w.\-/]+$` (alphanumerics, hyphens, underscores, dots, slashes). Path traversal (`..`) is rejected.
* `readJSON` returns `null` if the file doesn't exist or contains invalid JSON.
* `writeJSON` creates parent directories as needed — `writeJSON('matter/fabric', …)` lands at `data/matter/fabric.json`.
* `updateJSON(key, updater, defaultValue)` reads, runs `updater(current)`, and writes back.

## Raw directory path

For libraries that manage their own files (SQLite, matter.js node storage, image caches), get the directory and hand it over:

```ts
import { getDataDir } from '@brika/sdk';

const dir = getDataDir();  // /Users/you/.brika/plugins/<uid>/data
const db = new Database(`${dir}/state.sqlite`);
```

`getDataDir` creates the directory if it doesn't exist.

## Typed in-memory store with disk persistence

`defineStore` wraps a JSON file with an in-memory cache. Use it when you need synchronous reads but persistence across restarts:

```ts
import { defineStore, onInit } from '@brika/sdk';

interface DeviceState { list: string[] }

const devices = defineStore<DeviceState>('devices', { list: [] });

onInit(async () => {
  await devices.load();        // read from disk into memory
  console.log(devices.get());  // synchronous after load
});

// later — update and persist
await devices.update((s) => ({ ...s, list: [...s.list, 'new-node'] }));
```

The contract:

```ts
interface Store<T> {
  load(): Promise<void>;
  get(): T;                                  // throws if not loaded
  set(value: T): Promise<void>;
  update(fn: (prev: T) => T): Promise<void>;
  clear(): Promise<void>;
}
```

You must call `load()` once before reading — typically inside `onInit`. After that, `get()` is synchronous and `set`/`update` write through to disk.

## Wiping data

```ts
import { clearAllData, onUninstall } from '@brika/sdk';

onUninstall(() => {
  clearAllData();  // removes the whole data/ directory
});
```

Call this from `onUninstall` so users get a clean removal.

## Limits

* The storage helpers expect small-to-medium JSON files. For large binary blobs, use `getDataDir()` and `Bun.write` directly.
* There is no built-in concurrency control. If two callers race a `readJSON` → `writeJSON` cycle, the last writer wins. Use `updateJSON` (which serialises read + write internally is **not** atomic across processes either, but is atomic within one call). For true concurrent safety, serialise writes yourself.

## See also

* **[Secrets](secrets.md)** — for credentials that shouldn't live on disk in plaintext.
* **[Shared Stores](shared-stores.md)** — in-memory-only equivalent.
* **[Lifecycle](lifecycle.md)** — when to call `load()` and `clearAllData()`.
