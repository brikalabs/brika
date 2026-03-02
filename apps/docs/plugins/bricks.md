# Bricks

Bricks are dashboard UI components provided by plugins. Each brick renders as a resizable card on the dashboard, adapts to its grid size, and reacts to data pushed from the plugin process.

Bricks are **client-rendered** — they run as real React components in the browser. The plugin process fetches data and pushes it to all connected clients via `setBrickData()`. The browser receives the data through `useBrickData()` and renders standard React JSX.

## Quick Start

Three steps to create a brick:

**1. Declare in `package.json`**

```json
{
  "bricks": [
    { "id": "hello", "name": "Hello", "icon": "hand" }
  ]
}
```

**2. Create the client component**

```tsx
// src/bricks/hello.tsx
import { useBrickData, useBrickConfig, useBrickSize } from '@brika/sdk/brick-views';

interface HelloData {
  message: string;
  count: number;
}

export default function Hello() {
  const data = useBrickData<HelloData>();
  const config = useBrickConfig();
  const { width } = useBrickSize();

  if (!data) return <div className="p-4 text-muted-foreground">Loading...</div>;

  return (
    <div className="flex flex-col gap-2 p-3">
      <span className="text-lg font-bold">{data.message}</span>
      <span className="text-sm text-muted-foreground">Count: {data.count}</span>
    </div>
  );
}
```

**3. Push data from the plugin process**

```tsx
// src/index.tsx
import { setBrickData, onInit, onStop, log } from '@brika/sdk';

let count = 0;
let timer: Timer | null = null;

onInit(() => {
  timer = setInterval(() => {
    count++;
    setBrickData('hello', { message: 'Hello!', count });
  }, 1000);
});

onStop(() => {
  if (timer) clearInterval(timer);
});

log.info('Plugin loaded');
```

## How It Works

The brick system has two halves:

- **Plugin process** (server) — Fetches data, manages state, pushes updates via `setBrickData()`
- **Brick component** (browser) — Real React component that reads data via `useBrickData()`

```
Plugin Process           Hub              Browser
      |                   |                  |
 setBrickData() ───> BrickDataStore ───> useBrickData()
                         |
                         |
           onBrickConfigChange() <─── user edits config
```

Each brick type has:
- **Manifest entry** — static metadata in `package.json` (id, icon, config schema)
- **Client component** — a `.tsx` file in `src/bricks/` that renders in the browser
- **Server logic** — code in the plugin entry point that pushes data to clients

Placing the same brick type twice creates two instances that share the same pushed data but have independent per-instance config.

### JSX Setup

Bricks use standard React JSX. Set `jsxImportSource` to `react` in your `tsconfig.json`:

```json
{
  "extends": "@brika/sdk/tsconfig.plugin.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

Brick `.tsx` files are compiled to browser ESM by `@brika/compiler`. Shared dependencies (React, lucide-react, class-variance-authority, clsx) are provided by the host app via `globalThis.__brika` — don't bundle them yourself.

## Brick Manifest

Declare bricks in `package.json`:

```json
{
  "bricks": [
    {
      "id": "my-brick",
      "name": "My Brick",
      "description": "A brief description",
      "category": "info",
      "icon": "thermometer",
      "color": "#ef4444",
      "config": [
        { "type": "text", "name": "city", "label": "City" },
        { "type": "number", "name": "interval", "default": 5000, "min": 1000 },
        { "type": "checkbox", "name": "autoRefresh", "default": true },
        { "type": "dropdown", "name": "unit", "options": [{"value": "celsius"}, {"value": "fahrenheit"}] }
      ]
    }
  ]
}
```

The `id` must match the filename in `src/bricks/` — a brick with `"id": "compact"` expects `src/bricks/compact.tsx`.

### Config Types

| Type | Value type | Extra props |
|------|-----------|-------------|
| `text` | `string` | `default?` |
| `number` | `number` | `default?`, `min?`, `max?`, `step?` |
| `checkbox` | `boolean` | `default?` |
| `dropdown` | `string` | `default?`, `options` |

## Client-Side Hooks

Import from `@brika/sdk/brick-views`. These hooks are only available in client-rendered brick components.

### useBrickData

Subscribe to data pushed from the plugin process via `setBrickData()`. Returns `undefined` until data arrives.

```tsx
const data = useBrickData<MyDataType>();

