# Core Concepts

Brika introduces a small vocabulary that recurs throughout the docs, the UI, and the SDK. This page defines each term and links to the deeper page that owns its details.

## The pieces

### Hub

The **hub** is the Brika server. A single Bun process that:

* Serves the REST and SSE API on a TCP port (default `127.0.0.1:3001`).
* Spawns and supervises every plugin process.
* Persists state, configuration, secrets, and logs to the `.brika/` directory.
* Hosts the React UI as static files (or proxies to the Vite dev server in development).

Deep dive: [Hub Server](../architecture/hub.md).

### Plugin

A **plugin** is a Bun-runnable npm package that contributes some combination of blocks, bricks, pages, sparks, actions, and HTTP routes. Each installed plugin runs in its **own child process**, isolated from the hub and from every other plugin. A crashed plugin does not take down the hub or other plugins.

Plugins live in `.brika/plugins/`. They are installed from the curated registry (via the **Plugins → Registry** UI), from npm directly, or from a local workspace path (`workspace:./path`).

Deep dive: [Plugin Overview](../plugins/overview.md), [Plugin Supervisor](../architecture/plugin-supervisor.md).

### Block

A **block** is a reactive workflow node defined by a plugin. Every block has:

* **Inputs** — typed ports that receive values.
* **Outputs** — typed ports that emit values.
* **Config** — a Zod-typed object the user fills in when they place the block on a workflow.
* **Reactive setup** — a function that wires inputs to outputs using stream operators.

Blocks fall into four categories: **trigger** (no inputs, emits on a schedule or event), **transform** (one or more inputs, one or more outputs), **flow** (control flow — branch, merge, delay), **action** (terminal — performs a side effect).

Deep dive: [Reactive Blocks](../plugins/reactive-blocks.md), [Reactive Streams](../plugins/reactive-streams.md).

### Workflow

A **workflow** is a graph of blocks. The user drags blocks onto a canvas, connects outputs to inputs, fills in each block's config, and enables the workflow. The hub instantiates each block in its plugin's process, wires their flows together, and lets the runtime push data through the graph.

Workflows have IDs, names, enabled/disabled state, and (optionally) a category. You can have many workflows running concurrently.

### Brick

A **brick** is a dashboard component. It is a real React component bundled and shipped by a plugin, but it runs **in the browser** — not in the plugin process. The plugin process pushes data to all instances of a brick by calling `setBrickData(brickTypeId, data)`; the brick reads it with `useBrickData()`.

Bricks declare which grid **families** they support (small / medium / large), an optional config schema (per-instance settings the user picks), and an optional action interface (`useCallBrickAction()` invokes a server-side handler).

Deep dive: [Bricks](../plugins/bricks.md), [Brick Rendering](../architecture/brick-rendering.md).

### Board

A **board** is a responsive grid of brick instances. Users create boards, drop bricks onto them, resize and rearrange, and save the layout. Each brick instance can have its own config — same `weather` brick rendered three times for three cities, for example.

Boards are not workflows: they have no graph, no triggers, no reactive wiring. They are pure presentation, fed live data by their respective plugins over the shared SSE channel.

### Page

A **page** is a full-screen React route a plugin owns. Pages get their own URL under the hub UI and can use the full power of the brick UI primitives plus extra hooks like `useAction` to call server actions. Use pages for plugin-specific admin UIs (a Spotify connection manager, a Matter device pairing wizard).

Deep dive: [Pages](../plugins/pages.md).

### Action

An **action** is a typed server-side RPC the UI can call. Plugins declare actions with `defineAction({ handler })` and the compiler generates a deterministic ID for each one. From a page or a brick the UI imports the action reference (`import { listFiles } from './actions'`) and calls it via `useAction(listFiles)` or `useCallAction()`. The hub routes the call to the plugin process and returns the result.

Deep dive: [Actions](../plugins/actions.md).

### Spark

A **spark** is a typed event broadcast on a global bus. Plugins declare sparks with `defineSpark({ id, schema })` and emit them with `.emit(payload)`. Any block can subscribe to a spark as a stream source. Useful when "one thing happens, many things might care" — a Matter device pairs successfully → notify, log, update a dashboard.

Deep dive: [Sparks](../plugins/sparks.md).

### Shared store

A **shared store** is in-process reactive state for a plugin. `defineSharedStore(initial)` returns an object with `.get()`, `.set()`, and `.subscribe()` — Zustand-style. Useful for state that multiple blocks within the same plugin need to coordinate around.

Deep dive: [Shared Stores](../plugins/shared-stores.md).

## The runtime in one diagram

```
                  ┌───────────────────────────────────────────────────┐
                  │  Browser                                          │
                  │  ┌──────────────┐    ┌──────────────────────────┐ │
                  │  │  UI (React)  │◀──▶│  Brick / Page components │ │
                  │  └──────┬───────┘    └──────────────────────────┘ │
                  └─────────┼─────────────────────────────────────────┘
                            │ REST + SSE
                  ┌─────────▼─────────────────────────────────────────┐
                  │  Hub (Bun)                                        │
                  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
                  │  │  Router  │ │ Workflow │ │ Plugin Supervisor│  │
                  │  └──────────┘ │  Runtime │ └────────┬─────────┘  │
                  │               └──────────┘          │             │
                  └────────────────────┬────────────────┼─────────────┘
                                       │ Binary IPC (Bun "advanced" serialization)
                                ┌──────┴───────┬─────────────┐
                                ▼              ▼             ▼
                          ┌─────────┐    ┌─────────┐   ┌─────────┐
                          │ Plugin  │    │ Plugin  │   │ Plugin  │
                          │ process │    │ process │   │ process │
                          └─────────┘    └─────────┘   └─────────┘
```

* Each plugin is a separate Bun subprocess; the hub talks to it over Bun's IPC channel using a typed message protocol — see [IPC Protocol](../architecture/ipc-protocol.md).
* Browsers connect to the hub over HTTP/SSE. The UI lazy-imports brick modules from the hub by URL (content-hashed for cache eternity) and renders them inside a context that provides `useBrickData`/`useBrickConfig`/`useBrickSize` — see [Externals Rewrite](../architecture/externals-rewrite.md) and [Brick Rendering](../architecture/brick-rendering.md).
* The workflow runtime instantiates blocks by sending a `startBlock` RPC to the relevant plugin process. From then on inputs and outputs travel as `pushInput` and `blockEmit` messages.

## What to read next

* **[The .brika Directory](data-directory.md)** — how the runtime state is laid out on disk.
* **[Reactive Blocks](../plugins/reactive-blocks.md)** — the SDK reference for defining blocks.
* **[System Overview](../architecture/overview.md)** — process model, IPC, compilation pipeline.
