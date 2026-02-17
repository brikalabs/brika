# Bricks

Bricks are dashboard UI components provided by plugins. Each brick renders as a resizable card on the dashboard, adapts to its grid size, and manages its own state through a lightweight hook system.

Bricks don't produce DOM elements. They return **descriptor nodes** — plain objects like `{ type: 'text', content: 'Hello' }` — that the hub renders natively. The SDK diffs these descriptors and sends only mutations over IPC, keeping communication minimal.

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

**2. Define the component**

```tsx
// src/bricks/hello.tsx
import { defineBrick, useState, Stat, Toggle, defineSharedStore } from '@brika/sdk/bricks';

export const helloBrick = defineBrick(
  { id: 'hello', name: 'Hello', families: ['sm', 'md'] },
  () => {
    const [on, setOn] = useState(false);
    return (
      <>
        <Stat label="Status" value={on ? 'Active' : 'Idle'} icon="zap" />
        <Toggle label="Power" checked={on} onToggle={(p) => setOn(p?.checked as boolean ?? !on)} />
      </>
    );
  },
);
```

**3. Export from entry**

```tsx
// src/index.tsx
export { helloBrick } from './bricks/hello';
```

`defineBrick()` auto-registers with the hub at import time.

## How It Works

Each brick type has:
- **Spec** — static metadata: id, icon, families, config schema
- **Component** — a function using hooks that returns descriptor nodes
- **Instances** — each dashboard placement gets isolated state and config

Placing the same brick type twice creates two fully independent instances with their own hooks state.

### JSX Setup

Bricks use a custom JSX runtime from `@brika/ui-kit` (not React). Add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@brika/ui-kit"
  }
}
```

Files must use `.tsx` extension. Fragments (`<>...</>`) flatten children into arrays. Components can also be called as plain functions: `Stat({ label: 'Temp', value: 21 })`.

## Brick Type Spec

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Must match `package.json` entry |
| `name` | `string` | No | Display name |
| `icon` | `string` | No | Lucide icon name |
| `color` | `string` | No | Accent color (hex) |
| `families` | `('sm' \| 'md' \| 'lg')[]` | Yes | Supported catalog sizes |
| `minSize` / `maxSize` | `{ w, h }` | No | Grid size constraints |
| `config` | `PreferenceDefinition[]` | No | Per-instance config schema |

## Hooks

Import from `@brika/sdk/bricks`. React-like semantics, custom implementation.

### useState

```tsx
const [count, setCount] = useState(0);
setCount(count + 1);          // direct
setCount((prev) => prev + 1); // functional update
```

Triggers re-render on change (`Object.is` comparison).

### useEffect

```tsx
useEffect(() => {
  const id = setInterval(() => setCount((c) => c + 1), 1000);
  return () => clearInterval(id); // cleanup on unmount or re-run
}, []);
```

Deferred via `queueMicrotask`. Always return cleanup functions to prevent leaks.

### useMemo / useCallback

```tsx
const formatted = useMemo(() => formatDuration(seconds), [seconds]);
const handler = useCallback(() => doSomething(), [dep]);
```

### useRef

```tsx
const timerRef = useRef<Timer | null>(null);
```

Persistent mutable ref — survives re-renders without triggering them.

### useBrickSize

```tsx
const { width, height } = useBrickSize();
```

Returns current grid dimensions. Updates on resize without unmounting.

### usePreference

```tsx
// Read a single config value
const [unit] = usePreference<string>('unit', 'celsius');

// Full config object
const config = usePreference<{ unit: string; interval: number }>();
```

Reads per-instance configuration (set by user in the config sheet).

### usePluginPreference

```tsx
const apiKey = usePluginPreference<string>('apiKey', '');
```

Read a plugin-level (global) preference. Read-only within bricks.

### Actions (auto-registered)

Pass handler functions directly to interactive props — no manual registration needed:

```tsx
<Toggle label="Power" checked={on} onToggle={(p) => setOn(p?.checked as boolean ?? !on)} />
<Slider label="Vol" value={vol} min={0} max={100} onChange={(p) => setVol(p?.value as number)} />
<Button label="Refresh" onPress={() => fetchData()} />
```

Payloads: Toggle → `{ checked }`, Slider → `{ value }`, Button → `undefined`.

## Components

Import from `@brika/sdk/bricks`.

### Data Display

| Component | Key Props | Description |
|-----------|-----------|-------------|
| **Stat** | `label`, `value`, `unit?`, `icon?`, `trend?`, `color?` | Key metric |
| **Status** | `label`, `status`, `icon?`, `color?` | Online/offline indicator |
| **Text** | `content`, `variant?` (`body`/`caption`/`heading`), `color?` | Text content |
| **Badge** | `label`, `variant?` (`default`/`success`/`warning`/`destructive`), `icon?` | Inline tag |
| **Icon** | `name`, `size?` (`sm`/`md`/`lg`), `color?` | Standalone Lucide icon |
| **Progress** | `value` (0-100), `label?`, `color?`, `showValue?` | Progress bar |

### Interactive

| Component | Key Props | Description |
|-----------|-----------|-------------|
| **Button** | `label`, `onPress`, `icon?`, `variant?` | Clickable button |
| **Toggle** | `label`, `checked`, `onToggle`, `icon?` | Switch control |
| **Slider** | `label`, `value`, `min`, `max`, `onChange`, `step?`, `unit?` | Range input |

### Media

| Component | Key Props | Description |
|-----------|-----------|-------------|
| **Image** | `src`, `alt?`, `fit?`, `rounded?`, `aspectRatio?`, `caption?` | Image display |
| **Video** | `src`, `format` (`hls`/`mjpeg`), `poster?`, `muted?` | Video/stream player |
| **Chart** | `variant` (`line`/`area`/`bar`), `data`, `color?`, `label?` | Data visualization |

### Layout

| Component | Key Props | Description |
|-----------|-----------|-------------|
| **Stack** | `direction`, `gap?`, `align?`, `justify?`, `wrap?`, `grow?` | Flex container |
| **Grid** | `columns?`, `gap?` | Grid container |
| **Section** | `title` | Titled section wrapper |
| **Box** | `background?`, `blur?`, `padding?`, `rounded?`, `grow?` | Styled container |
| **Divider** | `direction?`, `color?` | Separator line |
| **Spacer** | `size?` | Fixed or flexible spacing |

## Responsive Design

Use `useBrickSize()` to adapt layout based on grid dimensions:

```tsx
const { width, height } = useBrickSize();