if (!data) return <LoadingSpinner />;
return <div>{data.value}</div>;
```

### useBrickConfig

Read the per-instance configuration for this brick (set by user in the config sheet).

```tsx
const config = useBrickConfig();
const city = typeof config.city === 'string' ? config.city : 'Default';
```

Returns `Record<string, unknown>` — narrow field types yourself.

### useBrickSize

Returns the current grid dimensions. Updates on resize without unmounting.

```tsx
const { width, height } = useBrickSize();
```

### useCallBrickAction

Returns a stable callback to send an action to the plugin process for the current brick instance.

```tsx
const callAction = useCallBrickAction();

<button onClick={() => callAction('refresh')}>Refresh</button>
```

## Server-Side APIs

Import from `@brika/sdk` or `@brika/sdk/lifecycle`. These run in the plugin process (Bun).

### setBrickData

Push data to all client-rendered instances of a brick type.

```tsx
import { setBrickData } from '@brika/sdk';

setBrickData('compact', { temperature: 21, city: 'Zurich' });
```

Data becomes available in the browser via `useBrickData<T>()`. Call this whenever your data changes — all connected clients update automatically.

### onBrickConfigChange

React to per-instance config changes. Called when a user edits a brick instance's settings on the board.

```tsx
import { onBrickConfigChange } from '@brika/sdk';

onBrickConfigChange((instanceId, config) => {
  if (typeof config.city === 'string') {
    ensurePolling(config.city);
  }
});
```

### defineSharedStore

Zustand-style reactive store for sharing state within the plugin process:

```tsx
import { defineSharedStore } from '@brika/sdk';

const weatherStore = defineSharedStore<WeatherData | null>(null);

// Read
const current = weatherStore.get();

// Write (notifies all subscribers)
weatherStore.set({ temperature: 21 });
weatherStore.set(prev => ({ ...prev, temperature: 22 }));

// Subscribe to changes
const unsub = weatherStore.subscribe(() => {
  const data = weatherStore.get();
  setBrickData('compact', formatForCompact(data));
});
```

| Method | Description |
|--------|-------------|
| `store.get()` | Read current state synchronously |
| `store.set(value)` | Update state, notify subscribers (`Object.is` comparison) |
| `store.subscribe(fn)` | Subscribe to changes. Returns unsubscribe function |

## Responsive Design

Use `useBrickSize()` to adapt layout based on grid dimensions:

```tsx
import { useBrickData, useBrickSize } from '@brika/sdk/brick-views';

export default function MyBrick() {
  const data = useBrickData<MyData>();
  const { width, height } = useBrickSize();

  if (!data) return <div>Loading...</div>;

  if (width <= 2) {
    return <CompactView data={data} />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Header data={data} />
      {height >= 4 && <DetailChart data={data.history} />}
    </div>
  );
}
```

Gate content by both width and height. Detailed views need larger sizes — keep compact variants for small grid slots.

## Actions

Actions let brick components call server-side functions in the plugin process. Action IDs are auto-generated at build time — developers never type or see the ID.

### Define actions (server-side)

```ts
// src/actions.ts
import { defineAction } from '@brika/sdk/actions';

export const refresh = defineAction(async () => {
  return fetchLatestData();
});

export const toggle = defineAction(async (input: { deviceId: string }) => {
  return toggleDevice(input.deviceId);
});
```

### Call actions from pages (browser)

```tsx
// src/pages/devices.tsx
import { useAction, useCallAction } from '@brika/sdk/ui-kit/hooks';
import { getDevices, scan } from '../actions';

export default function DevicesPage() {
  const callAction = useCallAction();
  const { data, loading, refetch } = useAction(getDevices);

  return <button onClick={() => callAction(scan).then(refetch)}>Scan</button>;
}
```

### Call actions from bricks (browser)

Bricks use `useCallBrickAction()` to send actions scoped to their instance:

```tsx
import { useBrickData, useCallBrickAction } from '@brika/sdk/brick-views';

