# BRIKA

A Bun-first home automation runtime. Write type-safe plugins, wire them into visual workflows, and build live dashboards — all from a single codebase.

## Why BRIKA?

Most home automation platforms force you to choose between power and simplicity. BRIKA gives you both: a visual block editor for automations and a full React-based brick system for dashboards, backed by an SDK that handles IPC, compilation, and hot reload so you can focus on your logic.

**Blocks** power workflows — reactive, type-safe data pipelines that connect triggers to actions.
**Bricks** power dashboards — real React components rendered in the browser, fed by your plugin process.

## At a Glance

```tsx
// Plugin process (Bun) — fetch data, push to dashboard
import { setBrickData, onInit, defineSharedStore } from '@brika/sdk';

const weather = defineSharedStore<WeatherData | null>(null);

onInit(async () => {
  weather.set(await fetchWeather('Zurich'));
});

weather.subscribe(() => {
  const data = weather.get();
  if (data) setBrickData('current', data);
});
```

```tsx
// Browser component — renders on the dashboard
import { useBrickData } from '@brika/sdk/brick-views';

export default function CurrentWeather() {
  const data = useBrickData<WeatherData>();
  if (!data) return <div className="p-4 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-4" style={{ background: data.gradient }}>
      <span className="text-3xl font-bold text-white">{data.temperature}°C</span>
    </div>
  );
}
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Reactive Blocks** | Type-safe workflow nodes with Zod schemas and composable stream operators |
| **Client-Rendered Bricks** | Dashboard components written as real React, compiled to browser ESM with scoped Tailwind |
| **Plugin Isolation** | Each plugin runs in a separate Bun process — crash one, the rest keep running |
| **Visual Editor** | Drag-and-drop workflow builder powered by React Flow |
| **Build-Time Compilation** | `@brika/compiler` handles externals, action IDs, and content-hashed caching |
| **Typed Actions** | Define server-side functions, call them from the browser — IDs auto-generated at build time |

## Quick Start

```bash
# Clone and install
git clone https://github.com/maxscharwath/brika.git
cd brika
bun install

# Start development
bun run dev
```

* **UI**: http://localhost:5173
* **API**: http://localhost:3001/api/health

### Create a Plugin

```bash
bun create brika my-plugin
```

Interactive CLI scaffolds a complete plugin with TypeScript config, block/brick templates, and i18n.

### Docker

```bash
docker run -d \
  --name brika \
  -p 3001:3001 \
  -v ./config:/app/.brika \
  maxscharwath/brika:latest
```

UI and API available at http://localhost:3001.

## Platform

| Component | Role |
|-----------|------|
| **Hub** | Bun runtime — manages plugins, workflows, and the REST/SSE API |
| **UI** | React frontend — visual editor, dashboard, plugin management |
| **SDK** | Plugin development kit — blocks, bricks, actions, stores, lifecycle |
| **Compiler** | Build-time tooling — compiles brick modules, injects action IDs, validates manifests |
| **Plugins** | Isolated Bun processes that provide blocks and bricks |

## Tech Stack

| Layer | Stack |
|-------|-------|
| Runtime | Bun, TypeScript, Zod v4 |
| Frontend | React, Vite, TanStack Router/Query |
| UI | shadcn/ui, Tailwind CSS v4, React Flow |
| Compiler | @brika/compiler (Bun.build) |
| IPC | Custom binary protocol |

## What's Next

* [Getting Started](basics/getting-started.md) — Set up your development environment
* [Create Your First Plugin](plugins/create-plugin.md) — Build a reactive block
* [Bricks](plugins/bricks.md) — Build client-rendered dashboard components
* [SDK Reference](api-reference/sdk.md) — Explore the full API
* [Architecture](architecture/overview.md) — Understand the system design

## Links

* [Documentation](https://docs.brika.dev)
* [GitHub](https://github.com/maxscharwath/brika)
* [Docker Hub](https://hub.docker.com/r/maxscharwath/brika)
