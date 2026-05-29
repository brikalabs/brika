# Shared Stores

`defineSharedStore` is a Zustand-style reactive state container scoped to the plugin process. Use it when multiple blocks (or blocks + lifecycle hooks) need to share state.

```ts
import { defineSharedStore } from '@brika/sdk';

interface DeviceState {
  online: boolean;
  lastSeen: number;
}

const devices = defineSharedStore<Record<string, DeviceState>>({});

// Read (synchronous)
const all = devices.get();

// Write — re-notifies subscribers if the value changed (Object.is check)
devices.set((prev) => ({
  ...prev,
  'living-room-light': { online: true, lastSeen: Date.now() },
}));

// Subscribe
const unsubscribe = devices.subscribe(() => {
  console.log('devices changed', devices.get());
});
```

## API

```ts
interface SharedStore<T> {
  get(): T;
  set(value: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
}
```

Notes:

* `set` accepts a value or a function. The function form receives the current state.
* The store uses `Object.is` to decide whether anything changed; equal values do not trigger notifications.
* `subscribe` returns an unsubscribe function.

The store is purely in-memory — it lives in the plugin process for the lifetime of the process. For persistence, use `defineStore` from [Storage](storage.md) which adds a JSON file behind the same shape.

## Patterns

### Memoising upstream state

If a block needs to know about state that was last computed by a different block, a shared store works well:

```ts
const lastTemperature = defineSharedStore<number | null>(null);

// Block A — measures temperature and writes to the store
({ inputs }) => {
  inputs.reading.on((temp) => lastTemperature.set(temp));
}

// Block B — uses the latest temperature when the user clicks a button
({ inputs, outputs }) => {
  inputs.trigger.on(() => {
    const t = lastTemperature.get();
    if (t !== null) outputs.report.emit(`Last temp: ${t}°C`);
  });
}
```

### Bridging plugin process to bricks

A shared store can be wired to a brick by subscribing and re-pushing:

```ts
import { setBrickData } from '@brika/sdk';

const devices = defineSharedStore<Device[]>([]);

devices.subscribe(() => setBrickData('device-list', devices.get()));
```

Every `set` triggers a re-push to the brick. The brick reads the data with `useBrickData<Device[]>()`.

## When not to use it

* **Across plugin processes** — shared stores are in-memory and per-process. Different plugins do not share state. Use [sparks](sparks.md) for cross-plugin events, or persist via [Storage](storage.md) and read from the other side.
* **For very large state** — every `set` walks the subscriber set. Keep stores small and focused; split by concern.

## See also

* **[Storage](storage.md)** — `defineStore` for persistent equivalents.
* **[Sparks](sparks.md)** — cross-plugin events.
* **[Reactive Engine](../architecture/reactive-engine.md)** — how subscriptions are scheduled.