export default function DeviceBrick() {
  const data = useBrickData<DeviceData>();
  const callAction = useCallBrickAction();

  return (
    <button onClick={() => callAction('toggle', { deviceId: data?.id })}>
      Toggle
    </button>
  );
}
```

## Pattern: Single Poller, Many Consumers

When multiple brick instances share the same data source, poll once and push to all:

```tsx
// src/index.tsx
import { defineSharedStore, setBrickData, onInit, onStop } from '@brika/sdk';

const useData = defineSharedStore<Data | null>(null);
let timer: Timer | null = null;

onInit(() => {
  timer = setInterval(async () => {
    useData.set(await fetchData());
  }, 5000);
});

// Push to all client bricks whenever data changes
useData.subscribe(() => {
  const data = useData.get();
  if (data) {
    setBrickData('my-brick', formatData(data));
  }
});

onStop(() => {
  if (timer) clearInterval(timer);
});
```

## Pattern: Per-Instance Config

When each brick instance has its own configuration (e.g., a different city for a weather brick):

```tsx
// src/index.tsx
import { setBrickData, onBrickConfigChange } from '@brika/sdk';

const instanceConfigs = new Map<string, string>();

onBrickConfigChange((instanceId, config) => {
  const city = typeof config.city === 'string' ? config.city : 'Default';
  instanceConfigs.set(instanceId, city);
  ensurePolling(city);
});
```

All instances of a brick type receive the same data from `setBrickData()`. The client component reads `useBrickConfig()` to select the relevant slice:

```tsx
// src/bricks/weather.tsx
import { useBrickData, useBrickConfig } from '@brika/sdk/brick-views';

export default function WeatherBrick() {
  const data = useBrickData<{ cities: Record<string, CityData> }>();
  const config = useBrickConfig();
  const city = typeof config.city === 'string' ? config.city : 'Default';

  if (!data) return <div>Loading...</div>;
  const cityData = data.cities[city];
  if (!cityData) return <div>No data for {city}</div>;

  return <div>{cityData.temperature}°C</div>;
}
```

## Build Pipeline

Brick `.tsx` files are compiled by `@brika/compiler` using `Bun.build()`:

1. **Externals plugin** — Replaces shared imports (React, lucide-react, UI kit) with `globalThis.__brika` proxies
2. **Actions plugin** — Replaces action imports with `{ __actionId }` stubs for browser use
3. **Tailwind compilation** — Extracts class names from the compiled JS and generates scoped CSS
4. **Output** — ESM module served at `/api/bricks/{brickTypeId}/module.js?hash=...`
5. **Caching** — Content hash in filename means cache hit check is instant

The compiler validates at build time that every brick declared in `package.json` has a matching `src/bricks/{id}.tsx` file.

### Tailwind CSS

Brick components use Tailwind CSS classes (e.g., `className="flex gap-2 p-3"`). The hub compiles these at build time using Tailwind v4's programmatic API:

1. **Candidate extraction** — The compiled JS is scanned for string literals to find Tailwind class candidates
2. **CSS generation** — Tailwind's `compile()` + `build()` produces the matching utility CSS
3. **Theme stripping** — `:root` variables and `@layer properties` are removed since the host app already provides them
4. **Scoping** — CSS is wrapped in `@scope ([data-brika-scope="<id>"])` so rules only apply inside that brick's container
5. **Output** — Minified CSS served alongside the ESM module

This means brick components get full Tailwind support without shipping duplicate theme variables or conflicting with the host app's styles. The custom theme from `@brika/ui-kit/tailwind-theme.css` is included, so brick components can use the same design tokens as the rest of the UI.

## Next Steps

- [Reactive Blocks](reactive-blocks.md) — Workflow block definitions
- [Lifecycle Hooks](lifecycle-hooks.md) — Plugin lifecycle management
- [Preferences](../api-reference/preferences.md) — Plugin-level configuration