if (width <= 2) {
  return <Stat label="Temp" value="21°C" icon="thermometer" />;
}

if (width <= 4) {
  return (
    <Grid columns={2} gap="sm">
      <Stat label="Temp" value="21°C" />
      <Stat label="Humidity" value="45%" />
    </Grid>
  );
}

return (
  <Section title="Environment">
    <Grid columns={3} gap="sm">
      <Stat label="Temp" value="21°C" />
      <Stat label="Humidity" value="45%" />
      <Stat label="Wind" value="12 km/h" />
    </Grid>
    {height >= 4 && <Chart variant="area" data={history} />}
  </Section>
);
```

Gate content by both width and height. Charts need `height >= 4`, extra controls need `height >= 3`.

## Shared Store (`defineSharedStore`)

When multiple instances need shared state (e.g., a music player polling once for all instances), use `defineSharedStore` — a Zustand-style reactive store:

```tsx

// Define at module level (shared across all instances)
const usePlayerStore = defineSharedStore<PlayerState>({
  playback: null,
  isAuthed: false,
  loaded: false,
});
```

### Usage

```tsx
// Inside a brick — reactive subscription
const { playback, loaded } = usePlayerStore();

// Outside a brick — write
usePlayerStore.set({ playback: data, loaded: true });
usePlayerStore.set((prev) => ({ ...prev, loaded: true }));

// Synchronous read (no subscription)
const current = usePlayerStore.get();
```

| Method | Description |
|--------|-------------|
| `store()` | Hook — read state reactively, subscribes the instance |
| `store.get()` | Read current state synchronously |
| `store.set(value)` | Update state, notify subscribers (`Object.is` comparison) |

### Pattern: Single Poller, Many Consumers

```tsx
const useData = defineSharedStore<Data | null>(null);
let subs = 0;
let timer: Timer | null = null;

function acquire() {
  if (++subs === 1) {
    timer = setInterval(async () => useData.set(await fetchData()), 5000);
  }
}

function release() {
  if (--subs === 0 && timer) { clearInterval(timer); timer = null; }
}

export const myBrick = defineBrick({ ... }, () => {
  const data = useData();
  useEffect(() => { acquire(); return release; }, []);

  if (!data) return <Text content="Loading..." variant="caption" />;
  return <Stat label="Value" value={data.value} />;
});
```

One polling loop regardless of instance count. First instance starts it, last one stops it.

## Instance Configuration

Declare config in `package.json`:

```json
{
  "bricks": [{
    "id": "my-brick",
    "config": [
      { "type": "text", "name": "title", "default": "Untitled" },
      { "type": "number", "name": "interval", "default": 5000, "min": 1000 },
      { "type": "checkbox", "name": "autoRefresh", "default": true },
      { "type": "dropdown", "name": "unit", "options": [{"value": "celsius"}, {"value": "fahrenheit"}] }
    ]
  }]
}
```

| Type | Value type | Extra props |
|------|-----------|-------------|
| `text` | `string` | `default?` |
| `number` | `number` | `default?`, `min?`, `max?`, `step?` |
| `checkbox` | `boolean` | `default?` |
| `dropdown` | `string` | `default?`, `options` |

Read in the component:

```tsx
const [unit] = usePreference<string>('unit', 'celsius');
const [interval] = usePreference<number>('interval', 5000);
```

## Pitfalls

### Conditional Children Before Siblings

The reconciler tracks nodes by index. `{cond && <X/>}` before siblings shifts all indices when the condition changes:

```tsx
// BAD — shifts sibling indices
<>
  {show && <Spacer />}
  <Text content="hello" />
</>

// GOOD — ternary keeps stable count
<>
  {show ? <Spacer /> : <Box padding="none" />}
  <Text content="hello" />
</>

// GOOD — use layout props instead
<Stack direction="vertical" justify={show ? 'end' : 'start'}>
  <Text content="hello" />
</Stack>

// OK — trailing conditionals are fine
<>
  <Text content="hello" />
  {show && <Chart variant="line" data={data} />}
</>
```

### Effect Cleanup

Always return cleanup functions from `useEffect`. Forgetting cleanup causes interval/timer leaks across re-renders:

```tsx
useEffect(() => {
  const id = setInterval(poll, 5000);
  return () => clearInterval(id); // required
}, []);
```

## Next Steps

- [Reactive Blocks](reactive-blocks.md) — Workflow block definitions
- [Lifecycle Hooks](lifecycle-hooks.md) — Plugin lifecycle management
- [Preferences](../api-reference/preferences.md) — Plugin-level configuration
