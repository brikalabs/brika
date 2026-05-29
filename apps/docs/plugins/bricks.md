# Bricks

A brick is a React component that renders on a Brika dashboard. It is **bundled separately from the host UI** and loaded on demand when the brick appears on a board. The plugin process pushes data to it via `setBrickData(brickId, data)`; the brick reads that data with `useBrickData()`.

This page is the brick author's reference. The mechanics — bundling, dynamic import, the `globalThis.__brika` bridge — live in [Brick Rendering](../architecture/brick-rendering.md) and [Externals Rewrite](../architecture/externals-rewrite.md).

## File layout

```
src/bricks/
  current-weather.tsx
  forecast.tsx
```

One file per brick. The filename (without extension) must match the `id` in the manifest:

```json
"bricks": [
  { "id": "current-weather", "name": "Current Weather", "category": "weather" }
]
```

Each file's **default export** is the React component. Re-exports or named exports are ignored.

## A minimal brick

```tsx
import { useBrickData } from '@brika/sdk/brick-views';

interface WeatherData {
  city: string;
  tempC: number;
  conditions: string;
}

export default function CurrentWeather() {
  const data = useBrickData<WeatherData>();
  if (!data) {
    return <div className="p-4 text-muted-foreground">Loading…</div>;
  }
  return (
    <div className="flex h-full flex-col justify-center p-6">
      <span className="text-xs uppercase text-muted-foreground">{data.city}</span>
      <span className="mt-1 text-4xl font-bold">{data.tempC}°C</span>
      <span className="mt-1 text-sm">{data.conditions}</span>
    </div>
  );
}
```

* Standard React — no special runtime. Tailwind classes work. `lucide-react` icons work (`import { Cloud } from 'lucide-react'`).
* `useBrickData<T>()` returns `T | undefined`. It is `undefined` until the plugin process has called `setBrickData(brickId, …)` for this brick type at least once.

The compiler rewrites imports of `react`, `react/jsx-runtime`, `lucide-react`, `@brika/sdk/brick-views`, `@brika/sdk/ui-kit*`, `clsx`, and `class-variance-authority` to lookups on `globalThis.__brika.*`, which the host UI populates before any brick is loaded. See [Externals Rewrite](../architecture/externals-rewrite.md).

## Hooks

All four hooks come from `@brika/sdk/brick-views` and only work inside brick render functions (they throw if imported elsewhere).

### `useBrickData<T>()` — server-pushed state

Subscribes to whatever the plugin process most recently called `setBrickData(brickId, data)` with. **Per brick type, not per instance** — every instance of `current-weather` on every board sees the same data.

```tsx
const data = useBrickData<WeatherData>();
```

Returns `undefined` until the first push. Re-renders on every subsequent push.

### `useBrickConfig()` — per-instance config

Returns the per-instance config the user filled in when they added this brick to a board. Schema is defined in the manifest's `bricks[*].config`.

```tsx
const config = useBrickConfig();
const city = typeof config.city === 'string' ? config.city : 'Zurich';
```

Returns a plain object — narrow types yourself.

### `useBrickSize()` — current grid size

```tsx
const { width, height } = useBrickSize();
```

Width and height in grid units (1 unit ≈ 80 px). Useful for switching between compact and expanded layouts:

```tsx
return width >= 3 ? <ExpandedView /> : <CompactView />;
```

### `useCallBrickAction()` — call a per-instance handler

```tsx
const callBrickAction = useCallBrickAction();
return <button onClick={() => callBrickAction('refresh')}>↻</button>;
```

Sends `{ actionId, payload?, instanceId }` to the plugin process. Handle it on the server with `onBrickConfigChange` (for config-driven actions) or by registering a brick action handler — see [Brick Rendering](../architecture/brick-rendering.md).

## Reacting to per-instance config on the server

If your brick lets each instance pick a different city, the plugin process needs to know about it so it can fetch the right data. Register `onBrickConfigChange`:

```ts
import { onBrickConfigChange, setBrickData } from '@brika/sdk';

const lastByCity = new Map<string, WeatherData>();

onBrickConfigChange((instanceId, config) => {
  const city = typeof config.city === 'string' ? config.city : 'Zurich';
  ensurePolling(city);
});
```

Then push **per-instance data** by routing it through a per-city pipeline and broadcasting once per change. `setBrickData` is plugin-wide, so the canonical pattern is to keep a per-instance map on the server and re-emit when any data changes.

## Per-instance data

`setBrickData(brickId, data)` is type-wide — every instance sees the same payload. For per-instance data, push a **dictionary** keyed by `instanceId`:

```ts
const byInstance = new Map<string, WeatherData>();

onBrickConfigChange((instanceId, config) => {
  // Recompute or refetch for that city, then:
  byInstance.set(instanceId, computed);
  setBrickData('current-weather', Object.fromEntries(byInstance));
});
```

Inside the brick:

```tsx
import { useBrickData, useBrickConfig } from '@brika/sdk/brick-views';

interface WeatherByInstance { [instanceId: string]: WeatherData }

export default function CurrentWeather() {
  const all = useBrickData<WeatherByInstance>();
  const config = useBrickConfig();
  // The runtime exposes our instanceId via config — see useCallBrickAction notes.
  // For most cases, key by config.city directly and skip the per-instance plumbing.
  return null;
}
```

For simple per-instance state, just key by a stable config field (`config.city`) and look it up. The dictionary pattern is for cases where the same config can produce different state per board.

## Sizes and families

Declare which sizes the brick supports in the manifest:

```json
"bricks": [
  {
    "id": "current-weather",
    "name": "Current Weather",
    "families": ["sm", "md", "lg"],
    "config": [
      { "type": "text", "name": "city", "label": "City", "default": "Zurich" }
    ]
  }
]
```

| Family | Approx grid size |
|---|---|
| `sm` | 1×1 |
| `md` | 2×1 |
| `lg` | 3×2 |
| `xl` | 4×2 |
| `2xl` | 4×3 |

The user can resize the brick on the board, but only within the families it declares. Read `useBrickSize()` to adapt the layout responsively.

## Tailwind

Tailwind classes work out of the box. The compiler scans your brick's source for class names, generates a scoped stylesheet, and injects it as a `<style data-brika-css>` tag at load time. Theme tokens defined in `:root` are rewritten to `[data-brika-css="…"]` to scope them to your brick so they cannot conflict with the host UI.

You can use the full Tailwind v4 vocabulary — utilities, modifiers, custom themes. You can't use Tailwind plugins that need a config file (the compiler doesn't see one).

See [Compiler](../architecture/compiler.md) for the full pipeline.

## What you cannot do in a brick

* **No `fetch`** — bricks run in the browser; if you fetch directly, you bypass the plugin's permission model. Call an [action](actions.md) instead.
* **No `import 'node:fs'`** — same reason; the import would fail to bundle.
* **No `defineRoute`** — those are server-only.
* **No long-lived background tasks** — the brick is unmounted when the user navigates away.

Anything that needs server-side context (HTTP, secrets, filesystem) belongs in the plugin process, exposed to the brick via `setBrickData` (push) or actions (pull).

## See also

* **[Pages](pages.md)** — full-screen routes (similar pattern, different host).
* **[Actions](actions.md)** — calling server-side handlers from bricks.
* **[Architecture — Brick Rendering](../architecture/brick-rendering.md)** — the host's loading machinery.
* **[Architecture — Externals Rewrite](../architecture/externals-rewrite.md)** — `globalThis.__brika.*`.
